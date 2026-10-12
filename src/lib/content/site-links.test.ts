import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site-url";
import type { Experience, LayoutItem, Site } from "./schema";
import { HOME_PAGE, linksOfPage, siteLinks, textLinks, type PageId, type PageLink } from "./site-links";
import { experience, makeSite, media, software, textBlock } from "./test-fixtures";

// The link list of the admin map (KTD7, U5): 2.4.22, 2.4.23, 2.4.24, AE6.

const SLUGS = ["windaid", "victaulic", "thermocouple", "turbine", "solidworks", "volunteer"];

function row(id: string, ...texts: string[]): LayoutItem {
  return { id, type: "row", layout: "one", cells: [texts.map((text, i) => textBlock(`${id}-t${i}`, text))] };
}

/** The fixture labels, plus the labels that show the card links and the resume link. */
const LABELS: Site["labels"] = {
  ...makeSite().labels,
  readMore: { text: "Read more", approved: true },
  resume: { text: "Resume", approved: true },
};

/** LABELS without one label: the site then hides the element that uses it. */
function withoutLabel(key: string): Site["labels"] {
  return Object.fromEntries(Object.entries(LABELS).filter(([k]) => k !== key));
}

/** Six experiences; the SolidWorks page text links to the Victaulic page (AE6). */
function sixPages(changes: Partial<Record<string, Partial<Experience>>> = {}, extra: Partial<Site> = {}): Site {
  return makeSite({
    labels: LABELS,
    experiences: SLUGS.map((slug) =>
      experience(slug, {
        layout: slug === "solidworks" ? [row("r1", "My CAD work for [Victaulic](/experiences/victaulic).")] : [],
        ...changes[slug],
      }),
    ),
    ...extra,
  });
}

/** The pages and their reasons, as plain pairs, for short assertions. */
function pairs(links: PageLink[]): [PageId, string[]][] {
  return links.map((link) => [link.page, link.reasons]);
}

