import { beforeEach, describe, expect, it, vi } from "vitest";
import { layoutBlocks, upgradeBlocks } from "@/lib/content/layout";
import { cardKey, experienceKeys, pageKey, stampParts, type Stamps } from "@/lib/content/parts";
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
  checkParts,
  moveExperience,
  publishSite,
  removeExperience,
  resetExperience,
  saveExperience,
  saveExperienceCard,
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

/** The stamps of every part of the current draft, as an editor that loads the draft now holds them (KTD1). */
async function fresh(): Promise<Stamps> {
  return stampParts(await draft());
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
    const result = await saveExperience(current.slug, { ...current, homeTitle: "   " }, await fresh());
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
    }, await fresh());
    expect(profile.ok).toBe(false);
    const cards = await saveSoftware([...site.software, { id: "Bad Id", name: "" }], await fresh());
    expect(cards.ok).toBe(false);
    expect(draftText()).toBe(before);
  });

  it("saves an edited experience with its blocks, and keeps the slug of the address", async () => {
    const current = (await draft()).experiences[1];
    const result = await saveExperience(current.slug, {
      ...current,
      slug: "changed-by-the-browser",
      pageTitle: "New page title",
      layout: upgradeBlocks([headingBlock("h1", "Summary"), textBlock("t1", "The owner's summary.")]),
    }, await fresh());
    expect(result.ok).toBe(true);
    const saved = (await draft()).experiences[1];
    expect(saved.slug).toBe(current.slug);
    expect(saved.pageTitle).toBe("New page title");
    expect(layoutBlocks(saved.layout).map((b) => b.id)).toEqual(["h1", "t1"]);
  });

  it("adds the carousel labels, unapproved, when the first carousel is saved (KTD9)", async () => {
    const current = (await draft()).experiences[0];
    const plain = await saveExperience(current.slug, { ...current, layout: upgradeBlocks([textBlock("t", "No carousel.")]) }, await fresh());
    expect(plain.ok).toBe(true);
    expect(Object.keys((await draft()).labels).filter((key) => key.startsWith("carousel"))).toEqual([]);

    const result = await saveExperience(current.slug, {
      ...current,
      layout: [{ id: "c", type: "carousel", slides: [{ id: "s", text: "Version 1." }] }],
    }, await fresh());
    expect(result.ok).toBe(true);
    const labels = (await draft()).labels;
    expect(labels.carouselPrevious).toEqual({ text: "Previous", approved: false });
    expect(labels.carouselNext).toEqual({ text: "Next", approved: false });
    expect(labels.carouselSkip).toEqual({ text: "Skip the slides", approved: false });
  });

  it("keeps the owner's carousel labels when a page with a carousel is saved again", async () => {
    const site = await draft();
    await store.writeDraft({ ...site, labels: { ...site.labels, carouselNext: { text: "Weiter", approved: true } } });
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, layout: [{ id: "c", type: "carousel", slides: [] }] }, await fresh());
    expect((await draft()).labels.carouselNext).toEqual({ text: "Weiter", approved: true });
  });

  it("removes the unapproved carousel proposals when the last carousel is removed, so Publish is not blocked", async () => {
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, layout: [{ id: "c", type: "carousel", slides: [] }] }, await fresh());
    expect(Object.keys((await draft()).labels).filter((key) => key.startsWith("carousel"))).toHaveLength(3);

    const result = await saveExperience(current.slug, { ...current, layout: upgradeBlocks([textBlock("t", "No carousel.")]) }, await fresh());
    expect(result.ok).toBe(true);
    expect(Object.keys((await draft()).labels).filter((key) => key.startsWith("carousel"))).toEqual([]);
    expect((await publishSite()).ok).toBe(true);
  });

  it("removes the unapproved carousel proposals when the experience with the last carousel is removed", async () => {
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, layout: [{ id: "c", type: "carousel", slides: [] }] }, await fresh());
    const site = await draft();
    await store.writeDraft({ ...site, labels: { ...site.labels, carouselNext: { text: "Next", approved: true } } });

    expect((await removeExperience(current.slug)).ok).toBe(true);
    const labels = (await draft()).labels;
    expect(Object.keys(labels).filter((key) => key.startsWith("carousel"))).toEqual(["carouselNext"]);
    expect(labels.carouselNext).toEqual({ text: "Next", approved: true });
  });

  it("accepts an uploaded file, and refuses a file that this site did not upload", async () => {
    const current = (await draft()).experiences[0];
    const good = await saveExperience(current.slug, {
      ...current,
      layout: upgradeBlocks([{ id: "f1", type: "file", label: "Report", file: uploaded("report-a1b2.pdf", { fileName: "Report.pdf" }) }]),
    }, await fresh());
    expect(good.ok).toBe(true);

    const before = draftText();
    for (const bad of [
      uploaded("x.jpg", { url: "https://evil.example/memory/media/x.jpg" }),
      uploaded("x.jpg", { pathname: "other-root/media/x.jpg", url: "https://s.public.blob.vercel-storage.com/other-root/media/x.jpg" }),
      uploaded("x.svg", { contentType: "image/svg+xml" }),
    ]) {
      const result = await saveExperience(current.slug, { ...current, cardImage: bad }, await fresh());
      expect(result.ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });

  it("keeps a file that the draft already holds, even outside the media prefix (seed files)", async () => {
    const current = (await draft()).experiences[0];
    // test-fixtures media sit under site/media/, not memory/media/.
    const result = await saveExperience(current.slug, { ...current, homeText: "Changed." }, await fresh());
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
    }, await fresh());
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
    const result = await saveSoftware([site.software[1], software("new-card", { name: "New card" })], await fresh());
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
      layout: upgradeBlocks([textBlock("t1", "The full story.")]),
    }, await fresh());
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
    expect(result).toEqual({ ok: false, message: "The labels changed in another tab. Reload the page.", reason: "other-tab" });
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
      expect((await saveSoftware(untyped<SoftwareCard[]>(cards), await fresh())).ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });

  it("saveProfile with a value that is not an object", async () => {
    const before = draftText();
    for (const input of [null, "profile", ["Jonathan Behrens"], 42]) {
      expect((await saveProfile(untyped<ProfileInput>(input), await fresh())).ok).toBe(false);
    }
    expect(draftText()).toBe(before);
  });
});

