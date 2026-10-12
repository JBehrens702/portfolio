import { describe, expect, it } from "vitest";
import { sitemapEntries } from "./sitemap";
import { experience, makeSite } from "./test-fixtures";

const SITE = "https://www.example.test";

describe("sitemapEntries", () => {
  it("lists the home page, then each experience page in site order", () => {
    const site = makeSite({ experiences: [experience("beta"), experience("alpha")] });
    expect(sitemapEntries(site, SITE)).toEqual([
      { url: "https://www.example.test" },
      { url: "https://www.example.test/experiences/beta" },
      { url: "https://www.example.test/experiences/alpha" },
    ]);
  });

  it("lists only the home page when nothing is published", () => {
    expect(sitemapEntries(null, SITE)).toEqual([{ url: "https://www.example.test" }]);
  });

  it("never lists the admin or preview pages", () => {
    const site = makeSite({ experiences: [experience("alpha")] });
    const urls = sitemapEntries(site, SITE).map((entry) => entry.url);
    expect(urls.some((url) => /\/(admin|preview)(\/|$)/.test(url))).toBe(false);
  });
});
