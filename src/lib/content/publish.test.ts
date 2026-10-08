import { describe, expect, it, vi } from "vitest";
import { publish } from "./publish";
import type { Site } from "./schema";
import { createMemoryContentStore } from "./store";
import { makeSite } from "./test-fixtures";

const config = { root: "test-root", secret: "s3cret-segment-0123456789" };

function setup() {
  const { store, backend } = createMemoryContentStore(config);
  const afterPublish = vi.fn();
  return { store, backend, afterPublish };
}

function draftWithTagline(tagline: string): Site {
  const site = makeSite();
  site.profile.tagline = tagline;
  return site;
}

describe("publish", () => {
  it("refuses while a label is unapproved and names that label (AE6); after approval it publishes", async () => {
    const { store, backend, afterPublish } = setup();
    const draft = makeSite({
      labels: {
        selectedWork: { text: "Selected Work", approved: true },
        readMore: { text: "Read more", approved: false },
      },
    });
    await store.writeDraft(draft);

    const refused = await publish(store, { afterPublish });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("unapproved-labels");
      expect(refused.reason === "unapproved-labels" && refused.labels).toEqual(["readMore"]);
      expect(refused.message).toContain("readMore");
      expect(refused.message).toContain("Read more");
    }
    expect(await store.readPublished()).toBeNull();
    expect(backend.writes).toEqual([store.paths.draft]);
    expect(afterPublish).not.toHaveBeenCalled();

    draft.labels.readMore.approved = true;
    await store.writeDraft(draft);
    const accepted = await publish(store, { afterPublish });
    expect(accepted.ok).toBe(true);
    expect(await store.readPublished()).toEqual(draft);
  });

  it("names every unapproved label", async () => {
    const { store } = setup();
    await store.writeDraft(
      makeSite({
        labels: {
          b: { text: "B", approved: false },
          a: { text: "A", approved: false },
          c: { text: "C", approved: true },
        },
      }),
    );
    const result = await publish(store);
    expect(!result.ok && result.reason === "unapproved-labels" && result.labels).toEqual(["a", "b"]);
  });

  it("writes the old published document to history before it writes the new one", async () => {
    const { store, backend, afterPublish } = setup();
    const old = draftWithTagline("Old version");
    await store.writePublished(old);
    const next = draftWithTagline("New version");
    await store.writeDraft(next);
    backend.writes.length = 0;

    const result = await publish(store, { afterPublish });
    expect(result.ok).toBe(true);
    const history = await store.listHistory();
    expect(history).toHaveLength(1);
    expect(result.ok && result.historyPath).toBe(history[0]);
    expect(await store.readHistory(history[0])).toEqual(old);
    expect(backend.writes).toEqual([history[0], store.paths.published]);
    expect(await store.readPublished()).toEqual(next);
  });

  it("refuses an invalid document and leaves the published document unchanged", async () => {
    const { store, backend, afterPublish } = setup();
    const live = draftWithTagline("Live");
    await store.writePublished(live);
    // A stored draft can only be invalid if storage was changed outside the app.
    const invalid = makeSite() as unknown as { experiences: { pageTitle: string }[] };
    invalid.experiences[0].pageTitle = "";
    await backend.write(store.paths.draft, invalid);

    const result = await publish(store, { afterPublish });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
      expect(result.reason === "invalid" && result.issues.join("\n")).toContain("experiences.0.pageTitle");
    }
    expect(await store.readPublished()).toEqual(live);
    expect(await store.listHistory()).toEqual([]);
    expect(afterPublish).not.toHaveBeenCalled();
  });

  it("does the first Publish, with no published document yet, without history", async () => {
    const { store, afterPublish } = setup();
    const draft = makeSite();
    await store.writeDraft(draft);
    afterPublish.mockImplementation(async () => {
      // The cache refresh comes after the new document is written.
      expect(await store.readPublished()).toEqual(draft);
    });

    const result = await publish(store, { afterPublish });
    expect(result).toEqual({ ok: true, site: draft, historyPath: null });
    expect(await store.listHistory()).toEqual([]);
    expect(afterPublish).toHaveBeenCalledTimes(1);
  });

  it("refuses when there is no draft", async () => {
    const { store, afterPublish } = setup();
    const result = await publish(store, { afterPublish });
    expect(!result.ok && result.reason).toBe("no-draft");
    expect(afterPublish).not.toHaveBeenCalled();
  });
});
