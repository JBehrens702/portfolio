import { existsSync } from "node:fs";
import { del, list } from "@vercel/blob";
import { afterAll, describe, expect, it } from "vitest";
import { publish } from "./publish";
import { ContentConflictError, createBlobContentStore, docsCredentialsFromEnv } from "./store";
import { makeSite } from "./test-fixtures";

// Integration check against the private development documents store (U2, KTD2). It is skipped
// when no development store is configured. It uses its own random CONTENT_ROOT and
// deletes everything under that root at the end, so seeded content is never touched.
// WARNING: never run it with the Production token.

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
// Always the development store: VERCEL_ENV is cleared so the Production store is never chosen.
const credentials = docsCredentialsFromEnv({ ...process.env, VERCEL_ENV: undefined });
const usable = credentials !== undefined && ("token" in credentials || Boolean(process.env.VERCEL_OIDC_TOKEN));

describe.skipIf(!usable)("Vercel Blob content store (Development store)", () => {
  const root = `test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const config = { root, secret: `secret-${crypto.randomUUID().replace(/-/g, "")}` };
  // Vitest still runs this body when the suite is skipped, so only build the store when it is usable.
  const store = usable ? createBlobContentStore(config, { credentials }) : (undefined as never);

  afterAll(async () => {
    const { blobs } = await list({ prefix: `${root}/`, ...credentials });
    if (blobs.length > 0) await del(blobs.map((b) => b.url), { ...credentials });
  });

  it("returns the second version after two saves in quick succession", async () => {
    const first = makeSite();
    first.profile.tagline = "First save";
    const second = makeSite();
    second.profile.tagline = "Second save";
    await store.writeDraft(first);
    await store.writeDraft(second);
    expect((await store.readDraft())?.profile.tagline).toBe("Second save");
  }, 30_000);

  it("returns the new published document on a read after a Publish", async () => {
    const before = makeSite();
    before.profile.tagline = "Published before";
    await store.writePublished(before);
    const draft = makeSite();
    draft.profile.tagline = "Published after";
    await store.writeDraft(draft);

    const result = await publish(store);
    expect(result.ok).toBe(true);
    expect((await store.readPublished())?.profile.tagline).toBe("Published after");
    const history = await store.listHistory();
    expect(history).toHaveLength(1);
    expect(await store.readHistory(history[0])).toEqual(before);
  }, 30_000);

  // KTD3 on the real private store: the version is the ETag, and a write passes it as `ifMatch`.
  it("refuses a second write with the first ETag, and keeps the first write", async () => {
    const start = makeSite();
    start.profile.tagline = "Before both tabs";
    await store.writeDraft(start);
    const stale = await store.readDraftVersioned();
    expect(stale?.version).toBeTruthy();

    const tabA = makeSite();
    tabA.profile.tagline = "Tab A";
    const written = await store.writeDraftIfCurrent(tabA, stale!.version);
    expect(written.version).not.toBe(stale!.version);

    const tabB = makeSite();
    tabB.profile.tagline = "Tab B";
    await expect(store.writeDraftIfCurrent(tabB, stale!.version)).rejects.toBeInstanceOf(ContentConflictError);
    expect((await store.readDraft())?.profile.tagline).toBe("Tab A");
  }, 30_000);

  it("returns from a conditional write the same version that the next read gives", async () => {
    await store.writeDraft(makeSite());
    const read = await store.readDraftVersioned();
    const written = await store.writeDraftIfCurrent(makeSite({ software: [] }), read!.version);
    expect((await store.readDraftVersioned())?.version).toBe(written.version);
  }, 30_000);
});
