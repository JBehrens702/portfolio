import { afterEach, describe, expect, it, vi } from "vitest";

// The Blob backend's read (KTD2, changed in U6): the public Blob CDN can serve
// the version from before an overwrite for up to about 60 s, and `useCache:
// false` does not bypass it for public blobs. The read takes the current ETag
// from the Blob API (head) and accepts only that version from the CDN.

const blob = vi.hoisted(() => ({
  headEtag: '"v2"' as string | null,
  getEtags: [] as string[],
  gets: 0,
}));

vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return {
    ...actual,
    head: vi.fn(async () => {
      if (blob.headEtag === null) throw new actual.BlobNotFoundError();
      return { etag: blob.headEtag };
    }),
    get: vi.fn(async () => {
      const etag = blob.getEtags[Math.min(blob.gets, blob.getEtags.length - 1)];
      blob.gets++;
      const version = etag.replace(/^W\//, "").replace(/"/g, "");
      return { statusCode: 200, stream: new Response(JSON.stringify({ version })).body, blob: { etag } };
    }),
  };
});

import { createBlobBackend } from "./store";

const backend = () => createBlobBackend({ credentials: { storeId: "store_test" } });

afterEach(() => {
  blob.headEtag = '"v2"';
  blob.getEtags = [];
  blob.gets = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createBlobBackend().read", () => {
  it("waits while the CDN serves the old version, then returns the current one", async () => {
    blob.getEtags = ['"v1"', '"v1"', '"v2"'];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await backend().read("root/draft.json")).toEqual({ version: "v2" });
    expect(blob.gets).toBe(3);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("accepts the CDN's weak ETag form of the current version", async () => {
    blob.getEtags = ['W/"v2"'];
    expect(await backend().read("root/draft.json")).toEqual({ version: "v2" });
    expect(blob.gets).toBe(1);
  });

  it("returns null when the Blob API has no such document", async () => {
    blob.headEtag = null;
    expect(await backend().read("root/draft.json")).toBeNull();
    expect(blob.gets).toBe(0);
  });

  it("never returns an old version: it fails after the wait instead", async () => {
    vi.useFakeTimers();
    blob.getEtags = ['"v1"'];
    const result = backend().read("root/draft.json");
    const failed = expect(result).rejects.toThrow(/old version/);
    await vi.advanceTimersByTimeAsync(130_000);
    await failed;
  });
});
