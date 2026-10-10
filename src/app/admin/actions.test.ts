import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryContentStore, type ContentStore, type MemoryBackend } from "@/lib/content/store";
import { experience, headingBlock, makeSite, media, software, textBlock } from "@/lib/content/test-fixtures";
import type { MediaStorage, StoredMedia } from "@/lib/content/media-gc";
import type { Media, Site, SoftwareCard } from "@/lib/content/schema";

// U6 action scenarios with the in-memory store and a replaced owner check, so
// no Clerk session and no Blob store are needed. The browser-only scenarios
// (the confirmation dialog, uploads, GPS stripping) are in e2e/publish.spec.ts.

const owner = vi.hoisted(() => ({ refuse: false }));
const storeRef = vi.hoisted(() => ({ current: null as ContentStore | null }));
const mediaRef = vi.hoisted(() => ({ current: null as MediaStorage | null }));
const updateTag = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/owner", async () => {
  const { OwnerRefusedError } = await vi.importActual<typeof import("@/lib/auth/owner")>("@/lib/auth/owner");
  return {
    OwnerRefusedError,
    requireOwner: vi.fn(async () => {
      if (owner.refuse) throw new OwnerRefusedError("not-owner");
      return "user_owner";
    }),
  };
});
vi.mock("next/cache", () => ({ updateTag }));
vi.mock("@/lib/content/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/content/store")>();
  return { ...original, createContentStoreFromEnv: () => storeRef.current };
});
vi.mock("@/lib/content/media-gc", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/content/media-gc")>();
  return { ...original, createMediaStorageFromEnv: () => mediaRef.current };
});

import {
  addExperience,
  approveLabel,
  moveExperience,
  publishSite,
  removeExperience,
  saveExperience,
  saveLabels,
  saveProfile,
  saveSoftware,
  type LabelsInput,
  type ProfileInput,
} from "./actions";

/** The labels as the editor loads them: each with the text it loaded (baseText). */
function asLoaded(labels: Site["labels"]): LabelsInput {
  return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { ...label, baseText: label.text }]));
}

const ROOT = { root: "memory", secret: "memory-secret-segment" };
const PREFIX = "memory/media/";

/** A file as the upload route stores it: under the media prefix, on a Blob host. */
function uploaded(name: string, extra: Partial<Media> = {}): Media {
  return {
    url: `https://store123.public.blob.vercel-storage.com/${PREFIX}${name}`,
    pathname: `${PREFIX}${name}`,
    contentType: name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    ...extra,
  };
}

let store: ContentStore;
let backend: MemoryBackend;

async function setDraft(site: Site) {
  await store.writeDraft(site);
}

async function draft(): Promise<Site> {
  const site = await store.readDraft();
  if (!site) throw new Error("no draft");
  return site;
}

function draftText(): string | undefined {
  return backend.files.get(store.paths.draft);
}

beforeEach(async () => {
  owner.refuse = false;
  updateTag.mockClear();
  ({ store, backend } = createMemoryContentStore(ROOT));
  storeRef.current = store;
  mediaRef.current = null;
  await setDraft(makeSite());
});

