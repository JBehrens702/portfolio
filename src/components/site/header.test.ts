import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { experience, makeSite } from "@/lib/content/test-fixtures";
import { visibleSite } from "@/lib/content/visibility";

// The logo is the home link of the top bar. It goes to the home page of the
// link base: "/" on the public site, "/preview" in the owner's preview (U5).

// Under Vite a static image import is a plain string with no size, which
// next/image refuses; the images are not what these tests check.
vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return {
    default: ({ src, alt }: { src: string | { src: string }; alt: string }) =>
      h("img", { src: typeof src === "string" ? src : src.src, alt }),
  };
});

import { Header } from "./Header";
import { ExperienceView, HomeView } from "./SiteView";

/** The address of the logo link: the first link in the header. */
function logoHref(page: string): string | undefined {
  const header = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
  return /<a [^>]*href="([^"]*)"/.exec(header)?.[1];
}

const site = visibleSite(makeSite({ experiences: [experience("alpha")] }));

describe("the logo link", () => {
  it("goes to / on the public pages", () => {
    expect(logoHref(renderToStaticMarkup(createElement(HomeView, { site, linkBase: "/" })))).toBe("/");
    const page = createElement(ExperienceView, { site, linkBase: "/", experience: site.experiences[0] });
    expect(logoHref(renderToStaticMarkup(page))).toBe("/");
  });

  it("goes to /preview in the preview", () => {
    expect(logoHref(renderToStaticMarkup(createElement(HomeView, { site, linkBase: "/preview" })))).toBe("/preview");
    const page = createElement(ExperienceView, { site, linkBase: "/preview", experience: site.experiences[0] });
    expect(logoHref(renderToStaticMarkup(page))).toBe("/preview");
  });

  it("goes to / when the header gets no home address", () => {
    const header = createElement(Header, { logoAlt: "Logo", links: [], menuLabel: "Menu" });
    expect(logoHref(renderToStaticMarkup(header))).toBe("/");
  });
});
