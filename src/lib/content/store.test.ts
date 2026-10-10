import { describe, expect, it } from "vitest";
import { ContentValidationError } from "./schema";
import {
  contentConfigFromEnv,
  contentPaths,
  createMemoryContentStore,
} from "./store";
import { makeSite } from "./test-fixtures";

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
