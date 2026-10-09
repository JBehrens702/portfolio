import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSite, unapprovedLabels, type Block, type Experience, type Media, type Site } from "../src/lib/content/schema";
import { createMemoryContentStore } from "../src/lib/content/store";
import { makeSite } from "../src/lib/content/test-fixtures";
import {
  DraftExistsError,
  SeedInputError,
  checkSeed,
  placeholderMedia,
  resolveSeedMedia,
  seedDraft,
  seedRefs,
  type ManifestEntry,
  type UploadRequest,
} from "./seed/core";

// U7: the seed must hold every word of the Google Site, word for word, except
// the fixes listed in docs/text-fixes.md (1.2.1 to 1.2.4, 1.2.7).

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));

const PAGES = [
  "thermocouple-reader-system",
  "turbine-testing-stand",
  "victaulic-internship",
  "solidworks-experience",
  "volunteer-experience",
] as const;
type Page = "home" | (typeof PAGES)[number];

type RawBlock = { type: string; text?: string; src?: string; href?: string; label?: string };
const raw = (page: Page) => readJson(`content/seed/raw/${page}.json`) as RawBlock[];
const TEXT_TYPES = new Set(["h1", "h2", "h3", "p", "small"]);
const isLogo = (src = "") => src.endsWith("=w16383");

const input = readJson("content/seed/site.json");
const manifest = readJson("content/seed/media/manifest.json") as ManifestEntry[];
const fixesDoc = readFileSync(path.join(ROOT, "docs/text-fixes.md"), "utf8");

// ---- docs/text-fixes.md ----

function section(doc: string, heading: string): string {
  const start = doc.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`docs/text-fixes.md has no "## ${heading}" section`);
  const next = doc.indexOf("\n## ", start + 1);
  return doc.slice(start, next < 0 ? undefined : next);
}

function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .slice(1) // the header row
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

