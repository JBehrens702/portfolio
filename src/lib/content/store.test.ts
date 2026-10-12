import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentValidationError } from "./schema";
import {
  ContentConflictError,
  contentConfigFromEnv,
  contentPaths,
  createBlobContentStore,
  createMemoryContentStore,
} from "./store";
import { makeSite } from "./test-fixtures";

// A small fake of the Blob SDK for the conditional-write tests of the Blob
// backend (KTD3). It keeps one ETag per pathname, and a put with an old
// `ifMatch` throws the SDK's own BlobPreconditionFailedError. The memory-store
// tests in this file do not touch it.
const blob = vi.hoisted(() => ({
  files: new Map<string, { body: string; etag: string }>(),
  next: 0,
  puts: [] as Record<string, unknown>[],
  // The real store answers a compressed read with a weak ETag (W/"…") of the same hash.
  weakReads: false,
}));

vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return {
    ...actual,
    get: vi.fn(async (pathname: string) => {
      const file = blob.files.get(pathname);
      if (!file) return null;
      const etag = blob.weakReads ? `W/${file.etag}` : file.etag;
      return { statusCode: 200, stream: new Response(file.body).body, blob: { pathname, etag } };
    }),
    put: vi.fn(async (pathname: string, body: string, options: Record<string, unknown>) => {
      blob.puts.push(options);
      const current = blob.files.get(pathname);
      if (options.ifMatch !== undefined && options.ifMatch !== current?.etag) {
        throw new actual.BlobPreconditionFailedError();
      }
      if (options.allowOverwrite === false && current) throw new actual.BlobError("This blob already exists.");
      const etag = `"etag-${++blob.next}"`;
      blob.files.set(pathname, { body, etag });
      return { pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}`, etag };
    }),
  };
});

afterEach(() => {
  blob.files.clear();
  blob.puts = [];
});

const config = { root: "test-root", secret: "s3cret-segment-0123456789" };

describe("contentConfigFromEnv", () => {
  it("reads CONTENT_ROOT and CONTENT_PATH_SECRET", () => {
    expect(contentConfigFromEnv({ CONTENT_ROOT: "site", CONTENT_PATH_SECRET: config.secret })).toEqual({
      root: "site",
      secret: config.secret,
    });
  });

  it("refuses a missing root, a missing secret, and a short secret", () => {
    expect(() => contentConfigFromEnv({ CONTENT_PATH_SECRET: config.secret })).toThrow(/CONTENT_ROOT/);
    expect(() => contentConfigFromEnv({ CONTENT_ROOT: "site" })).toThrow(/CONTENT_PATH_SECRET/);
    expect(() => contentConfigFromEnv({ CONTENT_ROOT: "site", CONTENT_PATH_SECRET: "short" })).toThrow(
      /CONTENT_PATH_SECRET/,
    );
    expect(() => contentConfigFromEnv({ CONTENT_ROOT: "../x", CONTENT_PATH_SECRET: config.secret })).toThrow(
      /CONTENT_ROOT/,
    );
  });
});

describe("contentPaths", () => {
  it("puts everything under the root, and the draft and history under the secret segment", () => {
    const paths = contentPaths(config);
    expect(paths.published).toBe("test-root/published.json");
    expect(paths.draft).toBe(`test-root/${config.secret}/draft.json`);
    expect(paths.historyPrefix).toBe(`test-root/${config.secret}/history/`);
    expect(paths.mediaPrefix).toBe("test-root/media/");
  });
});

describe("in-memory content store", () => {
  it("returns null before anything is written", async () => {
    const { store } = createMemoryContentStore(config);
    expect(await store.readDraft()).toBeNull();
    expect(await store.readPublished()).toBeNull();
    expect(await store.listHistory()).toEqual([]);
  });

  it("writes and reads the draft and the published document at their paths", async () => {
    const { store, backend } = createMemoryContentStore(config);
    const draft = makeSite();
    const published = makeSite({ software: [] });
    await store.writeDraft(draft);
    await store.writePublished(published);
    expect(await store.readDraft()).toEqual(draft);
    expect(await store.readPublished()).toEqual(published);
    expect([...backend.files.keys()].sort()).toEqual([contentPaths(config).draft, contentPaths(config).published].sort());
  });

  it("returns the second version after two saves in quick succession", async () => {
    const { store } = createMemoryContentStore(config);
    await store.writeDraft(makeSite({ software: [] }));
    const second = makeSite();
    second.profile.tagline = "Second version";
    await store.writeDraft(second);
    expect((await store.readDraft())?.profile.tagline).toBe("Second version");
  });

  it("refuses to save an invalid draft and keeps the old one", async () => {
    const { store } = createMemoryContentStore(config);
    const valid = makeSite();
    await store.writeDraft(valid);
    const invalid = makeSite();
    invalid.experiences[0].pageTitle = "";
    await expect(store.writeDraft(invalid)).rejects.toBeInstanceOf(ContentValidationError);
    expect(await store.readDraft()).toEqual(valid);
  });

  it("gives a copy, so a change to a read document does not change the store", async () => {
    const { store } = createMemoryContentStore(config);
    await store.writeDraft(makeSite());
    const read = await store.readDraft();
    read!.profile.name = "Changed";
    expect((await store.readDraft())?.profile.name).toBe("Jonathan Behrens");
  });

  it("throws ContentValidationError when a stored document is invalid", async () => {
    const { store, backend } = createMemoryContentStore(config);
    await backend.write(contentPaths(config).draft, { schemaVersion: 1 });
    await expect(store.readDraft()).rejects.toBeInstanceOf(ContentValidationError);
  });

  it("copies the published document to history, or returns null when none exists", async () => {
    let tick = 0;
    const { store } = createMemoryContentStore(config, { now: () => new Date(Date.UTC(2026, 9, 8, 12, 0, tick++)) });
    expect(await store.copyPublishedToHistory()).toBeNull();
    const published = makeSite();
    await store.writePublished(published);
    const first = await store.copyPublishedToHistory();
    const second = await store.copyPublishedToHistory();
    expect(first).toMatch(new RegExp(`^test-root/${config.secret}/history/2026-10-08T12-00-0\\dZ?.*\\.json$`));
    expect(await store.listHistory()).toEqual([first, second]);
    expect(await store.readHistory(first!)).toEqual(published);
  });
});

describe("conditional draft writes, in-memory store (KTD3)", () => {
  function withTagline(tagline: string) {
    const site = makeSite();
    site.profile.tagline = tagline;
    return site;
  }

  it("reads the draft with a version, or null when none exists", async () => {
    const { store } = createMemoryContentStore(config);
    expect(await store.readDraftVersioned()).toBeNull();
    await store.writeDraft(withTagline("First"));
    const read = await store.readDraftVersioned();
    expect(read?.site.profile.tagline).toBe("First");
    expect(typeof read?.version).toBe("string");
  });

  it("writes with the version from the last read, and returns a new version that the next read gives", async () => {
    const { store } = createMemoryContentStore(config);
    await store.writeDraft(withTagline("First"));
    const read = await store.readDraftVersioned();
    const written = await store.writeDraftIfCurrent(withTagline("Second"), read!.version);
    expect(written.site.profile.tagline).toBe("Second");
    expect(written.version).not.toBe(read!.version);
    expect(await store.readDraftVersioned()).toEqual(written);
  });

  it("refuses a write with an old version with ContentConflictError, and leaves the draft unchanged", async () => {
    const { store, backend } = createMemoryContentStore(config);
    await store.writeDraft(withTagline("First"));
    const tabA = await store.readDraftVersioned();
    const tabB = await store.readDraftVersioned();
    await store.writeDraftIfCurrent(withTagline("Tab A"), tabA!.version);
    const writes = backend.writes.length;
    await expect(store.writeDraftIfCurrent(withTagline("Tab B"), tabB!.version)).rejects.toBeInstanceOf(
      ContentConflictError,
    );
    expect(backend.writes).toHaveLength(writes);
    expect((await store.readDraft())?.profile.tagline).toBe("Tab A");
  });

  it("refuses an old version after an unconditional write, so Publish-side writes also count", async () => {
    const { store } = createMemoryContentStore(config);
    await store.writeDraft(withTagline("First"));
    const read = await store.readDraftVersioned();
    await store.writeDraft(withTagline("Reset"));
    await expect(store.writeDraftIfCurrent(withTagline("Late"), read!.version)).rejects.toBeInstanceOf(
      ContentConflictError,
    );
    expect((await store.readDraft())?.profile.tagline).toBe("Reset");
  });

  it("still overwrites with no expected version (writeDraft keeps working)", async () => {
    const { store } = createMemoryContentStore(config);
    await store.writeDraft(withTagline("First"));
    await store.readDraftVersioned();
    await store.writeDraft(withTagline("Unconditional"));
    expect((await store.readDraft())?.profile.tagline).toBe("Unconditional");
  });

  it("with the version null, creates the draft only when none exists", async () => {
    const { store } = createMemoryContentStore(config);
    const created = await store.writeDraftIfCurrent(withTagline("Created"), null);
    expect(created.site.profile.tagline).toBe("Created");
    await expect(store.writeDraftIfCurrent(withTagline("Second create"), null)).rejects.toBeInstanceOf(
      ContentConflictError,
    );
    expect((await store.readDraft())?.profile.tagline).toBe("Created");
  });

  it("validates before a conditional write, and writes nothing when invalid", async () => {
    const { store } = createMemoryContentStore(config);
    await store.writeDraft(withTagline("First"));
    const read = await store.readDraftVersioned();
    const invalid = makeSite();
    invalid.experiences[0].pageTitle = "";
    await expect(store.writeDraftIfCurrent(invalid, read!.version)).rejects.toBeInstanceOf(ContentValidationError);
    expect(await store.readDraftVersioned()).toEqual(read);
  });
});

describe("conditional draft writes, Blob backend with a fake SDK (KTD3)", () => {
  const credentials = { storeId: "store_test" };

  it("reads the ETag as the version, and writes with ifMatch", async () => {
    const store = createBlobContentStore(config, { credentials });
    await store.writeDraft(makeSite());
    expect(blob.puts.at(-1)).not.toHaveProperty("ifMatch");
    const read = await store.readDraftVersioned();
    expect(read?.version).toBe(blob.files.get(store.paths.draft)?.etag);
    const written = await store.writeDraftIfCurrent(makeSite({ software: [] }), read!.version);
    expect(blob.puts.at(-1)).toMatchObject({ ifMatch: read!.version });
    expect(written.version).toBe(blob.files.get(store.paths.draft)?.etag);
  });

  it("maps BlobPreconditionFailedError to ContentConflictError, and leaves the draft unchanged", async () => {
    const store = createBlobContentStore(config, { credentials });
    const first = makeSite();
    first.profile.tagline = "First";
    await store.writeDraft(first);
    const stale = await store.readDraftVersioned();
    const tabA = makeSite();
    tabA.profile.tagline = "Tab A";
    await store.writeDraftIfCurrent(tabA, stale!.version);
    await expect(store.writeDraftIfCurrent(makeSite(), stale!.version)).rejects.toBeInstanceOf(ContentConflictError);
    expect((await store.readDraft())?.profile.tagline).toBe("Tab A");
  });

  it("reads a weak ETag from a compressed response as the strong version that ifMatch accepts", async () => {
    const store = createBlobContentStore(config, { credentials });
    await store.writeDraft(makeSite());
    blob.weakReads = true;
    try {
      const read = await store.readDraftVersioned();
      expect(read?.version).toBe(blob.files.get(store.paths.draft)?.etag);
      await expect(store.writeDraftIfCurrent(makeSite({ software: [] }), read!.version)).resolves.toBeDefined();
    } finally {
      blob.weakReads = false;
    }
  });

  it("with the version null, refuses when a draft already exists", async () => {
    const store = createBlobContentStore(config, { credentials });
    await store.writeDraftIfCurrent(makeSite(), null);
    expect(blob.puts.at(-1)).toMatchObject({ allowOverwrite: false });
    await expect(store.writeDraftIfCurrent(makeSite(), null)).rejects.toBeInstanceOf(ContentConflictError);
  });
});
