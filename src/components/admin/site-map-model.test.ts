import { describe, expect, it } from "vitest";
import type { PageChanges } from "@/lib/content/page-changes";
import type { SiteLinks } from "@/lib/content/site-links";
import {
  frameTitle,
  linkLines,
  mapRows,
  nextRowIndex,
  openHref,
  readView,
  rowFromParam,
  selectHref,
  VIEW_KEY,
  writeView,
  type MapRow,
  type ViewStorage,
} from "./site-map-model";

const HOME = "/";
const experiences = [
  { slug: "windaid", title: "WindAid" },
  { slug: "victaulic", title: "Victaulic" },
  { slug: "new-rig", title: "New Rig" },
];
const changes: PageChanges = {
  pages: [
    { page: HOME, mark: "changed" },
    { page: "windaid", mark: null },
    { page: "victaulic", mark: "changed" },
    { page: "new-rig", mark: "new" },
  ],
  removed: [{ slug: "volunteer", homeTitle: "Volunteer", pageTitle: "Volunteer Work" }],
};

function rows(): MapRow[] {
  return mapRows({ homePage: HOME, experiences, changes });
}

describe("the rows of the admin map (2.4.19, 2.4.21, 2.4.29, 2.4.30, KTD9)", () => {
  it("lists the home page first, then each experience in site order, then the removed pages", () => {
    expect(rows().map((row) => [row.kind, row.page, row.title, row.mark])).toEqual([
      ["home", HOME, "Home", "changed"],
      ["experience", "windaid", "WindAid", null],
      ["experience", "victaulic", "Victaulic", "changed"],
      ["experience", "new-rig", "New Rig", "new"],
      ["removed", "volunteer", "Volunteer", "removed"],
    ]);
  });

  it("gives the home page and each experience its editor and preview address", () => {
    const [home, windaid] = rows();
    expect(home).toMatchObject({ editHref: "/admin/home", previewHref: "/preview", liveHref: null, frameHref: "/preview" });
    expect(windaid).toMatchObject({
      editHref: "/admin/experiences/windaid",
      previewHref: "/preview/experiences/windaid",
      liveHref: null,
      frameHref: "/preview/experiences/windaid",
    });
  });

  it("encodes a slug in each address", () => {
    const [, odd] = mapRows({ homePage: HOME, experiences: [{ slug: "a b", title: "A B" }], changes: null });
    expect(odd.editHref).toBe("/admin/experiences/a%20b");
    expect(odd.previewHref).toBe("/preview/experiences/a%20b");
    expect(selectHref(odd)).toBe("/admin?page=a%20b");
  });

  it("gives a removed page only its live page: no editor and no preview", () => {
    const removed = rows()[4];
    expect(removed).toMatchObject({ editHref: null, previewHref: null, liveHref: "/experiences/volunteer", frameHref: "/experiences/volunteer" });
    expect(openHref(removed)).toBe("/experiences/volunteer");
    expect(frameTitle(removed)).toBe("Live page of Volunteer");
  });

  it("shows no mark when the published site cannot be compared", () => {
    expect(mapRows({ homePage: HOME, experiences, changes: null }).map((row) => row.mark)).toEqual([null, null, null, null]);
  });

  it("opens the preview of a page that is in the draft", () => {
    const [home, windaid] = rows();
    expect(openHref(home)).toBe("/preview");
    expect(frameTitle(windaid)).toBe("Preview of WindAid");
  });
});

describe("the selected page in the address (KTD9)", () => {
  it("keeps the home page out of the address, and names any other page by its slug", () => {
    const list = rows();
    expect(selectHref(list[0])).toBe("/admin");
    expect(selectHref(list[2])).toBe("/admin?page=victaulic");
    expect(selectHref(list[4])).toBe("/admin?page=volunteer");
  });

  it("selects the page that the address names, and the home page for no or an unknown name", () => {
    const list = rows();
    expect(rowFromParam("victaulic", list).page).toBe("victaulic");
    expect(rowFromParam("volunteer", list).kind).toBe("removed");
    expect(rowFromParam(null, list).kind).toBe("home");
    expect(rowFromParam("", list).kind).toBe("home");
    expect(rowFromParam("gone", list).kind).toBe("home");
  });

  it("never reads the home page's id as a slug", () => {
    expect(rowFromParam("/", rows()).kind).toBe("home");
  });
});

describe("the list or wall choice (2.4.25, KTD9)", () => {
  function memory(): ViewStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
  }

  it("starts with the list view, and keeps the wall view once chosen", () => {
    const storage = memory();
    expect(readView(() => storage)).toBe("list");
    expect(writeView(() => storage, "wall")).toBe(true);
    expect(storage.data.get(VIEW_KEY)).toBe("wall");
    expect(readView(() => storage)).toBe("wall");
  });

  it("reads an unknown stored value as the list view", () => {
    const storage = memory();
    storage.data.set(VIEW_KEY, "grid");
    expect(readView(() => storage)).toBe("list");
  });

  it("shows the list view when the storage fails", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(readView(blocked)).toBe("list");
    expect(writeView(blocked, "wall")).toBe(false);
    const throwing: ViewStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readView(() => throwing)).toBe("list");
    expect(writeView(() => throwing, "wall")).toBe(false);
  });
});

describe("the link lists of the selected page (2.4.22, 2.4.24)", () => {
  const links: SiteLinks = {
    pages: [
      { page: HOME, linksTo: [{ page: "windaid", reasons: ["card"] }], linksFrom: [{ page: "windaid", reasons: ["header", "text"] }] },
      {
        page: "windaid",
        linksTo: [
          { page: HOME, reasons: ["header", "text"] },
          { page: "victaulic", reasons: ["next"] },
        ],
        linksFrom: [{ page: HOME, reasons: ["card"] }],
      },
    ],
    outside: [],
  };

  it("names each linked page by its title, with the reasons in words", () => {
    const lines = linkLines(links, rows());
    expect(lines[HOME].to).toEqual([{ page: "windaid", title: "WindAid", reasons: "card" }]);
    expect(lines.windaid.to).toEqual([
      { page: HOME, title: "Home", reasons: "header, link in the text" },
      { page: "victaulic", title: "Victaulic", reasons: "next link" },
    ]);
    expect(lines.windaid.from).toEqual([{ page: HOME, title: "Home", reasons: "card" }]);
  });

  it("gives a page with no entry in the link list two empty lists", () => {
    const lines = linkLines(links, rows());
    expect(lines.volunteer).toEqual({ to: [], from: [] });
    expect(lines["new-rig"]).toEqual({ to: [], from: [] });
  });
});

describe("the arrow keys in the page list (2.4.26)", () => {
  it("moves one row up or down and stops at each end", () => {
    expect(nextRowIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextRowIndex(2, "ArrowUp", 3)).toBe(1);
    expect(nextRowIndex(2, "ArrowDown", 3)).toBeNull();
    expect(nextRowIndex(0, "ArrowUp", 3)).toBeNull();
    expect(nextRowIndex(1, "Enter", 3)).toBeNull();
  });
});
