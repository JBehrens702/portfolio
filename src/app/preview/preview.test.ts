import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { createMemoryContentStore, type ContentStore } from "@/lib/content/store";
import { experience, makeSite, textBlock } from "@/lib/content/test-fixtures";

// U5 / 2.4.7: the preview pages render the DRAFT exactly as the public pages
// would (same visibility function and views), with the preview marker. The
// owner check and the store are replaced, so no Clerk session is needed; the
// access refusals themselves are covered by owner.test.ts and
// e2e/admin-access.spec.ts.

const requireOwnerPage = vi.hoisted(() => vi.fn());
const storeRef = vi.hoisted(() => ({ current: null as ContentStore | null }));

vi.mock("@/lib/auth/owner", () => ({ requireOwnerPage }));
vi.mock("@/lib/content/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/content/store")>();
  return { ...original, createContentStoreFromEnv: () => storeRef.current };
});
// Under Vite a static image import is a plain string with no size, which
// next/image refuses; the images are not what these tests check.
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ src, alt }: { src: string | { src: string }; alt: string }) =>
      createElement("img", { src: typeof src === "string" ? src : src.src, alt }),
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import PreviewHome from "./page";
import PreviewExperience from "./experiences/[slug]/page";

const DRAFT_ONLY = "A draft summary the public page does not show yet.";

function draftSite() {
  return makeSite({
    labels: {
      selectedWork: { text: "Selected Work", approved: true },
      readMore: { text: "Read more", approved: true },
      previewMarker: { text: "Preview", approved: false },
    },
    experiences: [
      experience("victaulic", {
        homeText: DRAFT_ONLY,
        blocks: [textBlock("t1", DRAFT_ONLY), textBlock("t2", "   ")],
      }),
      experience("second"),
    ],
  });
}

async function html(page: Promise<ReactElement>) {
  return renderToStaticMarkup(await page);
}

/** The address of the logo link: the first link in the header. */
function logoHref(page: string): string | undefined {
  const header = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
  return /<a [^>]*href="([^"]*)"/.exec(header)?.[1];
}

beforeEach(async () => {
  requireOwnerPage.mockReset().mockResolvedValue("user_owner");
  const { store } = createMemoryContentStore();
  await store.writePublished(makeSite({ experiences: [experience("victaulic", { homeText: "" })] }));
  await store.writeDraft(draftSite());
  storeRef.current = store;
});

describe("preview home", () => {
  it("shows the draft change, the preview marker, and links that stay in the preview", async () => {
    const page = await html(PreviewHome());
    expect(requireOwnerPage).toHaveBeenCalledOnce();
    expect(page).toContain(DRAFT_ONLY);
    expect(page).toContain('data-testid="preview-marker"');
    expect(page).toContain('href="/preview/experiences/victaulic"');
    expect(page).not.toContain('href="/experiences/victaulic"');
    expect(logoHref(page)).toBe("/preview");
  });

  it("hides the marker when the previewMarker label is missing (1.2.4)", async () => {
    const site = draftSite();
    delete site.labels.previewMarker;
    await storeRef.current!.writeDraft(site);
    expect(await html(PreviewHome())).not.toContain("preview-marker");
  });

  it("renders nothing of the draft when the owner check refuses", async () => {
    requireOwnerPage.mockRejectedValue(new Error("NEXT_REDIRECT sign-in"));
    await expect(PreviewHome()).rejects.toThrow("NEXT_REDIRECT sign-in");
  });
});

describe("preview experience page", () => {
  const params = (slug: string) => Promise.resolve({ slug });

  it("shows the draft text through the visibility function", async () => {
    const page = await html(PreviewExperience({ params: params("victaulic") }));
    expect(requireOwnerPage).toHaveBeenCalledOnce();
    expect(page).toContain(DRAFT_ONLY);
    expect(page).toContain('data-testid="preview-marker"');
    expect(logoHref(page)).toBe("/preview");
  });

  it("gives 404 for an unknown slug", async () => {
    await expect(PreviewExperience({ params: params("no-such-page") })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("checks the owner before it reads the slug or the draft", async () => {
    requireOwnerPage.mockRejectedValue(new Error("NEXT_REDIRECT sign-in"));
    const readDraft = vi.spyOn(storeRef.current!, "readDraft");
    await expect(PreviewExperience({ params: params("victaulic") })).rejects.toThrow("NEXT_REDIRECT sign-in");
    expect(readDraft).not.toHaveBeenCalled();
  });
});