describe("AE2 at module level: a saved draft change is public only after Publish", () => {
  it("the published document keeps the old text until Publish", async () => {
    await store.writePublished(await draft());
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, layout: upgradeBlocks([textBlock("s", "Victaulic summary.")]) }, await fresh());
    expect(JSON.stringify(await store.readPublished())).not.toContain("Victaulic summary.");
    expect((await publishSite()).ok).toBe(true);
    expect(JSON.stringify(await store.readPublished())).toContain("Victaulic summary.");
    expect(await store.listHistory()).toHaveLength(1);
  });
});

describe("saveExperienceCard (KTD12)", () => {
  it("saves the card fields and keeps the page layout of the draft", async () => {
    const current = (await draft()).experiences[0];
    await saveExperience(current.slug, { ...current, layout: upgradeBlocks([textBlock("keep", "Layout to keep.")]) }, await fresh());
    const result = await saveExperienceCard(current.slug, {
      homeTitle: "New card title",
      homeText: "New card text.",
      skills: ["FEA"],
      cardImage: uploaded("card-new.jpg", { alt: "New card" }),
    }, await fresh());
    expect(result.ok).toBe(true);
    const saved = (await draft()).experiences[0];
    expect(saved).toMatchObject({ homeTitle: "New card title", homeText: "New card text.", skills: ["FEA"] });
    expect(saved.cardImage?.alt).toBe("New card");
    expect(layoutBlocks(saved.layout).map((b) => b.id)).toEqual(["keep"]);
  });

  it("removes the card image when none is sent, and refuses an unknown slug", async () => {
    const current = (await draft()).experiences[0];
    await saveExperienceCard(current.slug, { homeTitle: current.homeTitle, homeText: "", skills: [] }, await fresh());
    expect((await draft()).experiences[0].cardImage).toBeUndefined();
    expect((await saveExperienceCard("no-such", { homeTitle: "x", homeText: "", skills: [] }, { "card:no-such": "x" })).ok).toBe(false);
  });
});