describe("siteLinks: the built-in links and text links (AE6)", () => {
  it("lists the home page, WindAid, and SolidWorks as links to Victaulic, and the home page and Thermocouple as its links", () => {
    const victaulic = linksOfPage(siteLinks(sixPages()), "victaulic");
    expect(pairs(victaulic.linksFrom)).toEqual([
      [HOME_PAGE, ["card"]],
      ["windaid", ["next"]],
      ["solidworks", ["text"]],
    ]);
    expect(pairs(victaulic.linksTo)).toEqual([
      [HOME_PAGE, ["header"]],
      ["thermocouple", ["next"]],
    ]);
  });

  it("returns one entry per page, the home page first, then the experiences in site order", () => {
    const links = siteLinks(sixPages());
    expect(links.pages.map((p) => p.page)).toEqual([HOME_PAGE, ...SLUGS]);
  });

  it("links the home page to every experience card, and every experience back through the header", () => {
    const links = siteLinks(sixPages());
    const home = linksOfPage(links, HOME_PAGE);
    expect(pairs(home.linksTo)).toEqual(SLUGS.map((slug) => [slug, ["card"]]));
    expect(pairs(home.linksFrom)).toEqual(SLUGS.map((slug) => [slug, ["header"]]));
  });

  it("links the last experience's next link to the first", () => {
    const links = siteLinks(sixPages());
    expect(pairs(linksOfPage(links, "volunteer").linksTo)).toEqual([
      [HOME_PAGE, ["header"]],
      ["windaid", ["next"]],
    ]);
    expect(pairs(linksOfPage(links, "windaid").linksFrom)).toEqual([
      [HOME_PAGE, ["card"]],
      ["volunteer", ["next"]],
    ]);
  });

  it("counts a full address under the site URL as an internal link", () => {
    const site = sixPages({ turbine: { layout: [row("r1", `Read [this](${SITE_URL}/experiences/victaulic).`)] } });
    const turbine = linksOfPage(siteLinks(site), "turbine");
    expect(pairs(turbine.linksTo)).toContainEqual(["victaulic", ["text"]]);
    expect(siteLinks(site).outside.map((o) => o.href)).not.toContain(`${SITE_URL}/experiences/victaulic`);
  });

  it("counts /, /#section, and the same addresses under the site URL as links to the home page", () => {
    for (const href of ["/", "/#contact", `${SITE_URL}`, `${SITE_URL}/`, `${SITE_URL}/#work`]) {
      const site = sixPages({ turbine: { layout: [row("r1", `[Home](${href})`)] } });
      const home = linksOfPage(siteLinks(site), HOME_PAGE);
      expect(pairs(home.linksFrom), href).toContainEqual(["turbine", ["header", "text"]]);
    }
  });

  it("does not list a link to an unknown slug, a javascript: link, or a link inside a hidden slide", () => {
    const hiddenSlide: LayoutItem = {
      id: "c1",
      type: "carousel",
      // A slide with no image is hidden (0.1.13), so its text does not show.
      slides: [{ id: "s1", text: "[Hidden](/experiences/volunteer)" }],
    };
    const site = sixPages({
      turbine: {
        layout: [row("r1", "[Gone](/experiences/no-such-page) and [bad](javascript:alert(1)) here."), hiddenSlide],
      },
    });
    const links = siteLinks(site);
    expect(pairs(linksOfPage(links, "turbine").linksTo)).toEqual([
      [HOME_PAGE, ["header"]],
      ["solidworks", ["next"]],
    ]);
    expect(links.pages.map((p) => p.page)).not.toContain("no-such-page");
    expect(links.outside.map((o) => o.href).join(" ")).not.toMatch(/javascript|no-such-page/);
  });

  it("lists a link in a visible slide's text", () => {
    const slide: LayoutItem = { id: "c1", type: "carousel", slides: [{ id: "s1", image: media(), text: "[See](/experiences/volunteer)" }] };
    const links = siteLinks(sixPages({ turbine: { layout: [slide] } }));
    expect(pairs(linksOfPage(links, "turbine").linksTo)).toContainEqual(["volunteer", ["text"]]);
  });

  it("lists a link in a quote block", () => {
    const quote: LayoutItem = {
      id: "r1",
      type: "row",
      layout: "one",
      cells: [[{ id: "q1", type: "quote", text: "As [Thermocouple](/experiences/thermocouple) showed." }]],
    };
    const links = siteLinks(sixPages({ windaid: { layout: [quote] } }));
    expect(pairs(linksOfPage(links, "windaid").linksTo)).toContainEqual(["thermocouple", ["text"]]);
  });

  it("gives a link in an intro paragraph, a software overview, or a card text to the home page", () => {
    const site = sixPages(
      { windaid: { homeText: "Card text about [Turbine](/experiences/turbine)." } },
      {
        profile: { ...makeSite().profile, introParagraphs: ["I wrote [Victaulic](/experiences/victaulic)."] },
        software: [software("cad", { overview: "Used on [SolidWorks](/experiences/solidworks)." })],
      },
    );
    const links = siteLinks(site);
    const home = linksOfPage(links, HOME_PAGE);
    const withText = new Set(["victaulic", "solidworks", "turbine"]);
    expect(pairs(home.linksTo)).toEqual(SLUGS.map((slug) => [slug, withText.has(slug) ? ["card", "text"] : ["card"]]));
    expect(linksOfPage(links, "victaulic").linksFrom[0]).toEqual({ page: HOME_PAGE, reasons: ["card", "text"] });
    expect(linksOfPage(links, "solidworks").linksFrom[0]).toEqual({ page: HOME_PAGE, reasons: ["card", "text"] });
    expect(linksOfPage(links, "turbine").linksFrom[0]).toEqual({ page: HOME_PAGE, reasons: ["card", "text"] });
    expect(pairs(linksOfPage(links, "windaid").linksTo)).toEqual([
      [HOME_PAGE, ["header"]],
      ["victaulic", ["next"]],
    ]);
  });

  it("does not list a link from a page to itself", () => {
    const site = sixPages({ turbine: { layout: [row("r1", "[Me](/experiences/turbine)")] } });
    const turbine = linksOfPage(siteLinks(site), "turbine");
    expect(turbine.linksTo.map((l) => l.page)).not.toContain("turbine");
    expect(turbine.linksFrom.map((l) => l.page)).not.toContain("turbine");
    const home = linksOfPage(siteLinks(sixPages({}, { profile: { ...makeSite().profile, introParagraphs: ["[Top](/#work)"] } })), HOME_PAGE);
    expect(home.linksTo.map((l) => l.page)).not.toContain(HOME_PAGE);
  });

  it("counts several links between the same two pages once, with each reason once", () => {
    const site = sixPages({
      solidworks: {
        layout: [row("r1", "[A](/experiences/victaulic) and [B](/experiences/victaulic/).", "[C](/experiences/victaulic#top)")],
      },
    });
    const victaulic = linksOfPage(siteLinks(site), "victaulic");
    expect(victaulic.linksFrom.filter((l) => l.page === "solidworks")).toEqual([{ page: "solidworks", reasons: ["text"] }]);
  });

  it("puts the next link and a text link between the same pages in one entry", () => {
    const site = sixPages({ windaid: { layout: [row("r1", "[Next one](/experiences/victaulic)")] } });
    expect(pairs(linksOfPage(siteLinks(site), "windaid").linksTo)).toContainEqual(["victaulic", ["next", "text"]]);
  });

  it("finds a reference-style link and an autolink", () => {
    const site = sixPages({
      turbine: { layout: [row("r1", "See [the reader][r].\n\n[r]: /experiences/thermocouple", `<${SITE_URL}/experiences/windaid>`)] },
    });
    const turbine = linksOfPage(siteLinks(site), "turbine");
    expect(pairs(turbine.linksTo)).toEqual([
      [HOME_PAGE, ["header"]],
      ["windaid", ["text"]],
      ["thermocouple", ["text"]],
      ["solidworks", ["next"]],
    ]);
  });

  it("gives a page with no links only its built-in links", () => {
    const site = makeSite({ labels: LABELS, experiences: [experience("alpha"), experience("beta")] });
    const links = siteLinks(site);
    expect(pairs(linksOfPage(links, "alpha").linksTo)).toEqual([
      [HOME_PAGE, ["header"]],
      ["beta", ["next"]],
    ]);
  });

  it("gives a single experience no next link", () => {
    const links = siteLinks(makeSite({ labels: LABELS, experiences: [experience("only")] }));
    expect(pairs(linksOfPage(links, "only").linksTo)).toEqual([[HOME_PAGE, ["header"]]]);
    expect(pairs(linksOfPage(links, "only").linksFrom)).toEqual([[HOME_PAGE, ["card"]]]);
  });

  it("gives a site with no experiences one home page with no links", () => {
    const site = makeSite({ labels: LABELS, experiences: [], software: [], contact: {} });
    const links = siteLinks(site);
    expect(links.pages).toEqual([{ page: HOME_PAGE, linksTo: [], linksFrom: [] }]);
    expect(links.outside).toEqual([]);
  });

  it("leaves out the card links when the readMore label is empty, as the home page hides them", () => {
    for (const labels of [{ ...LABELS, readMore: { text: "  ", approved: true } }, withoutLabel("readMore")]) {
      const links = siteLinks(sixPages({}, { labels }));
      expect(linksOfPage(links, HOME_PAGE).linksTo).toEqual([]);
      for (const slug of SLUGS) {
        expect(linksOfPage(links, slug).linksFrom.map((l) => l.page), slug).not.toContain(HOME_PAGE);
      }
    }
  });

  it("keeps a home text link when the readMore label is empty", () => {
    const site = sixPages(
      {},
      {
        labels: { ...LABELS, readMore: { text: "", approved: true } },
        profile: { ...makeSite().profile, introParagraphs: ["[Victaulic](/experiences/victaulic)"] },
      },
    );
    expect(pairs(linksOfPage(siteLinks(site), HOME_PAGE).linksTo)).toEqual([["victaulic", ["text"]]]);
  });

  it("leaves out every next link when the nextExperience label is empty, as the experience pages hide it", () => {
    for (const labels of [{ ...LABELS, nextExperience: { text: "", approved: true } }, withoutLabel("nextExperience")]) {
      const links = siteLinks(sixPages({}, { labels }));
      for (const page of links.pages) {
        expect([...page.linksTo, ...page.linksFrom].flatMap((l) => l.reasons), page.page).not.toContain("next");
      }
      expect(pairs(linksOfPage(links, "victaulic").linksTo)).toEqual([[HOME_PAGE, ["header"]]]);
    }
  });

  it("throws for a page that the site does not have", () => {
    expect(() => linksOfPage(siteLinks(sixPages()), "no-such-page")).toThrow(/no-such-page/);
  });

  it("does not change the site that it reads", () => {
    const site = sixPages();
    const copy = structuredClone(site);
    siteLinks(site);
    expect(site).toEqual(copy);
  });
});

