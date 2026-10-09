import { describe, expect, it } from "vitest";
import { makeSite, media } from "@/lib/content/test-fixtures";
import { visibleSite } from "@/lib/content/visibility";
import { isOptimizableImage, parseImageHosts } from "./image-hosts";
import {
  contactLinks,
  downloadHref,
  experienceHref,
  homeHref,
  isExternalHref,
  navLinks,
  resumeLink,
  safeHref,
  sectionHref,
  withLinkBase,
} from "./links";

const labels = {
  navWork: { text: "Work", approved: true },
  navAbout: { text: "About", approved: true },
  navContact: { text: "Contact", approved: true },
  resume: { text: "Resume", approved: true },
  contactLinkedin: { text: "LinkedIn", approved: true },
  contactEmail: { text: "Email", approved: true },
  contactRise: { text: "Rise", approved: true },
};

describe("link bases", () => {
  it("builds public and preview addresses", () => {
    expect(homeHref("/")).toBe("/");
    expect(homeHref("/preview")).toBe("/preview");
    expect(homeHref("/preview/")).toBe("/preview");
    expect(experienceHref("/", "alpha")).toBe("/experiences/alpha");
    expect(experienceHref("/preview", "alpha")).toBe("/preview/experiences/alpha");
    expect(sectionHref("/", "work", true)).toBe("#work");
    expect(sectionHref("/", "work", false)).toBe("/#work");
    expect(sectionHref("/preview", "work", false)).toBe("/preview#work");
  });
});

describe("hrefs", () => {
  it("adds download=1 to a file address, keeping other query values", () => {
    expect(downloadHref(media("cv.pdf"))).toBe(
      "https://example.public.blob.vercel-storage.com/site/media/cv.pdf?download=1",
    );
    expect(downloadHref(media("cv.pdf", { url: "https://h.example.com/a.pdf?x=1" }))).toBe(
      "https://h.example.com/a.pdf?x=1&download=1",
    );
  });

  it("allows only http, https, mailto, and local addresses", () => {
    expect(safeHref("https://example.com/")).toBe("https://example.com/");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(safeHref("/experiences/a")).toBe("/experiences/a");
    expect(safeHref("#work")).toBe("#work");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(" JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("//evil.example.com")).toBeNull();
  });

  it("marks only http and https addresses as external", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("http://example.com")).toBe(true);
    expect(isExternalHref("mailto:a@example.com")).toBe(false);
    expect(isExternalHref("/a")).toBe(false);
  });
});

describe("contact, navigation, and resume links", () => {
  it("gives the contact links in order, with mailto for the email", () => {
    const site = visibleSite(makeSite({ labels }));
    expect(contactLinks(site)).toEqual([
      { label: "LinkedIn", href: "https://www.linkedin.com/in/example/" },
      { label: "Email", href: "mailto:owner@example.com" },
      { label: "Rise", href: "https://app.joinrise.co/professional/example" },
    ]);
  });

  it("hides a contact link without its address (0.1.8)", () => {
    const site = visibleSite(makeSite({ labels, contact: { linkedin: "", email: "a@example.com" } }));
    expect(contactLinks(site)).toEqual([{ label: "Email", href: "mailto:a@example.com" }]);
  });

  it("shows the owner's address as the link text when a contact label is missing", () => {
    const site = visibleSite(makeSite({ labels: {} }));
    expect(contactLinks(site)).toEqual([
      { label: "linkedin.com/in/example", href: "https://www.linkedin.com/in/example/" },
      { label: "owner@example.com", href: "mailto:owner@example.com" },
      { label: "app.joinrise.co/professional/example", href: "https://app.joinrise.co/professional/example" },
    ]);
  });

  it("puts a site path in a text link under the link base, and leaves other links alone", () => {
    expect(withLinkBase("/experiences/a", "/")).toBe("/experiences/a");
    expect(withLinkBase("/experiences/a", "/preview")).toBe("/preview/experiences/a");
    expect(withLinkBase("/", "/preview")).toBe("/preview");
    expect(withLinkBase("/#work", "/preview")).toBe("/preview#work");
    expect(withLinkBase("#work", "/preview")).toBe("#work");
    expect(withLinkBase("https://example.com/a", "/preview")).toBe("https://example.com/a");
  });

  it("gives the header links only for sections that show", () => {
    const site = visibleSite(makeSite({ labels }));
    expect(navLinks(site, "/", true)).toEqual([
      { label: "Work", href: "#work" },
      { label: "About", href: "#about" },
      { label: "Contact", href: "#contact" },
    ]);
    const empty = visibleSite(
      makeSite({
        labels,
        experiences: [],
        contact: {},
        profile: { name: "N", tagline: "", introParagraphs: [" "] },
      }),
    );
    expect(navLinks(empty, "/", false)).toEqual([]);
  });

  it("gives a resume link only with a resume file and a label (AE1)", () => {
    expect(resumeLink(visibleSite(makeSite({ labels })))).toBeUndefined();
    const withFile = makeSite({
      labels,
      profile: { name: "N", tagline: "", introParagraphs: [], resumeFile: media("cv.pdf") },
    });
    expect(resumeLink(visibleSite(withFile))).toEqual({
      label: "Resume",
      href: "https://example.public.blob.vercel-storage.com/site/media/cv.pdf?download=1",
    });
    const { resume: _resume, ...noLabel } = labels;
    void _resume;
    expect(resumeLink(visibleSite({ ...withFile, labels: noLabel }))).toBeUndefined();
  });
});

describe("image hosts", () => {
  it("parses a comma-separated list of exact host names", () => {
    expect(parseImageHosts(" Abc.public.blob.vercel-storage.com , def.public.blob.vercel-storage.com,")).toEqual([
      "abc.public.blob.vercel-storage.com",
      "def.public.blob.vercel-storage.com",
    ]);
    expect(parseImageHosts(undefined)).toEqual([]);
  });

  it("refuses wildcards and values that are not host names", () => {
    expect(() => parseImageHosts("*.public.blob.vercel-storage.com")).toThrow(/BLOB_PUBLIC_HOSTNAMES/);
    expect(() => parseImageHosts("https://a.example.com")).toThrow(/BLOB_PUBLIC_HOSTNAMES/);
  });

  it("optimizes only https images on a listed host", () => {
    const hosts = ["abc.public.blob.vercel-storage.com"];
    expect(isOptimizableImage("https://abc.public.blob.vercel-storage.com/a.png", hosts)).toBe(true);
    expect(isOptimizableImage("https://media.e2e.test/a.png", hosts)).toBe(false);
    expect(isOptimizableImage("not a url", hosts)).toBe(false);
  });
});