const codeSpan = (cell: string): string => {
  const match = /^`([^`]*)`$/.exec(cell);
  if (!match) throw new Error(`expected a code span, got: ${cell}`);
  return match[1];
};

type Fix = { page: Page; where: string; old: string; new: string };
const fixes: Fix[] = tableRows(section(fixesDoc, "Fixes")).map((cells) => ({
  page: codeSpan(cells[1]) as Page,
  where: cells[2],
  old: codeSpan(cells[3]),
  new: codeSpan(cells[4]),
}));

type ProposedLabel = { key: string; text: string };
const proposedLabels: ProposedLabel[] = tableRows(section(fixesDoc, "Proposed labels (need your approval)")).map(
  (cells) => ({ key: codeSpan(cells[0]), text: codeSpan(cells[1]) }),
);
const approvedLabels: ProposedLabel[] = tableRows(section(fixesDoc, "Labels from the Google Site (approved)")).map(
  (cells) => ({ key: codeSpan(cells[0]), text: codeSpan(cells[1]) }),
);

const applyFixes = (page: Page, text: string) =>
  fixes.filter((fix) => fix.page === page).reduce((t, fix) => t.split(fix.old).join(fix.new), text);

// ---- the seed, with placeholder media so it can be validated without uploads ----

const placeholders = new Map(manifest.map((entry) => [entry.file, placeholderMedia(entry)]));
const site: Site = checkSeed(input, manifest);
const experience = (slug: string): Experience => {
  const found = site.experiences.find((e) => e.slug === slug);
  if (!found) throw new Error(`no experience ${slug}`);
  return found;
};

/** Markdown links become their text, so the text can be compared with the Google Site. */
const plain = (markdown: string) => markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
const VIDEO_LINK = /^<(https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11}))>$/;
const DRIVE_FILES = [
  "2024 12 16-ProjectReport-V3.0.pdf",
  "2024 11 05-ProjectRecord-JB.docx",
  "Test Stand Design Record.pdf",
];

/** Every owner text of an experience, one entry per Google Site text block. */
function experienceTexts(e: Experience): string[] {
  const texts = [e.pageTitle];
  if (e.subtitle !== undefined) texts.push(e.subtitle);
  for (const block of e.blocks) texts.push(...blockTexts(block));
  return texts;
}

function blockTexts(block: Block): string[] {
  switch (block.type) {
    case "heading":
    case "quote":
      return [block.text];
    case "text":
      return VIDEO_LINK.test(block.text) || block.text === "" ? [] : [plain(block.text)];
    case "facts":
      return block.items.flatMap((item) => [item.label, ...item.value.split("\n")]);
    case "images":
      return block.caption ? [block.caption] : [];
    case "file":
      return [];
  }
}

const allSeedText = [
  site.profile.name,
  site.profile.tagline,
  ...site.profile.introParagraphs,
  ...Object.values(site.labels).map((label) => label.text),
  ...site.experiences.flatMap((e) => [e.homeTitle, e.homeText, ...e.skills, ...experienceTexts(e)]),
  ...site.experiences.flatMap((e) => e.blocks.flatMap((b) => (b.type === "file" ? [b.label] : []))),
].join("\n");

describe("seed document", () => {
  it("passes schema validation after its media references are resolved", () => {
    const resolved = resolveSeedMedia(input, (file) => {
      const media = placeholders.get(file);
      if (!media) throw new Error(file);
      return media;
    });
    const result = parseSite(resolved);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it("references every downloaded image exactly once, and each file exists", () => {
    const refs = seedRefs(input);
    expect([...refs].sort()).toEqual(manifest.map((entry) => entry.file).sort());
    for (const entry of manifest) {
      expect(existsSync(path.join(ROOT, "content/seed/media", entry.file)), entry.file).toBe(true);
    }
  });

  it("has the five experiences in Google Site order, with the page paths as slugs", () => {
    expect(site.experiences.map((e) => e.slug)).toEqual([...PAGES]);
  });

  it("uses the home card images as card images and the page images in page order", () => {
    for (const page of PAGES) {
      const e = (input as { experiences: { slug: string; cardImage?: { seed: string }; blocks: unknown[] }[] }).experiences.find(
        (x) => x.slug === page,
      )!;
      expect(e.cardImage?.seed).toMatch(new RegExp(`^home-card-${page}\\.(jpg|png)$`));
      const blockRefs = seedRefs(e.blocks);
      const rawCount = raw(page).filter((b) => b.type === "img" && !isLogo(b.src)).length;
      expect(blockRefs).toHaveLength(rawCount);
      expect(blockRefs.map((f) => f.replace(/\.(jpg|png)$/, ""))).toEqual(
        Array.from({ length: rawCount }, (_, i) => `${page}-${String(i + 1).padStart(2, "0")}`),
      );
    }
    expect((input as { profile: { heroPhoto?: { seed: string } } }).profile.heroPhoto?.seed).toBe("home-hero.jpg");
  });

  it("maps each Google Drive embed to a file block without a file, and each video embed to a link", () => {
    const fileLabels: string[] = [];
    for (const page of PAGES) {
      const embeds = raw(page).filter((b) => b.type === "embed");
      const e = experience(page);
      const files = e.blocks.filter((b) => b.type === "file");
      const videos = e.blocks.filter((b) => b.type === "text" && VIDEO_LINK.test(b.text));
      expect(files.length + videos.length, page).toBe(embeds.length);
      expect(files.length, page).toBe(embeds.filter((b) => b.src?.includes("drive.google.com")).length);
      for (const file of files) {
        if (file.type !== "file") continue;
        expect(file.file).toBeUndefined();
        fileLabels.push(file.label);
      }
      const rawVideoIds = embeds.flatMap((b) => /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/.exec(b.src ?? "")?.[1] ?? []);
      const seedVideoIds = videos.map((b) => (b.type === "text" ? VIDEO_LINK.exec(b.text)![2] : ""));
      expect(seedVideoIds, page).toEqual(rawVideoIds);
    }
    expect(fileLabels).toEqual(DRIVE_FILES);
  });

  it("leaves the software overviews, the Victaulic summary, the alt texts, and the resume empty", () => {
    expect(site.software.map((card) => [card.id, card.name, card.link ?? null, card.overview ?? null, card.screenshot ?? null])).toEqual([
      ["unquotable", "[UN]Quotable", "https://unquotable.626house.casa", null, null],
      ["dashboard", "Dashboard", null, null, null],
    ]);
    const victaulic = experience("victaulic-internship");
    const summary = victaulic.blocks.findIndex((b) => b.type === "heading" && b.text === "Summary");
    expect(victaulic.blocks[summary + 1]).toMatchObject({ type: "text", text: "" });
    expect(site.profile.resumeFile).toBeUndefined();
    expect(JSON.stringify(input)).not.toMatch(/"alt"\s*:/);
  });

  it("has the contact links of the Google Site", () => {
    const links = raw("home").filter((b) => b.type === "link" && b.href && !b.href.startsWith("/view/"));
    expect(links.map((b) => b.href)).toEqual([
      site.contact.linkedin,
      `mailto:${site.contact.email}`,
      site.contact.rise,
    ]);
  });
});

describe("word for word (1.2.2, 1.2.4)", () => {
  // The Google Site text of a page, with the listed fixes applied. Leading and
  // trailing spaces are not part of the text.
  const expected = (page: Page) =>
    raw(page)
      .filter((b) => TEXT_TYPES.has(b.type) && b.text !== undefined)
      .map((b) => applyFixes(page, b.text!.trim()));

  for (const page of PAGES) {
    it(`${page}: every text equals a Google Site text, and every Google Site text is in the seed`, () => {
      const e = experience(page);
      const want = expected(page).filter((t) => t !== "Next Experience");
      const have = experienceTexts(e).filter((t) => t !== "");
      expect([...have].sort()).toEqual([...want].sort());
      // The home text and the skills are copies of the page's own texts.
      expect(want).toContain(e.homeText);
      if (e.skills.length > 0) expect(want).toContain(e.skills.join(", "));
    });
  }

  it("home: the intro, the card labels, and the headings are Google Site texts", () => {
    const want = expected("home");
    const have = [
      site.profile.tagline,
      ...site.profile.introParagraphs,
      site.labels.selectedWork.text,
      ...site.experiences.map((e) => e.homeTitle),
      site.labels.contactHeading.text,
    ];
    expect([...have].sort()).toEqual([...want].sort());
    // The name is the name in the H1 and in the site title "Jonathan Behrens' Portfolio".
    expect(want[0]).toContain(site.profile.name);
  });

  it("home titles follow the card order and link to the matching page", () => {
    const raws = raw("home");
    const cards = raws.filter((b) => b.type === "p" && raws[raws.indexOf(b) - 1]?.type === "link");
    expect(site.experiences.map((e) => e.homeTitle)).toEqual(cards.map((b) => b.text));
    for (const card of cards) {
      const link = raws[raws.indexOf(card) - 1];
      expect(link.href?.endsWith(`/${site.experiences[cards.indexOf(card)].slug}`)).toBe(true);
    }
  });

  it("every listed fix changes text that the Google Site has, and the seed has the new text", () => {
    expect(fixes.length).toBeGreaterThan(0);
    for (const fix of fixes) {
      const rawText = raw(fix.page).map((b) => b.text ?? "").join("\n");
      expect(rawText, `${fix.page}: ${fix.old}`).toContain(fix.old);
      expect(allSeedText, `${fix.page}: ${fix.new}`).toContain(fix.new);
      // The old text may be part of the new text (an added full stop), so remove the new text first.
      expect(allSeedText.split(fix.new).join(""), `${fix.page}: ${fix.old}`).not.toContain(fix.old);
    }
  });

  it("each internal link in a text block goes to an experience that exists", () => {
    const slugs = new Set(site.experiences.map((e) => e.slug));
    for (const e of site.experiences) {
      for (const block of e.blocks) {
        if (block.type !== "text") continue;
        for (const [, , href] of block.text.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
          expect(href).toMatch(/^\/experiences\/[a-z0-9-]+$/);
          expect(slugs.has(href.split("/")[2])).toBe(true);
        }
      }
    }
  });
});

describe("inventory note openings (1.2.1)", () => {
  // Exact quotes from portfolio-google-site-inventory.md (2026-10-08). The note
  // cut each quote at 125 characters, so these are openings. The paraphrases
  // in "[rest: ...]" are not the owner's words and are not used.
  const OPENINGS: Record<Page, string[]> = {
    home: [
      "Hi, I'm Jonathan Behrens",
      "I am a mechanical engineering student at Messiah University (Class of 2027) and a space nerd.",
      "A little more about me personally, I am a devout Christian, which means that I have a strong sense of ethics",
      "Selected Work",
      "Thermocouple Reader System Design",
      "Streamlining Wind Turbines - Collaboratory",
      "Victaulic Internship (Summer '25)",
      "SolidWorks Experience",
      "Service & Volunteer Work",
      "Get in touch:",
    ],
    "thermocouple-reader-system": [
      "Thermocouple Reader System",
      "Thermocouple Reader (TCR) System",
      "From August 2024 to present, I have been working with Dr. Tim Burdett (Messiah University Engineering)",
      "Project Overview:",
      "Skills Demonstrated",
      "Project Management, Electronics Design, Product Development, Validation, Arduino (Coding Language)",
      "Client",
      "Dr. Tim Burdett",
      "Professor, Messiah University",
      "Problem Statement",
      "In the past, the Heat Transfer class has used National Instruments DAQs with LabVIEW to take measurements from thermocouples",
      "Above, the completed TCR Version 1 is shown, both the physical model, its electrical schematic, and a depiction of",
      "2024 12 16-ProjectReport-V3.0.pdf",
      "These images compare a previous transient conduction experiment, completed with data logged by hand using a multimeter,",
      "During the first work cycle (Version 1), I served as the student project manager for a group of five.",
      "Unfortunately, this device had some issues discussed in the report, so for the next semester (Spring 2025) and moving forward,",
      "Read my project record from the Version 1 system:",
      "The Version 2 TCR system will feature improved accuracy through the incorporation of a real-time clock circuit.",
      "The system will also include serious hardware reliability improvements to make a more robust system by switching to",
      "The Version 2 system is expected to begin validation in late Fall 2025.",
      "2024 11 05-ProjectRecord-JB.docx",
    ],
    "turbine-testing-stand": [
      "Turbine Testing Stand",
      "Turbine Testing Stand (TTS) Development",
      "Throughout the Spring 2025 semester, I worked with another student to construct and validate a single-phase AC to 3-phase AC",
      "Skills Demonstrated",
      "Mechanical Design, Electronics Design, Sustainability, Validation, Teamwork, Machining",
      "Clients",
      "WindAid Institute (Peru), Messiah University Collaboratory for Strategic Partnerships and Applied Research",
      "Problem Statement",
      "It would be beneficial to the Streamlining Wind Turbine (SWT) team to create a system that generates 3-phase AC power",
      "These images demonstrate the main goal of the TTS, using an AC motor (top right) to drive a 3-phase AC generator (bottom right).",
      "Test Stand Design Record.pdf",
      "Here shown is the testing setup and results, confirming the capacity to deliver above 300W,",
      "My primary contribution to this project was the design of the adapter plate between the motor and generator.",
      "Once this system was attached, there was still a great deal of stress on the system since we could not reasonably make our setup",
    ],
    "victaulic-internship": [
      "Victaulic Internship",
      "Summer 2025 Internship: Victaulic",
      "Summary",
      "Skills Demonstrated",
      "Mechanical Design, Electronics Design, Product Development, Validation, GD&T, CAD, FEA",
      "Employer",
      "Victaulic Co, a leading manufacturer of construction piping systems.",
      "Job Description",
      "Working under Alex Murphy in the Tools Technology group, the intern will work on projects related to the design of",
      "Some examples of work I performed in completing larger projects, including metrology and mechanical design.",
      "Some of the Victaulic intern crew after one of our professional development events.",
      "I am second from the left in the back row.",
      "Throughout this internship, my main personal goal was to supplement and convert my previous project and academic experience to",
      "I also gained valuable experience through assisting with the Tools group's project management process,",
    ],
    "solidworks-experience": [
      "SolidWorks Experience",
      "Personal SolidWorks Projects",
      "A breif overview of some of my Solidworks projects I have done beyond the scope of dedicated work shown on my other",
      "GD&T Drawing Example",
      "To demonstrate the power of General Dimensioning and Tolerancing, as prescribed by ASME Y14.5,",
      "ENGR111 SolidWorks Tutorials",
      "While in ENGR111 at Messiah (my freshman year), I created a short series of tutorials breaking down a few of our homework",
      "Desktop 3D Prints",
      "I have a love for tangible models, in large part why I chose mechanical engineering as opposed to more theoretical fields,",
      "I have a wealth of experience in SolidWorks for personal projects, predominantly for 3D printing.",
    ],
    "volunteer-experience": [
      "Volunteer Experience",
      "Here is a synopsis of some of the service projects I have participated in recently.",
      "Lehigh Valley Intern Impact Day",
      "While working at Victaulic, our intern team joined others across the Valley for Intern Impact Day.",
      "Service Project in North Carolina",
      "During the spring of 2025, I had the opportunity to join a team heading to North Carolina to assist with flood restoration and",
      "Volunteering at Calvary BFC",
      "In the past few years, I have volunteered during the summer at Calvary Bible Fellowship Church for Vacation Bible School (VBS).",
      "Volunteering at Midtown",
      "While at school, I am active with Midtown Community Church, right in the heart of Harrisburg,",
      "Throughout my internship and personal time, I have been able to invest a lot into service and volunteering.",
      "It is a great privilege to get to give back to the people around me.",
    ],
  };

  for (const [page, openings] of Object.entries(OPENINGS) as [Page, string[]][]) {
    it(`${page}: every opening appears in the seed (with the listed fixes)`, () => {
      const missing = openings.map((o) => applyFixes(page, o)).filter((o) => !allSeedText.includes(o));
      expect(missing).toEqual([]);
    });
  }

  it("the inventory contact links are in the seed", () => {
    expect(site.contact).toEqual({
      linkedin: "https://www.linkedin.com/in/jonathan-behrens-meche/",
      email: "jbehrens702@gmail.com",
      rise: "https://app.joinrise.co/professional/lcokuxryce",
    });
  });
});

describe("AE5: SolidWorks fixes (1.2.2, 1.2.3)", () => {
  it('the SolidWorks page says "brief" and "Geometric", and the fix list names both changes', () => {
    const e = experience("solidworks-experience");
    const text = experienceTexts(e).join("\n");
    expect(text).toContain("A brief overview");
    expect(text).not.toContain("breif");
    expect(text).toContain("Geometric Dimensioning and Tolerancing");
    expect(text).not.toContain("General Dimensioning");
    const listed = fixes.filter((f) => f.page === "solidworks-experience");
    expect(listed.some((f) => f.old.includes("breif") && f.new.includes("brief"))).toBe(true);
    expect(listed.some((f) => f.old.includes("General Dimensioning") && f.new.includes("Geometric Dimensioning"))).toBe(true);
  });
});

describe("labels (1.2.7, KTD9)", () => {
  it("the Google Site labels are approved", () => {
    expect(approvedLabels.map((l) => l.key).sort()).toEqual(["contactHeading", "nextExperience", "selectedWork"]);
    for (const { key, text } of approvedLabels) {
      expect(site.labels[key], key).toEqual({ text, approved: true });
    }
  });

  it("every label that Claude proposed is unapproved, listed in docs/text-fixes.md, and 1 to 3 words", () => {
    expect(unapprovedLabels(site)).toEqual(proposedLabels.map((l) => l.key).sort());
    for (const { key, text } of proposedLabels) {
      expect(site.labels[key], key).toEqual({ text, approved: false });
      expect(text.split(/\s+/).length, key).toBeGreaterThanOrEqual(1);
      expect(text.split(/\s+/).length, key).toBeLessThanOrEqual(3);
    }
    expect(Object.keys(site.labels).sort()).toEqual([...approvedLabels, ...proposedLabels].map((l) => l.key).sort());
  });

  it("proposes the labels that the public pages use", () => {
    for (const key of [
      "readMore",
      "resume",
      "softwareHeading",
      "aboutHeading",
      "navWork",
      "navAbout",
      "navContact",
      "menu",
      "logoAlt",
      "notFoundTitle",
      "backHome",
      "downloadFile",
      "previewMarker",
    ]) {
      expect(site.labels[key]?.approved, key).toBe(false);
    }
  });
});

// ---- the seed script core ----

const SECRET = "test-secret-segment-123";

function fakeUploader() {
  const calls: UploadRequest[] = [];
  let n = 0;
  return {
    calls,
    upload: async (request: UploadRequest) => {
      calls.push(request);
      n += 1;
      const pathname = request.pathname.replace(/(\.[a-z]+)$/, `-rnd${n}$1`);
      return { url: `https://store.public.blob.vercel-storage.com/${pathname}`, pathname };
    },
  };
}