describe("saves keep the draft valid", () => {
  it("refuses an experience without a title, and the draft is unchanged", async () => {
    const before = draftText();
    const current = (await draft()).experiences[0];
    const result = await saveExperience(current.slug, { ...current, homeTitle: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/not valid/);
      expect(result.issues?.join("\n")).toMatch(/homeTitle/);
    }
    expect(draftText()).toBe(before);
  });

  it("refuses an invalid contact link and an invalid software card, and the draft is unchanged", async () => {
    const before = draftText();
    const site = await draft();
    const profile = await saveProfile({
      ...site.profile,
      contact: { ...site.contact, linkedin: "javascript:alert(1)" },
    });
    expect(profile.ok).toBe(false);
    const cards = await saveSoftware([...site.software, { id: "Bad Id", name: "" }]);
    expect(cards.ok).toBe(false);
    expect(draftText()).toBe(before);
  });

  it("saves an edited experience with its blocks, and keeps the slug of the address", async () => {
    const current = (await draft()).experiences[1];
    const result = await saveExperience(current.slug, {
      ...current,
      slug: "changed-by-the-browser",
      pageTitle: "New page title",
      blocks: [headingBlock("h1", "Summary"), textBlock("t1", "The owner's summary.")],
    });
    expect(result.ok).toBe(true);
    const saved = (await draft()).experiences[1];
    expect(saved.slug).toBe(current.slug);
    expect(saved.pageTitle).toBe("New page title");
    expect(saved.blocks.map((b) => b.id)).toEqual(["h1", "t1"]);
  });

  it("accepts an uploaded file, and refuses a file that this site did not upload", async () => {
    const current = (await draft()).experiences[0];
    const good = await saveExperience(current.slug, {
      ...current,
      blocks: [{ id: "f1", type: "file", label: "Report", file: uploaded("report-a1b2.pdf", { fileName: "Report.pdf" }) }],
    });
    expect(good.ok).toBe(true);

    const before = draftText();
    for (const bad of [
      uploaded("x.jpg", { url: "https://evil.example/memory/media/x.jpg" }),
      uploaded("x.jpg", { pathname: "other-root/media/x.jpg", url: "https://s.public.blob.vercel-storage.com/other-root/media/x.jpg" }),
      uploaded("x.svg", { contentType: "image/svg+xml" }),
    ]) {
      const result = await saveExperience(current.slug, { ...current, cardImage: bad });
      expect(result.ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });

  it("keeps a file that the draft already holds, even outside the media prefix (seed files)", async () => {
    const current = (await draft()).experiences[0];
    // test-fixtures media sit under site/media/, not memory/media/.
    const result = await saveExperience(current.slug, { ...current, homeText: "Changed." });
    expect(result.ok).toBe(true);
  });

  it("saves the profile and the contact links; a missing file field removes that file", async () => {
    await setDraft(makeSite({ profile: { ...makeSite().profile, resumeFile: media("resume.pdf") } }));
    const site = await draft();
    const result = await saveProfile({
      name: "Jonathan Behrens",
      tagline: "New tagline",
      introParagraphs: ["One.", "Two with a [link](https://example.com)."],
      heroPhoto: uploaded("hero.jpg", { alt: "The owner", width: 800, height: 600 }),
      contact: { ...site.contact, email: "new@example.com" },
    });
    expect(result.ok).toBe(true);
    const saved = await draft();
    expect(saved.profile.tagline).toBe("New tagline");
    expect(saved.profile.heroPhoto?.alt).toBe("The owner");
    expect(saved.profile.resumeFile).toBeUndefined();
    expect(saved.contact.email).toBe("new@example.com");
  });
});

describe("order (2.4.5)", () => {
  it("moves an experience up and down; the ends stay put", async () => {
    expect((await moveExperience("third", "up")).ok).toBe(true);
    expect((await draft()).experiences.map((e) => e.slug)).toEqual(["first", "third", "second"]);
    await moveExperience("first", "up");
    expect((await draft()).experiences.map((e) => e.slug)).toEqual(["first", "third", "second"]);
    await moveExperience("first", "down");
    expect((await draft()).experiences.map((e) => e.slug)).toEqual(["third", "first", "second"]);
  });

  it("reorders, removes, and adds software cards with one save", async () => {
    const site = await draft();
    const result = await saveSoftware([site.software[1], software("new-card", { name: "New card" })]);
    expect(result.ok).toBe(true);
    expect((await draft()).software.map((c) => c.id)).toEqual(["unquotable", "new-card"]);
  });

  it("refuses a move of an unknown experience", async () => {
    const before = draftText();
    expect((await moveExperience("nope", "up")).ok).toBe(false);
    expect((await moveExperience("first", "sideways" as "up")).ok).toBe(false);
    expect(draftText()).toBe(before);
  });
});

describe("add and remove an experience (2.4.4)", () => {
  it("adds an experience with a unique slug at the end", async () => {
    const result = await addExperience("First");
    expect(result).toMatchObject({ ok: true, slug: "first-2" });
    expect((await draft()).experiences.at(-1)).toMatchObject({ slug: "first-2", homeTitle: "First", pageTitle: "First" });
    expect((await addExperience("  ")).ok).toBe(false);
  });

  it("removes an experience; the confirmation is a browser step, so the action itself removes at once", async () => {
    expect((await removeExperience("second")).ok).toBe(true);
    expect((await draft()).experiences.map((e) => e.slug)).toEqual(["first", "third"]);
    expect((await removeExperience("second")).ok).toBe(false);
  });

  it("AE3: an added and filled experience is in the published document after Publish, and next links include it", async () => {
    await store.writePublished(await draft());
    const added = await addExperience("Wind Tunnel Rig");
    if (!added.ok) throw new Error(added.message);
    const current = (await draft()).experiences.find((e) => e.slug === added.slug)!;
    const saved = await saveExperience(added.slug, {
      ...current,
      cardImage: uploaded("rig.jpg", { alt: "The rig" }),
      skills: ["CFD", "Fabrication"],
      homeText: "I built a wind tunnel rig.",
      blocks: [textBlock("t1", "The full story.")],
    });
    expect(saved.ok).toBe(true);
    expect((await store.readPublished())!.experiences.map((e) => e.slug)).not.toContain(added.slug);

    const published = await publishSite();
    expect(published.ok).toBe(true);
    const live = (await store.readPublished())!;
    expect(live.experiences.map((e) => e.slug)).toEqual(["first", "second", "third", "wind-tunnel-rig"]);
    expect(live.experiences.at(-1)).toMatchObject({ homeText: "I built a wind tunnel rig.", skills: ["CFD", "Fabrication"] });
    expect(updateTag).toHaveBeenCalledWith("content");
  });
});

describe("labels and Publish (1.2.7, KTD9)", () => {
  beforeEach(async () => {
    await setDraft(
      makeSite({
        labels: {
          selectedWork: { text: "Selected Work", approved: true },
          readMore: { text: "Read more", approved: false },
          resume: { text: "Resume", approved: false },
        },
      }),
    );
  });

  it("AE6: Publish with unapproved labels is refused, names each one, and changes nothing", async () => {
    const result = await publishSite();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unapproved-labels");
      expect(result.labels).toEqual([
        { key: "readMore", text: "Read more" },
        { key: "resume", text: "Resume" },
      ]);
    }
    expect(await store.readPublished()).toBeNull();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("AE6: after the owner approves one label and rewrites the other, Publish works", async () => {
    expect((await approveLabel("readMore")).ok).toBe(true);
    const labels = asLoaded((await draft()).labels);
    labels.resume = { ...labels.resume, text: "Download my resume", approved: false };
    expect((await saveLabels(labels)).ok).toBe(true);
    expect((await draft()).labels.resume).toEqual({ text: "Download my resume", approved: true });

    const result = await publishSite();
    expect(result.ok).toBe(true);
    expect((await store.readPublished())!.labels.readMore.approved).toBe(true);
  });

  it("a rewritten label stays approved when the editor saves again with another edit, and Publish works", async () => {
    // The editor sends each label with the text it loaded (baseText).
    const loaded = asLoaded((await draft()).labels);
    loaded.resume = { ...loaded.resume, text: "Download my resume", approved: false };
    const first = await saveLabels(loaded);
    if (!first.ok) throw new Error(first.message);
    // The save returns the stored labels, so the editor shows the server's approval state.
    expect(first.labels.resume).toEqual({ text: "Download my resume", approved: true });

    // The editor replaces its value with the stored labels, then the owner approves another label.
    const next = asLoaded(first.labels);
    next.readMore = { ...next.readMore, approved: true };
    expect((await saveLabels(next)).ok).toBe(true);
    expect((await draft()).labels.resume).toEqual({ text: "Download my resume", approved: true });
    expect((await draft()).labels.readMore.approved).toBe(true);
    expect((await publishSite()).ok).toBe(true);
  });

  it("refuses a save from a stale tab whose loaded text is not the draft's, and changes nothing", async () => {
    const staleTab = asLoaded((await draft()).labels);
    // A second tab rewrites the label and saves.
    const otherTab = asLoaded((await draft()).labels);
    otherTab.resume = { ...otherTab.resume, text: "My CV" };
    expect((await saveLabels(otherTab)).ok).toBe(true);

    const before = draftText();
    staleTab.resume = { ...staleTab.resume, text: "Get the resume" };
    staleTab.readMore = { ...staleTab.readMore, approved: true };
    const result = await saveLabels(staleTab);
    expect(result).toEqual({ ok: false, message: "The labels changed in another tab. Reload the page." });
    expect(draftText()).toBe(before);
  });

  it("approves a label as it is with a plain save", async () => {
    const labels = asLoaded((await draft()).labels);
    labels.readMore = { ...labels.readMore, approved: true };
    const result = await saveLabels(labels);
    expect(result.ok).toBe(true);
    expect((await draft()).labels.readMore).toEqual({ text: "Read more", approved: true });
    expect((await draft()).labels.resume).toEqual({ text: "Resume", approved: false });
  });

  it("refuses a label save that adds or drops a key, or approves an unknown label", async () => {
    const before = draftText();
    const labels = asLoaded((await draft()).labels);
    expect((await saveLabels({ ...labels, extra: { text: "x", approved: true, baseText: "x" } })).ok).toBe(false);
    const { readMore: _dropped, ...fewer } = labels;
    void _dropped;
    expect((await saveLabels(fewer)).ok).toBe(false);
    expect((await approveLabel("nope")).ok).toBe(false);
    expect(draftText()).toBe(before);
  });

  it("refuses a label without its loaded text, and changes nothing", async () => {
    const before = draftText();
    const site = await draft();
    expect((await saveLabels(site.labels as unknown as LabelsInput)).ok).toBe(false);
    expect(draftText()).toBe(before);
  });

  it("an owner can also take an approval back", async () => {
    const labels = asLoaded((await draft()).labels);
    await saveLabels({ ...labels, selectedWork: { ...labels.selectedWork, approved: false } });
    expect((await draft()).labels.selectedWork.approved).toBe(false);
  });
});

describe("malformed arguments are refused and change nothing", () => {
  // Every argument of a server action comes from the browser, so its type is not guaranteed.
  const untyped = <T>(value: unknown) => value as T;

  it("approveLabel with a key that is not a string", async () => {
    await setDraft(makeSite({ labels: { readMore: { text: "Read more", approved: false } } }));
    const before = draftText();
    expect((await approveLabel(untyped<string>(1))).ok).toBe(false);
    expect((await approveLabel(untyped<string>({ toString: () => "readMore" }))).ok).toBe(false);
    expect(draftText()).toBe(before);
  });

  it("moveExperience with a direction that is not up or down", async () => {
    const before = draftText();
    for (const direction of ["sideways", "", null, 1, { up: true }]) {
      expect((await moveExperience("second", untyped<"up">(direction))).ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });

  it("saveSoftware with a value that is not a list", async () => {
    const before = draftText();
    for (const cards of [null, "dashboard", { 0: software("dashboard"), length: 1 }]) {
      expect((await saveSoftware(untyped<SoftwareCard[]>(cards))).ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });

  it("saveProfile with a value that is not an object", async () => {
    const before = draftText();
    for (const input of [null, "profile", ["Jonathan Behrens"], 42]) {
      expect((await saveProfile(untyped<ProfileInput>(input))).ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });
});

describe("AE2 at module level: a saved draft change is public only after Publish", () => {
  it("the published document keeps the old text until Publish", async () => {
    await store.writePublished(await draft());
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, blocks: [textBlock("s", "Victaulic summary.")] });
    expect(JSON.stringify(await store.readPublished())).not.toContain("Victaulic summary.");
    expect((await publishSite()).ok).toBe(true);
    expect(JSON.stringify(await store.readPublished())).toContain("Victaulic summary.");
    expect(await store.listHistory()).toHaveLength(1);
  });
});

describe("the owner check comes first (3.4.1)", () => {
  it("refuses every action for a user who is not the owner, and the draft is unchanged", async () => {
    owner.refuse = true;
    const before = draftText();
    const site = await draft();
    const calls = [
      saveProfile({ ...site.profile, contact: site.contact }),
      saveLabels(asLoaded(site.labels)),
      approveLabel("selectedWork"),
      addExperience("New"),
      removeExperience("first"),
      moveExperience("first", "down"),
      saveExperience("first", site.experiences[0]),
      saveSoftware(site.software),
      publishSite(),
    ];
    for (const call of calls) await expect(call).rejects.toMatchObject({ name: "OwnerRefusedError", status: 403 });
    expect(draftText()).toBe(before);
    expect(await store.readPublished()).toBeNull();
  });
});

describe("media cleanup after Publish (U6 step 4)", () => {
  const OLD = new Date("2026-01-01T00:00:00Z");

  function fakeStorage(files: StoredMedia[]) {
    const deleted: string[] = [];
    const storage: MediaStorage = {
      async list(prefix) {
        return files.filter((f) => f.pathname.startsWith(prefix));
      },
      async delete(urls) {
        deleted.push(...urls);
      },
    };
    return { storage, deleted };
  }

  const file = (name: string, uploadedAt = OLD): StoredMedia => ({
    pathname: `${PREFIX}${name}`,
    url: `https://store123.public.blob.vercel-storage.com/${PREFIX}${name}`,
    uploadedAt,
  });

  it("deletes only files that no document uses; a file used only by a history copy stays", async () => {
    // Version 1 uses history.jpg; it is published, then replaced by version 2.
    const v1 = makeSite({ experiences: [experience("first", { cardImage: uploaded("history.jpg") })] });
    await store.writePublished(v1);
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, cardImage: uploaded("live.jpg") });
    const { storage, deleted } = fakeStorage([
      file("history.jpg"),
      file("live.jpg"),
      file("orphan.jpg"),
      file("linked.pdf"),
      file("fresh-orphan.jpg", new Date()),
    ]);
    mediaRef.current = storage;
    // A text that links to a file keeps that file.
    const second = (await draft()).experiences[1];
    await saveExperience(second.slug, {
      ...second,
      blocks: [textBlock("t", `See [the PDF](https://store123.public.blob.vercel-storage.com/${PREFIX}linked.pdf).`)],
    });

    const result = await publishSite();
    expect(result).toMatchObject({ ok: true, cleanup: { deleted: 1 } });
    expect(deleted).toEqual([file("orphan.jpg").url]);
  });

  it("a file removed from the draft stays reachable until the next Publish, and then stays for history", async () => {
    const withFile = (await draft()).experiences[0];
    await saveExperience(withFile.slug, { ...withFile, cardImage: uploaded("old-card.jpg") });
    const { storage, deleted } = fakeStorage([file("old-card.jpg")]);
    mediaRef.current = storage;
    expect((await publishSite()).ok).toBe(true);
    expect(deleted).toEqual([]);

    // The owner removes the file from the draft. The live site still uses it.
    const current = (await draft()).experiences[0];
    const { cardImage: _removed, ...withoutCard } = current;
    void _removed;
    await saveExperience(current.slug, withoutCard);
    expect(JSON.stringify(await store.readPublished())).toContain("old-card.jpg");

    // After the next Publish only the history copy uses it, so it stays (KTD4).
    expect((await publishSite()).ok).toBe(true);
    expect(JSON.stringify(await store.readPublished())).not.toContain("old-card.jpg");
    expect(deleted).toEqual([]);
  });

  it("a refused Publish deletes nothing", async () => {
    await setDraft(makeSite({ labels: { readMore: { text: "Read more", approved: false } } }));
    const { storage, deleted } = fakeStorage([file("orphan.jpg")]);
    mediaRef.current = storage;
    expect((await publishSite()).ok).toBe(false);
    expect(deleted).toEqual([]);
  });

  it("a failed cleanup does not undo the Publish", async () => {
    mediaRef.current = {
      list: async () => {
        throw new Error("Blob is down");
      },
      delete: async () => undefined,
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await publishSite();
    error.mockRestore();
    expect(result).toMatchObject({ ok: true, cleanup: { error: expect.stringMatching(/cleanup/) } });
    expect(await store.readPublished()).not.toBeNull();
  });
});
