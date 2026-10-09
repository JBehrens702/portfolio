import { afterEach, describe, expect, it, vi } from "vitest";

// The Blob backend of the documents (KTD2, changed in U6): the JSON documents
// sit in a PRIVATE store. Every read and write uses private access, and a read
// passes `useCache: false`, which a private store honours, so it returns the
// current version at once.

const blob = vi.hoisted(() => ({
  stored: null as unknown,
  statusCode: 200,
  calls: [] as { op: string; pathname: string; options: Record<string, unknown> }[],
}));

vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vercel/blob")>();
  return {
    ...actual,
    get: vi.fn(async (pathname: string, options: Record<string, unknown>) => {
      blob.calls.push({ op: "get", pathname, options });
      if (blob.stored === null) return null;
      return { statusCode: blob.statusCode, stream: new Response(JSON.stringify(blob.stored)).body };
    }),
    put: vi.fn(async (pathname: string, body: string, options: Record<string, unknown>) => {
      blob.calls.push({ op: "put", pathname, options });
      blob.stored = JSON.parse(body);
      return { pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}` };
    }),
    list: vi.fn(async (options: Record<string, unknown>) => {
      blob.calls.push({ op: "list", pathname: String(options.prefix), options });
      const page = options.cursor === undefined ? 1 : 2;
      const blobs = [{ pathname: `${options.prefix}page-${page}.json` }];
      return page === 1 ? { blobs, hasMore: true, cursor: "next" } : { blobs, hasMore: false };
    }),
  };
});

import { createBlobBackend } from "./store";

const credentials = { storeId: "store_test" };
const backend = () => createBlobBackend({ credentials });

afterEach(() => {
  blob.stored = null;
  blob.statusCode = 200;
  blob.calls = [];
});

describe("createBlobBackend (private documents store)", () => {
  it("reads with private access, past the cache, with the given store", async () => {
    blob.stored = { version: "v2" };
    expect(await backend().read("root/draft.json")).toEqual({ version: "v2" });
    expect(blob.calls).toEqual([
      { op: "get", pathname: "root/draft.json", options: { access: "private", useCache: false, storeId: "store_test" } },
    ]);
  });

  it("returns null when there is no such document", async () => {
    expect(await backend().read("root/draft.json")).toBeNull();
    blob.stored = { version: "v1" };
    blob.statusCode = 304;
    expect(await backend().read("root/draft.json")).toBeNull();
  });

  it("writes JSON with private access, at the exact pathname, and without a CDN cache setting", async () => {
    await backend().write("root/published.json", { version: "v3" });
    expect(blob.calls).toEqual([
      {
        op: "put",
        pathname: "root/published.json",
        options: { access: "private", storeId: "store_test", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true },
      },
    ]);
    expect(await backend().read("root/published.json")).toEqual({ version: "v3" });
  });

  it("lists every page of pathnames under the prefix", async () => {
    expect(await backend().list("root/history/")).toEqual(["root/history/page-1.json", "root/history/page-2.json"]);
    expect(blob.calls.map((c) => c.options)).toEqual([
      { prefix: "root/history/", cursor: undefined, storeId: "store_test" },
      { prefix: "root/history/", cursor: "next", storeId: "store_test" },
    ]);
  });
});
