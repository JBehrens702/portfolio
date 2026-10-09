import { describe, expect, it } from "vitest";
import { collectMediaGarbage, createMediaStorageFromEnv, siteMedia, type MediaStorage, type StoredMedia } from "./media-gc";
import { createMemoryContentStore } from "./store";
import { experience, makeSite, media, software } from "./test-fixtures";

// U6 step 4: after a Publish, delete only the media files under the content
// root's media prefix that no draft, published, or history document uses.

const ROOT = { root: "site", secret: "memory-secret-segment" };
const NOW = new Date("2026-10-09T12:00:00Z");
const OLD = new Date("2026-10-01T00:00:00Z");

function stored(pathname: string, uploadedAt = OLD): StoredMedia {
  return { pathname, url: `https://s.public.blob.vercel-storage.com/${pathname}`, uploadedAt };
}

function storage(files: StoredMedia[]) {
  const deleted: string[] = [];
  const prefixes: string[] = [];
  const value: MediaStorage = {
    async list(prefix) {
      prefixes.push(prefix);
      // A careless listing that returns everything, to prove the prefix check.
      return files;
    },
    async delete(urls) {
      deleted.push(...urls);
    },
  };
  return { value, deleted, prefixes };
}

describe("siteMedia", () => {
  it("lists every media value of a document", () => {
    const site = makeSite({
      profile: { ...makeSite().profile, heroPhoto: media("hero.jpg"), resumeFile: media("resume.pdf") },
      experiences: [
        experience("a", {
          cardImage: media("card.jpg"),
          blocks: [
            { id: "i", type: "images", items: [{ image: media("one.jpg") }, {}] },
            { id: "f", type: "file", label: "File", file: media("file.pdf") },
          ],
        }),
      ],
      software: [software("s", { screenshot: media("shot.jpg") })],
    });
    expect(siteMedia(site).map((m) => m.pathname)).toEqual([
      "site/media/hero.jpg",
      "site/media/resume.pdf",
      "site/media/card.jpg",
      "site/media/one.jpg",
      "site/media/file.pdf",
      "site/media/shot.jpg",
    ]);
  });
});

