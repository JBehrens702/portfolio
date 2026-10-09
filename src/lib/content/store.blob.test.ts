import { existsSync } from "node:fs";
import { del, list } from "@vercel/blob";
import { afterAll, describe, expect, it } from "vitest";
import { publish } from "./publish";
import { createBlobContentStore } from "./store";
import { makeSite } from "./test-fixtures";

// Integration check against the Development Blob store (U2, KTD2). It is skipped
// when DEV_READ_WRITE_TOKEN is not set. It uses its own random CONTENT_ROOT and
// deletes everything under that root at the end, so seeded content is never touched.
// WARNING: never run it with the Production token.

if (!process.env.DEV_READ_WRITE_TOKEN && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
const token = process.env.DEV_READ_WRITE_TOKEN;

describe.skipIf(!token)("Vercel Blob content store (Development store)", () => {
  const root = `test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const config = { root, secret: `secret-${crypto.randomUUID().replace(/-/g, "")}` };
  // Vitest still runs this body when the suite is skipped, so only build the store with a token.
  const store = token ? createBlobContentStore(config, { token }) : (undefined as never);

  afterAll(async () => {
    const { blobs } = await list({ prefix: `${root}/`, token });
    if (blobs.length > 0) await del(blobs.map((b) => b.url), { token });
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
});