describe("resetExperience (2.4.15, KTD11)", () => {
  it("replaces the draft of one page with its published version (AE4)", async () => {
    await store.writePublished(await draft());
    const [current, other] = (await draft()).experiences;
    await saveExperience(current.slug, { ...current, pageTitle: "Unpublished title", layout: upgradeBlocks([textBlock("x", "Draft only.")]) }, await fresh());
    await saveExperience(other.slug, { ...other, pageTitle: "Other draft title" }, await fresh());

    const result = await resetExperience(current.slug);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const published = (await store.readPublished())!.experiences[0];
    expect(result.experience).toEqual(published);
    const after = await draft();
    // The editor takes the stamps of the reset page, so its next save is not refused.
    expect(result.stamps).toEqual(stampParts(after, experienceKeys(current.slug)));
    expect(after.experiences[0]).toEqual(published);
    // Only this page goes back; the other page keeps its draft.
    expect(after.experiences[1].pageTitle).toBe("Other draft title");
  });

  it("refuses a page that is not published yet, and the draft is unchanged", async () => {
    await store.writePublished(await draft());
    const added = await addExperience("Brand New Page");
    expect(added.ok).toBe(true);
    const before = draftText();
    const result = await resetExperience("brand-new-page");
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("not published yet") });
    expect(draftText()).toBe(before);
  });

  it("refuses when nothing is published at all", async () => {
    const result = await resetExperience((await draft()).experiences[0].slug);
    expect(result.ok).toBe(false);
  });
});

describe("the owner check comes first (3.4.1)", () => {
  it("refuses every action for a user who is not the owner, and the draft is unchanged", async () => {
    owner.refuse = true;
    const before = draftText();
    const site = await draft();
    const calls = [
      saveProfile({ ...site.profile, contact: site.contact }, stampParts(site)),
      saveLabels(asLoaded(site.labels)),
      approveLabel("selectedWork"),
      addExperience("New"),
      removeExperience("first"),
      moveExperience("first", "down"),
      saveExperience("first", site.experiences[0], stampParts(site)),
      resetExperience("first"),
      saveExperienceCard("first", site.experiences[0], stampParts(site)),
      saveSoftware(site.software, stampParts(site)),
      publishSite(),
      checkParts(stampParts(site)),
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
      async exists(url) {
        return files.some((f) => f.url === url) && !deleted.includes(url);
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
    await saveExperience(current.slug, { ...current, cardImage: uploaded("live.jpg") }, await fresh());
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
      layout: upgradeBlocks([textBlock("t", `See [the PDF](https://store123.public.blob.vercel-storage.com/${PREFIX}linked.pdf).`)]),
    }, await fresh());

    const result = await publishSite();
    expect(result).toMatchObject({ ok: true, cleanup: { deleted: 1 } });
    expect(deleted).toEqual([file("orphan.jpg").url]);
  });

  it("a file removed from the draft stays reachable until the next Publish, and then stays for history", async () => {
    const withFile = (await draft()).experiences[0];
    await saveExperience(withFile.slug, { ...withFile, cardImage: uploaded("old-card.jpg") }, await fresh());
    const { storage, deleted } = fakeStorage([file("old-card.jpg")]);
    mediaRef.current = storage;
    expect((await publishSite()).ok).toBe(true);
    expect(deleted).toEqual([]);

    // The owner removes the file from the draft. The live site still uses it.
    const current = (await draft()).experiences[0];
    const { cardImage: _removed, ...withoutCard } = current;
    void _removed;
    await saveExperience(current.slug, withoutCard, await fresh());
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
      exists: async () => true,
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await publishSite();
    error.mockRestore();
    expect(result).toMatchObject({ ok: true, cleanup: { error: expect.stringMatching(/cleanup/) } });
    expect(await store.readPublished()).not.toBeNull();
  });
});

// A refusal that asks the owner to reload must carry a reason, or the save bar
// shows no Reload button (it offers Reload for "other-tab" and "out-of-date").
describe("refusals that ask for a reload offer the Reload button", () => {
  it("a labels save whose keys are not the draft's", async () => {
    const labels = asLoaded((await draft()).labels);
    const [first] = Object.keys(labels);
    expect(first).toBeDefined();
    delete (labels as Record<string, unknown>)[first];
    const before = draftText();
    expect(await saveLabels(labels)).toMatchObject({ ok: false, message: /Reload the page/, reason: "out-of-date" });
    expect(draftText()).toBe(before);
  });

  it("a page save for an experience that another tab removed", async () => {
    const current = (await draft()).experiences[0];
    const stamps = await fresh();
    expect((await removeExperience(current.slug)).ok).toBe(true);
    const before = draftText();
    expect(await saveExperience(current.slug, current, stamps)).toMatchObject({ ok: false, reason: "out-of-date" });
    expect(draftText()).toBe(before);
  });

  it("a card save for an experience that another tab removed", async () => {
    const current = (await draft()).experiences[0];
    const stamps = await fresh();
    expect((await removeExperience(current.slug)).ok).toBe(true);
    const { homeTitle, homeText, skills, cardImage } = current;
    expect(await saveExperienceCard(current.slug, { homeTitle, homeText, skills, cardImage }, stamps)).toMatchObject({
      ok: false,
      reason: "out-of-date",
    });
  });
});

