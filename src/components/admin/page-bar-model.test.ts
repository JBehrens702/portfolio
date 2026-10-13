import { describe, expect, it } from "vitest";
import { experience, makeSite } from "@/lib/content/test-fixtures";
import { barLinks, barPages, editHref, HOME_ID, previewHref } from "./page-bar-model";

const site = makeSite({
  experiences: [experience("windaid", { homeTitle: "WindAid" }), experience("victaulic", { homeTitle: "", pageTitle: "Victaulic" })],
});

describe("the page bar (KTD10, 2.4.31)", () => {
  it("lists the home page, then each experience in site order, named by its title", () => {
    expect(barPages(site)).toEqual([
      { id: HOME_ID, title: "Home" },
      { id: "windaid", title: "WindAid" },
      { id: "victaulic", title: "Victaulic" },
    ]);
  });

  it("falls back to the slug when an experience has no title", () => {
    const untitled = makeSite({ experiences: [experience("blank", { homeTitle: "", pageTitle: "" })] });
    expect(barPages(untitled).at(-1)).toEqual({ id: "blank", title: "blank" });
  });

  it("gives the editor and preview address of each page", () => {
    expect(editHref(HOME_ID)).toBe("/admin/home");
    expect(previewHref(HOME_ID)).toBe("/preview");
    expect(editHref("wind aid")).toBe("/admin/experiences/wind%20aid");
    expect(previewHref("wind aid")).toBe("/preview/experiences/wind%20aid");
  });

  it("links each page in the bar's mode and marks the current page", () => {
    const links = barLinks(barPages(site), "windaid", "preview");
    expect(links.map((link) => link.href)).toEqual(["/preview", "/preview/experiences/windaid", "/preview/experiences/victaulic"]);
    expect(links.map((link) => link.current)).toEqual([false, true, false]);
    expect(barLinks(barPages(site), HOME_ID, "edit").map((link) => link.href)).toEqual([
      "/admin/home",
      "/admin/experiences/windaid",
      "/admin/experiences/victaulic",
    ]);
  });

  it("gives each page a second link in the other mode, so any editor or preview is one click away", () => {
    expect(barLinks(barPages(site), HOME_ID, "edit").map((link) => link.other)).toEqual([
      { href: "/preview", label: "preview", name: "Preview Home" },
      { href: "/preview/experiences/windaid", label: "preview", name: "Preview WindAid" },
      { href: "/preview/experiences/victaulic", label: "preview", name: "Preview Victaulic" },
    ]);
    expect(barLinks(barPages(site), "victaulic", "preview")[2].other).toEqual({
      href: "/admin/experiences/victaulic",
      label: "edit",
      name: "Edit Victaulic",
    });
  });

  it("marks no page when the current page is not in the list", () => {
    expect(barLinks(barPages(site), null, "edit").some((link) => link.current)).toBe(false);
  });
});