describe("siteLinks: the links that leave the site (2.4.24)", () => {
  it("lists the contact links, the resume, the report files, software links, and outside text links once each", () => {
    const report = media("report.pdf");
    const fileRow: LayoutItem = {
      id: "r2",
      type: "row",
      layout: "one",
      cells: [[{ id: "f1", type: "file", label: "Report", file: report }]],
    };
    const site = sixPages(
      {
        turbine: {
          layout: [row("r1", "On [GitHub](https://github.com/example) and [GitHub again](https://github.com/example)."), fileRow],
        },
        windaid: { layout: [row("r1", "Mail [me](mailto:owner@example.com).")] },
      },
      {
        profile: { ...makeSite().profile, resumeFile: media("resume.pdf") },
        software: [software("unquotable", { link: "https://unquotable.626house.casa" })],
      },
    );
    expect(siteLinks(site).outside).toEqual([
      { href: "https://www.linkedin.com/in/example/", kind: "contact", page: HOME_PAGE },
      { href: "mailto:owner@example.com", kind: "contact", page: HOME_PAGE },
      { href: "https://app.joinrise.co/professional/example", kind: "contact", page: HOME_PAGE },
      { href: media("resume.pdf").url, kind: "resume", page: HOME_PAGE },
      { href: "https://unquotable.626house.casa", kind: "software", page: HOME_PAGE },
      { href: "https://github.com/example", kind: "text", page: "turbine" },
      { href: report.url, kind: "file", page: "turbine" },
    ]);
  });

  it("leaves out empty contact links, a file block with no file, and a hidden software card", () => {
    const emptyFile: LayoutItem = { id: "r1", type: "row", layout: "one", cells: [[{ id: "f1", type: "file", label: "Report" }]] };
    const site = sixPages(
      { turbine: { layout: [emptyFile] } },
      {
        contact: { linkedin: "", email: "  ", rise: "https://app.joinrise.co/professional/example" },
        software: [software("hidden", { overview: "", link: "https://hidden.example.com" })],
      },
    );
    expect(siteLinks(site).outside.map((o) => o.href)).toEqual(["https://app.joinrise.co/professional/example"]);
  });

  it("leaves out the resume when the resume label is empty, as the header and hero hide it", () => {
    const profile = { ...makeSite().profile, resumeFile: media("resume.pdf") };
    const shown = siteLinks(sixPages({}, { profile }));
    expect(shown.outside.map((o) => o.kind)).toContain("resume");
    const hidden = siteLinks(sixPages({}, { profile, labels: { ...LABELS, resume: { text: " ", approved: true } } }));
    expect(hidden.outside.map((o) => o.kind)).not.toContain("resume");
  });

  it("leaves out a file block with no label and no file name, as the page hides it", () => {
    const fileRow = (label: string, fileName?: string): LayoutItem => ({
      id: "r1",
      type: "row",
      layout: "one",
      cells: [[{ id: "f1", type: "file", label, file: media("report.pdf", fileName ? { fileName } : {}) }]],
    });
    const files = (layout: LayoutItem[]) => siteLinks(sixPages({ turbine: { layout } })).outside.filter((o) => o.kind === "file");
    expect(files([fileRow("  ")])).toEqual([]);
    expect(files([fileRow("", "report.pdf")])).toEqual([{ href: media("report.pdf").url, kind: "file", page: "turbine" }]);
  });
});

describe("textLinks", () => {
  it("returns the safe address of each link in Markdown, in text order", () => {
    expect(textLinks("[a](/x) [b](javascript:void(0)) <https://e.example.com> [c]( /y )")).toEqual([
      "/x",
      "https://e.example.com",
      "/y",
    ]);
  });

  it("finds no link in plain text, in a bare address, or in an image", () => {
    expect(textLinks("")).toEqual([]);
    expect(textLinks("Just text, https://bare.example.com, and ![pic](/experiences/a).")).toEqual([]);
  });
});