describe("collectMediaGarbage", () => {
  it("lists only the media prefix and never deletes outside it", async () => {
    const { store } = createMemoryContentStore(ROOT);
    await store.writeDraft(makeSite({ experiences: [experience("a", { cardImage: media("used.jpg") })] }));
    const files = storage([
      stored("site/media/used.jpg"),
      stored("site/media/unused.jpg"),
      stored("site/published.json"),
      stored("other/media/unused.jpg"),
      stored("site-2/media/unused.jpg"),
    ]);
    const result = await collectMediaGarbage(store, files.value, { now: () => NOW });
    expect(files.prefixes).toEqual(["site/media/"]);
    expect(result.deleted).toEqual(["site/media/unused.jpg"]);
    expect(files.deleted).toEqual(["https://s.public.blob.vercel-storage.com/site/media/unused.jpg"]);
  });

  it("keeps files used by the published document or by any history copy, even an old-schema copy", async () => {
    const { store, backend } = createMemoryContentStore(ROOT);
    await store.writeDraft(makeSite({ experiences: [experience("a", { cardImage: media("draft.jpg") })] }));
    await store.writePublished(makeSite({ experiences: [experience("a", { cardImage: media("live.jpg") })] }));
    await backend.write(`${store.paths.historyPrefix}old.json`, { schemaVersion: 0, photo: { pathname: "site/media/history.jpg" } });
    const files = storage(["draft.jpg", "live.jpg", "history.jpg", "gone.jpg"].map((n) => stored(`site/media/${n}`)));
    const result = await collectMediaGarbage(store, files.value, { now: () => NOW });
    expect(result).toEqual({ deleted: ["site/media/gone.jpg"], kept: 3 });
  });

  it("keeps a file that a text links to by URL, also when the URL is percent-encoded", async () => {
    const { store } = createMemoryContentStore(ROOT);
    const site = makeSite();
    site.profile.introParagraphs = ["See [my report](https://s.public.blob.vercel-storage.com/site/media/my%20report.pdf)."];
    await store.writeDraft(site);
    const files = storage([stored("site/media/my report.pdf")]);
    expect((await collectMediaGarbage(store, files.value, { now: () => NOW })).deleted).toEqual([]);
  });

  it("keeps a recent upload that is not in the draft yet", async () => {
    const { store } = createMemoryContentStore(ROOT);
    await store.writeDraft(makeSite());
    const files = storage([stored("site/media/new.jpg", new Date(NOW.getTime() - 5 * 60 * 1000))]);
    expect((await collectMediaGarbage(store, files.value, { now: () => NOW })).deleted).toEqual([]);
    expect((await collectMediaGarbage(store, files.value, { now: () => NOW, minAgeMs: 60_000 })).deleted).toEqual([
      "site/media/new.jpg",
    ]);
  });

  it("deletes nothing when a document cannot be read", async () => {
    const { store, backend } = createMemoryContentStore(ROOT);
    await backend.write(store.paths.draft, { schemaVersion: 1, broken: true });
    const files = storage([stored("site/media/unused.jpg")]);
    await expect(collectMediaGarbage(store, files.value, { now: () => NOW })).rejects.toThrow();
    expect(files.deleted).toEqual([]);
  });

  it("deletes nothing when one history copy cannot be read", async () => {
    const { store, backend } = createMemoryContentStore(ROOT);
    await store.writeDraft(makeSite());
    for (let i = 0; i < 12; i++) await backend.write(`${store.paths.historyPrefix}${i}.json`, makeSite());
    const failing = {
      ...store,
      readHistory: async (pathname: string) => {
        if (pathname.endsWith("/7.json")) throw new Error("Blob is down");
        return store.readHistory(pathname);
      },
    };
    const files = storage([stored("site/media/unused.jpg")]);
    await expect(collectMediaGarbage(failing, files.value, { now: () => NOW })).rejects.toThrow("Blob is down");
    expect(files.deleted).toEqual([]);
  });

  it("reads every history copy, also more than it reads at the same time", async () => {
    const { store, backend } = createMemoryContentStore(ROOT);
    await store.writeDraft(makeSite());
    const names = Array.from({ length: 20 }, (_, i) => `h${i}.jpg`);
    for (const [i, name] of names.entries()) {
      await backend.write(`${store.paths.historyPrefix}${String(i).padStart(2, "0")}.json`, { photo: { pathname: `site/media/${name}` } });
    }
    const files = storage([...names, "gone.jpg"].map((n) => stored(`site/media/${n}`)));
    const result = await collectMediaGarbage(store, files.value, { now: () => NOW });
    expect(result).toEqual({ deleted: ["site/media/gone.jpg"], kept: 20 });
  });

  it("uses a known document instead of reading it again", async () => {
    const { store } = createMemoryContentStore(ROOT);
    await store.writeDraft(makeSite());
    await store.writePublished(makeSite({ experiences: [experience("a", { cardImage: media("stored.jpg") })] }));
    const known = makeSite({ experiences: [experience("a", { cardImage: media("known.jpg") })] });
    const files = storage([stored("site/media/stored.jpg"), stored("site/media/known.jpg")]);
    const result = await collectMediaGarbage(store, files.value, { now: () => NOW, knownDocuments: { published: known } });
    expect(result.deleted).toEqual(["site/media/stored.jpg"]);
  });
});

describe("createMediaStorageFromEnv", () => {
  it("is off for local JSON files, because their files in Blob are not theirs", () => {
    expect(createMediaStorageFromEnv({ CONTENT_SOURCE: "file:e2e/fixtures/content", DEV_READ_WRITE_TOKEN: "x" })).toBeNull();
    expect(createMediaStorageFromEnv({})).toBeNull();
    expect(createMediaStorageFromEnv({ CONTENT_SOURCE: "blob", DEV_STORE_ID: "store_x" })).not.toBeNull();
  });
});
