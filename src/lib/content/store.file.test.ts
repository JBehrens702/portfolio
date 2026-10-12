import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publish } from "./publish";
import { parseSite } from "./schema";
import {
  ContentConflictError,
  contentSourceFromEnv,
  createContentStore,
  createContentStoreFromEnv,
  createFileBackend,
  type JsonBackend,
} from "./store";
import { makeSite } from "./test-fixtures";

const config = { root: "local", secret: "local-secret-segment" };

describe("file backend", () => {
  let folder: string;
  let backend: JsonBackend;

  beforeEach(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "content-"));
    backend = createFileBackend(folder);
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("reads null for a missing document", async () => {
    expect(await backend.read("local/published.json")).toBeNull();
  });

  it("writes and reads back a document in nested folders, with no temporary file left", async () => {
    await backend.write("local/a/b/doc.json", { n: 1 });
    await backend.write("local/a/b/doc.json", { n: 2 });
    expect(await backend.read("local/a/b/doc.json")).toEqual({ n: 2 });
    expect(await readdir(path.join(folder, "local", "a", "b"))).toEqual(["doc.json"]);
  });

  it("lists the pathnames under a prefix, with forward slashes", async () => {
    await backend.write("local/x/history/1.json", 1);
    await backend.write("local/x/history/2.json", 2);
    await backend.write("local/published.json", 3);
    expect((await backend.list("local/x/history/")).sort()).toEqual([
      "local/x/history/1.json",
      "local/x/history/2.json",
    ]);
    expect(await backend.list("other/")).toEqual([]);
  });

  it("refuses a pathname that leaves the folder", async () => {
    await expect(backend.read("../outside.json")).rejects.toThrow(/Unsafe/);
    await expect(backend.write("local/../../x.json", {})).rejects.toThrow(/Unsafe/);
    await expect(backend.read("/etc/passwd")).rejects.toThrow(/Unsafe/);
  });

  it("supports the full store logic: draft, publish, history", async () => {
    const store = createContentStore(backend, config);
    await store.writeDraft(makeSite());
    const first = await publish(store);
    expect(first).toMatchObject({ ok: true, historyPath: null });
    const second = await publish(store);
    expect(second.ok && second.historyPath).toMatch(/^local\/local-secret-segment\/history\//);
    expect(await store.listHistory()).toHaveLength(1);
    expect((await store.readPublished())?.profile.name).toBe("Jonathan Behrens");
  });

  it("reads the Playwright fixture as a valid published document", async () => {
    const fixtures = createFileBackend(path.resolve(__dirname, "../../../e2e/fixtures/content"));
    const value = await fixtures.read("e2e/published.json");
    const result = parseSite(value);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it("reads a version that changes when the file's bytes change", async () => {
    expect(await backend.readVersioned("local/doc.json")).toBeNull();
    const first = await backend.write("local/doc.json", { n: 1 });
    const read = await backend.readVersioned("local/doc.json");
    expect(read).toEqual({ value: { n: 1 }, version: first });
    const second = await backend.write("local/doc.json", { n: 2 });
    expect(second).not.toBe(first);
    expect((await backend.readVersioned("local/doc.json"))?.version).toBe(second);
  });
});

describe("conditional draft writes, file store (KTD3)", () => {
  let folder: string;
  let backend: JsonBackend;

  beforeEach(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "content-"));
    backend = createFileBackend(folder);
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  function withTagline(tagline: string) {
    const site = makeSite();
    site.profile.tagline = tagline;
    return site;
  }

  it("writes with the version from the last read, and returns a new version that the next read gives", async () => {
    const store = createContentStore(backend, config);
    await store.writeDraft(withTagline("First"));
    const read = await store.readDraftVersioned();
    const written = await store.writeDraftIfCurrent(withTagline("Second"), read!.version);
    expect(written.version).not.toBe(read!.version);
    expect(await store.readDraftVersioned()).toEqual(written);
  });

  it("refuses a write with an old version with ContentConflictError, and leaves the draft file unchanged", async () => {
    const store = createContentStore(backend, config);
    await store.writeDraft(withTagline("First"));
    const tabA = await store.readDraftVersioned();
    const tabB = await store.readDraftVersioned();
    await store.writeDraftIfCurrent(withTagline("Tab A"), tabA!.version);
    const file = path.join(folder, ...store.paths.draft.split("/"));
    const before = await readFile(file, "utf8");
    await expect(store.writeDraftIfCurrent(withTagline("Tab B"), tabB!.version)).rejects.toBeInstanceOf(
      ContentConflictError,
    );
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await readdir(path.dirname(file))).toEqual(["draft.json"]);
  });

  it("lets only one of two concurrent writes with the same version succeed", async () => {
    const store = createContentStore(backend, config);
    await store.writeDraft(withTagline("First"));
    const read = await store.readDraftVersioned();
    const results = await Promise.allSettled([
      store.writeDraftIfCurrent(withTagline("Tab A"), read!.version),
      store.writeDraftIfCurrent(withTagline("Tab B"), read!.version),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ContentConflictError);
  });

  it("still overwrites with no expected version (writeDraft keeps working)", async () => {
    const store = createContentStore(backend, config);
    await store.writeDraft(withTagline("First"));
    await store.readDraftVersioned();
    await store.writeDraft(withTagline("Unconditional"));
    expect((await store.readDraft())?.profile.tagline).toBe("Unconditional");
  });

  it("with the version null, creates the draft only when none exists", async () => {
    const store = createContentStore(backend, config);
    await store.writeDraftIfCurrent(withTagline("Created"), null);
    await expect(store.writeDraftIfCurrent(withTagline("Again"), null)).rejects.toBeInstanceOf(ContentConflictError);
    expect((await store.readDraft())?.profile.tagline).toBe("Created");
  });
});

describe("content source from the environment", () => {
  it("selects local files with CONTENT_SOURCE=file:<folder>", () => {
    expect(contentSourceFromEnv({ CONTENT_SOURCE: "file:e2e/fixtures/content" })).toEqual({
      kind: "file",
      folder: "e2e/fixtures/content",
    });
  });

  it("selects Blob when this environment's store is configured, or when CONTENT_SOURCE=blob", () => {
    expect(contentSourceFromEnv({ DEVDOCS_STORE_ID: "store_devdocs" })).toEqual({ kind: "blob" });
    expect(contentSourceFromEnv({ CONTENT_SOURCE: "blob" })).toEqual({ kind: "blob" });
  });

  it("selects no source without a store, so the build passes with no content", () => {
    expect(contentSourceFromEnv({})).toEqual({ kind: "none" });
    expect(createContentStoreFromEnv({})).toBeNull();
  });

  it("refuses an unknown source and an empty folder", () => {
    expect(() => contentSourceFromEnv({ CONTENT_SOURCE: "s3" })).toThrow(/CONTENT_SOURCE/);
    expect(() => contentSourceFromEnv({ CONTENT_SOURCE: "file:" })).toThrow(/folder/);
  });

  it("a file source still needs CONTENT_ROOT and CONTENT_PATH_SECRET", () => {
    expect(() => createContentStoreFromEnv({ CONTENT_SOURCE: "file:x" })).toThrow(/CONTENT_ROOT/);
    const store = createContentStoreFromEnv({
      CONTENT_SOURCE: "file:x",
      CONTENT_ROOT: "e2e",
      CONTENT_PATH_SECRET: "e2e-secret-segment-0000",
    });
    expect(store?.paths.published).toBe("e2e/published.json");
  });
});
