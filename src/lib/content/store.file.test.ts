import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publish } from "./publish";
import { parseSite } from "./schema";
import {
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