describe("out-of-date tabs (U3: 2.4.32, 2.4.33, 0.4.36; KTD2, KTD3, KTD4)", () => {
  const OTHER_TAB =
    "Not saved: another tab changed this part after you opened it. Reload the page to see the newer version. Your edits stay on this page until you reload.";
  const BUSY = "Not saved: another save ran at the same moment. Save again.";
  const RELOAD = "Not saved: this page is out of date. Reload the page.";

  const page = (site: Site, slug: string) => site.experiences.find((e) => e.slug === slug)!;
  const untyped = (value: unknown) => value as Stamps;

  /**
   * Puts a store in place whose first `times` conditional draft writes each
   * lose a race: another save lands just before them, so they meet a newer
   * version (KTD3). `otherSave` is that other save.
   */
  function raceWith(times: number, otherSave: (site: Site, call: number) => Site) {
    let calls = 0;
    storeRef.current = {
      ...store,
      async writeDraftIfCurrent(site, version) {
        calls++;
        if (calls <= times) await store.writeDraft(otherSave(await draft(), calls));
        return store.writeDraftIfCurrent(site, version);
      },
    };
    return { calls: () => calls };
  }

  const retitle = (slug: string) => (site: Site, call: number) => ({
    ...site,
    experiences: site.experiences.map((e) => (e.slug === slug ? { ...e, pageTitle: `Other save ${call}` } : e)),
  });

  function fakeMedia(exists: (url: string) => Promise<boolean>): MediaStorage {
    return { list: async () => [], delete: async () => undefined, exists };
  }

  it("AE1: a second save of the same page from the same base is refused, and the draft holds the first", async () => {
    const loaded = await draft();
    const tab = stampParts(loaded);
    const windaid = page(loaded, "first");

    const a = await saveExperience("first", { ...windaid, layout: upgradeBlocks([textBlock("a", "Tab A paragraph.")]) }, tab);
    expect(a).toEqual({ ok: true, savedAt: expect.any(String), stamps: stampParts(await draft(), experienceKeys("first")) });

    const before = draftText();
    const b = await saveExperience("first", { ...windaid, pageTitle: "Tab B title" }, tab);
    expect(b).toEqual({ ok: false, reason: "other-tab", message: OTHER_TAB });
    expect(draftText()).toBe(before);
    expect(layoutBlocks(page(await draft(), "first").layout).map((block) => block.id)).toEqual(["a"]);
  });

  it("AE2: saves of two different pages from the same base both succeed", async () => {
    const loaded = await draft();
    const tab = stampParts(loaded);
    const a = await saveExperience("first", { ...page(loaded, "first"), pageTitle: "WindAid page" }, tab);
    const b = await saveExperience("second", { ...page(loaded, "second"), pageTitle: "Victaulic page" }, tab);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const saved = await draft();
    expect(page(saved, "first").pageTitle).toBe("WindAid page");
    expect(page(saved, "second").pageTitle).toBe("Victaulic page");
    // The profile and the software cards are parts of their own: an old base still saves them.
    const profile = await saveProfile({ ...loaded.profile, tagline: "New tagline", contact: loaded.contact }, tab);
    expect(profile).toEqual({ ok: true, savedAt: expect.any(String), stamps: stampParts(await draft(), ["profile"]) });
    expect((await saveSoftware(loaded.software.slice(1), tab)).ok).toBe(true);
  });

  it("a home-card save and layout-only saves from an older experience tab all land, and the card stays", async () => {
    const loaded = await draft();
    const windaid = page(loaded, "first");
    let experienceTab = stampParts(loaded, experienceKeys("first"));

    const card = { homeTitle: "Home card title", homeText: "Home card text.", skills: ["CFD"], cardImage: windaid.cardImage };
    const home = await saveExperienceCard("first", card, stampParts(loaded, [cardKey("first")]));
    expect(home).toEqual({ ok: true, savedAt: expect.any(String), stamps: stampParts(await draft(), [cardKey("first")]) });

    // The first save uses the stamps the tab loaded; each later one the stamps the previous save returned.
    for (const [i, text] of ["Layout one.", "Layout two.", "Layout three."].entries()) {
      const result = await saveExperience("first", { ...windaid, layout: upgradeBlocks([textBlock(`t${i}`, text)]) }, experienceTab);
      if (!result.ok) throw new Error(result.message);
      const saved = await draft();
      // The tab did not change the card, so it gets its own base stamp back for it (KTD2).
      expect(result.stamps).toEqual({
        [cardKey("first")]: experienceTab[cardKey("first")],
        [pageKey("first")]: stampParts(saved, [pageKey("first")])[pageKey("first")],
      });
      experienceTab = { ...experienceTab, ...result.stamps };
      expect(page(saved, "first")).toMatchObject({ homeTitle: "Home card title", homeText: "Home card text.", skills: ["CFD"] });
      expect(layoutBlocks(page(saved, "first").layout).map((block) => block.id)).toEqual([`t${i}`]);
    }
  });

  it("a retry of a save that already succeeded succeeds and writes nothing new", async () => {
    const loaded = await draft();
    const tab = stampParts(loaded);
    const input = { ...page(loaded, "first"), pageTitle: "Saved once" };
    const first = await saveExperience("first", input, tab);
    if (!first.ok) throw new Error(first.message);

    const writes = backend.writes.length;
    const before = draftText();
    const retry = await saveExperience("first", input, tab);
    expect(retry).toEqual({ ok: true, savedAt: expect.any(String), stamps: first.stamps });
    expect(backend.writes.length).toBe(writes);
    expect(draftText()).toBe(before);
  });

  it("a store conflict on the first write is retried once from a fresh read, and the save succeeds", async () => {
    const loaded = await draft();
    const race = raceWith(1, retitle("second"));
    const result = await saveExperience("first", { ...page(loaded, "first"), pageTitle: "Mine" }, stampParts(loaded));
    expect(result.ok).toBe(true);
    expect(race.calls()).toBe(2);
    const saved = await draft();
    expect(page(saved, "first").pageTitle).toBe("Mine");
    expect(page(saved, "second").pageTitle).toBe("Other save 1");
  });

  it("a store conflict on both writes refuses the save with the save-again message", async () => {
    const loaded = await draft();
    const race = raceWith(Infinity, retitle("second"));
    const result = await saveExperience("first", { ...page(loaded, "first"), pageTitle: "Mine" }, stampParts(loaded));
    expect(result).toEqual({ ok: false, reason: "busy", message: BUSY });
    expect(race.calls()).toBe(2);
    const saved = await draft();
    expect(page(saved, "first").pageTitle).toBe("Page first");
    expect(page(saved, "second").pageTitle).toBe("Other save 2");
  });

  it("the retry after a store conflict merges again, so a race on the same part is an other-tab refusal", async () => {
    const loaded = await draft();
    raceWith(1, retitle("first"));
    const result = await saveExperience("first", { ...page(loaded, "first"), pageTitle: "Mine" }, stampParts(loaded));
    expect(result).toEqual({ ok: false, reason: "other-tab", message: OTHER_TAB });
    expect(page(await draft(), "first").pageTitle).toBe("Other save 1");
  });

  it("an action without stamps is retried from a fresh read too, and keeps the other save", async () => {
    raceWith(1, retitle("second"));
    expect((await moveExperience("third", "up")).ok).toBe(true);
    const saved = await draft();
    expect(saved.experiences.map((e) => e.slug)).toEqual(["first", "third", "second"]);
    expect(page(saved, "second").pageTitle).toBe("Other save 1");
  });

  it("AE3: a save that adds a file that is no longer stored is refused with the upload-again message", async () => {
    const exists = vi.fn<(url: string) => Promise<boolean>>(async () => false);
    mediaRef.current = fakeMedia(exists);
    const loaded = await draft();
    const gone = uploaded("gone.jpg");
    const input = { ...page(loaded, "first"), cardImage: gone };
    const before = draftText();

    const result = await saveExperience("first", input, stampParts(loaded));
    expect(result).toEqual({
      ok: false,
      reason: "missing-file",
      message: 'Not saved: the file "gone.jpg" is no longer stored. Upload it again.',
    });
    expect(exists).toHaveBeenCalledWith(gone.url);
    expect(draftText()).toBe(before);

    // The same save passes once the file is stored.
    exists.mockResolvedValue(true);
    expect((await saveExperience("first", input, stampParts(loaded))).ok).toBe(true);
  });

  it("a save that keeps a file the draft already holds does not ask the media store", async () => {
    const exists = vi.fn<(url: string) => Promise<boolean>>(async () => false);
    mediaRef.current = fakeMedia(exists);
    const loaded = await draft();
    const result = await saveExperience("first", { ...page(loaded, "first"), homeText: "Changed." }, stampParts(loaded));
    expect(result.ok).toBe(true);
    expect(exists).not.toHaveBeenCalled();
  });

  it("a save with no base, a malformed base, or a base without the saved part is refused with the reload message", async () => {
    const loaded = await draft();
    const windaid = { ...page(loaded, "first"), pageTitle: "Changed" };
    const refusal = { ok: false, reason: "out-of-date", message: RELOAD };
    const before = draftText();
    const bases = [
      undefined,
      null,
      "stamps",
      [],
      { ...stampParts(loaded), [pageKey("first")]: 1 },
      { ...stampParts(loaded), "not a part": "x" },
      stampParts(loaded, [pageKey("first")]),
    ];
    for (const base of bases) expect(await saveExperience("first", windaid, untyped(base))).toEqual(refusal);
    expect(await saveProfile({ ...loaded.profile, contact: loaded.contact })).toEqual(refusal);
    expect(await saveExperienceCard("first", windaid)).toEqual(refusal);
    expect(await saveSoftware(loaded.software)).toEqual(refusal);
    expect(draftText()).toBe(before);
  });

  it("checkParts returns only the parts that changed since the given stamps, and writes nothing", async () => {
    const loaded = await draft();
    const tab = stampParts(loaded);
    expect(await checkParts(tab)).toEqual({ ok: true, changed: [] });

    expect((await saveExperience("second", { ...page(loaded, "second"), pageTitle: "Changed in another tab" }, tab)).ok).toBe(true);
    expect((await removeExperience("third")).ok).toBe(true);
    const writes = backend.writes.length;
    // A part whose experience is gone counts as changed.
    expect(await checkParts(tab)).toEqual({ ok: true, changed: [pageKey("second"), cardKey("third"), pageKey("third")] });
    expect(await checkParts(stampParts(loaded, ["profile"]))).toEqual({ ok: true, changed: [] });
    for (const base of [undefined, "x", { "not a part": "x" }, { profile: 1 }]) {
      expect((await checkParts(untyped(base))).ok).toBe(false);
    }
    expect(backend.writes.length).toBe(writes);
  });

  it("checkParts refuses a caller who is not the owner", async () => {
    owner.refuse = true;
    await expect(checkParts(stampParts(makeSite()))).rejects.toMatchObject({ name: "OwnerRefusedError", status: 403 });
  });

  it("every action that writes the draft uses the conditional write (KTD3)", async () => {
    await setDraft(makeSite({ labels: { ...makeSite().labels, readMore: { text: "Read more", approved: false } } }));
    await store.writePublished(await draft());
    const unconditional = vi.fn(async (): Promise<Site> => {
      throw new Error("unconditional draft write");
    });
    storeRef.current = { ...store, writeDraft: unconditional };
    const site = await draft();
    const labels = asLoaded(site.labels);
    labels.selectedWork = { ...labels.selectedWork, text: "Projects" };

    const results = [
      await saveProfile({ ...site.profile, tagline: "Changed", contact: site.contact }, await fresh()),
      await saveLabels(labels),
      await approveLabel("readMore"),
      await addExperience("Added"),
      await moveExperience("added", "up"),
      await removeExperience("added"),
      await saveExperience("first", { ...page(site, "first"), pageTitle: "Changed" }, await fresh()),
      await saveExperienceCard("second", { homeTitle: "Changed", homeText: "", skills: [] }, await fresh()),
      await saveSoftware(site.software.slice(1), await fresh()),
      await resetExperience("first"),
    ];
    expect(results.map((result) => (result.ok ? "ok" : result.message))).toEqual(Array(10).fill("ok"));
    expect(unconditional).not.toHaveBeenCalled();
  });
});