const readMedia = async (file: string) => new Uint8Array([file.length]);

describe("seedDraft", () => {
  it("uploads each image once and writes the draft, never the published document", async () => {
    const { store, backend } = createMemoryContentStore({ root: "seedtest", secret: SECRET });
    const uploader = fakeUploader();
    const result = await seedDraft({ input, manifest, readMedia, upload: uploader.upload, store });
    expect(result.uploaded).toBe(manifest.length);
    expect(uploader.calls.map((c) => c.file).sort()).toEqual(manifest.map((m) => m.file).sort());
    for (const call of uploader.calls) {
      expect(call.pathname).toBe(`seedtest/media/seed/${call.file}`);
      expect(call.contentType).toBe(manifest.find((m) => m.file === call.file)!.contentType);
    }
    expect(backend.writes).toEqual([store.paths.draft]);
    expect(await store.readPublished()).toBeNull();
    const draft = (await store.readDraft())!;
    expect(draft.profile.heroPhoto).toMatchObject({
      url: expect.stringMatching(/^https:\/\/store\.public\.blob\.vercel-storage\.com\/seedtest\/media\/seed\/home-hero-rnd\d+\.jpg$/),
      contentType: "image/jpeg",
      width: manifest.find((m) => m.file === "home-hero.jpg")!.width,
    });
    expect(draft.profile.heroPhoto?.alt).toBeUndefined();
  });

  it("refuses to overwrite an existing draft without force, and uploads nothing", async () => {
    const { store } = createMemoryContentStore({ root: "seedtest", secret: SECRET });
    const existing = makeSite();
    await store.writeDraft(existing);
    const uploader = fakeUploader();
    await expect(seedDraft({ input, manifest, readMedia, upload: uploader.upload, store })).rejects.toBeInstanceOf(
      DraftExistsError,
    );
    expect(uploader.calls).toEqual([]);
    expect(await store.readDraft()).toEqual(existing);
  });

  it("refuses an existing invalid draft without force too", async () => {
    const { store, backend } = createMemoryContentStore({ root: "seedtest", secret: SECRET });
    await backend.write(store.paths.draft, { broken: true });
    await expect(seedDraft({ input, manifest, readMedia, upload: fakeUploader().upload, store })).rejects.toBeInstanceOf(
      DraftExistsError,
    );
  });

  it("overwrites an existing draft with force", async () => {
    const { store } = createMemoryContentStore({ root: "seedtest", secret: SECRET });
    await store.writeDraft(makeSite());
    await seedDraft({ input, manifest, readMedia, upload: fakeUploader().upload, store, force: true });
    expect((await store.readDraft())!.experiences.map((e) => e.slug)).toEqual([...PAGES]);
  });

  it("refuses an invalid seed before it uploads anything", async () => {
    const { store, backend } = createMemoryContentStore({ root: "seedtest", secret: SECRET });
    const uploader = fakeUploader();
    const broken = JSON.parse(JSON.stringify(input));
    broken.experiences[0].pageTitle = "";
    await expect(seedDraft({ input: broken, manifest, readMedia, upload: uploader.upload, store })).rejects.toThrow(
      /pageTitle/,
    );
    const missing = JSON.parse(JSON.stringify(input));
    missing.profile.heroPhoto = { seed: "not-there.jpg" };
    await expect(seedDraft({ input: missing, manifest, readMedia, upload: uploader.upload, store })).rejects.toBeInstanceOf(
      SeedInputError,
    );
    expect(uploader.calls).toEqual([]);
    expect(backend.writes).toEqual([]);
  });

  it("never logs the secret path segment", async () => {
    const { store } = createMemoryContentStore({ root: "seedtest", secret: SECRET });
    const lines: string[] = [];
    await seedDraft({ input, manifest, readMedia, upload: fakeUploader().upload, store, log: (l) => lines.push(l) });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(SECRET);
  });
});

describe("seed references", () => {
  it("resolveSeedMedia replaces only { seed } objects and leaves the input unchanged", () => {
    const doc = { a: { seed: "x.jpg" }, b: [{ seed: "y.png" }, { seed: "z", other: 1 }], c: "seed" };
    const media: Media = { url: "https://h.example/x", pathname: "p", contentType: "image/jpeg" };
    expect(seedRefs(doc)).toEqual(["x.jpg", "y.png"]);
    expect(resolveSeedMedia(doc, () => media)).toEqual({ a: media, b: [media, { seed: "z", other: 1 }], c: "seed" });
    expect(doc.a).toEqual({ seed: "x.jpg" });
  });
});
