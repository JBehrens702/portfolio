import { describe, expect, it } from "vitest";
import { dropPrivatePages, isPrivatePath } from "./analytics";

const site = "https://www.jonathanbehrens.space";

describe("isPrivatePath", () => {
  it("marks the admin, preview, and sign-in pages", () => {
    expect(isPrivatePath("/admin")).toBe(true);
    expect(isPrivatePath("/admin/experiences/tcr")).toBe(true);
    expect(isPrivatePath("/preview")).toBe(true);
    expect(isPrivatePath("/preview/experiences/tcr")).toBe(true);
    expect(isPrivatePath("/sign-in/factor-one")).toBe(true);
  });

  it("keeps the public pages", () => {
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/experiences/tcr")).toBe(false);
    expect(isPrivatePath("/administration")).toBe(false);
    expect(isPrivatePath("/experiences/admin")).toBe(false);
  });
});

describe("dropPrivatePages", () => {
  it("sends a page view of a public page unchanged", () => {
    const event = { type: "pageview" as const, url: `${site}/experiences/tcr?x=1#work` };
    expect(dropPrivatePages(event)).toBe(event);
  });

  it("drops page views and events of the owner's pages", () => {
    expect(dropPrivatePages({ type: "pageview", url: `${site}/admin/home` })).toBeNull();
    expect(dropPrivatePages({ type: "event", url: `${site}/preview` })).toBeNull();
  });

  it("drops an event whose address cannot be read", () => {
    expect(dropPrivatePages({ type: "pageview", url: "not a url" })).toBeNull();
  });
});
