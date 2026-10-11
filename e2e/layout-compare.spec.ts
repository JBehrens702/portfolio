import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// 0.2.8: the five real pages keep their arrangement after the move to rows.
// The fixture e2e/fixtures/content/layout is the seed content (the same five
// pages) in the version-1 format, so the site's read-time upgrade runs too.
// Run against a dev server with CONTENT_SOURCE=file:e2e/fixtures/content
// CONTENT_ROOT=layout, and set LAYOUT_FIXTURE=1. LAYOUT_RECORD=1 writes the
// baseline instead of comparing. A pixel comparison is not used: the image
// column of a converted pair narrows by 3 % (KTD3), which moves everything below.

const SLUGS = [
  "thermocouple-reader-system",
  "turbine-testing-stand",
  "victaulic-internship",
  "solidworks-experience",
  "volunteer-experience",
];
const BASELINE = path.join(__dirname, "fixtures", "layout-baseline");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.skip(!process.env.LAYOUT_FIXTURE, "needs a dev server on the layout fixture (LAYOUT_FIXTURE=1)");

interface Arrangement {
  /** Each content element in page order: its kind and a short identity. */
  order: string[];
  /** Pairs of elements that sit side by side, as "left | right". */
  beside: string[];
}

async function arrangement(page: Page): Promise<Arrangement> {
  return page.evaluate(() => {
    const body = document.querySelector("article");
    if (!body) throw new Error("no article");
    const header = body.querySelector("header");
    const selector = "h2, h3, .prose > p, figure img, dl, blockquote, a[href*='download']";
    const nodes = [...body.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => !header?.contains(el) && !el.closest("nav") && el.getClientRects().length > 0,
    );
    const key = (el: HTMLElement) => {
      if (el instanceof HTMLImageElement) {
        const src = new URL(el.currentSrc || el.src, location.href);
        const inner = src.searchParams.get("url") ?? src.pathname;
        return `img:${decodeURIComponent(inner).split("/").pop()}`;
      }
      return `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 32)}`;
    };
    const boxes = nodes.map((el) => ({ key: key(el), box: el.getBoundingClientRect() }));
    const beside: string[] = [];
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.box.right > b.box.left) continue;
        const overlap = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (overlap > 0.3 * Math.min(a.box.height, b.box.height)) beside.push(`${a.key} | ${b.key}`);
      }
    }
    return { order: boxes.map((b) => b.key), beside: beside.sort() };
  });
}

for (const slug of SLUGS) {
  test(`keeps the arrangement of ${slug}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://media.e2e.test/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
    );
    await page.goto(`/experiences/${slug}`);
    await page.waitForLoadState("networkidle");
    const current = await arrangement(page);
    const file = path.join(BASELINE, `${slug}-${testInfo.project.name}.json`);
    if (process.env.LAYOUT_RECORD) {
      await mkdir(BASELINE, { recursive: true });
      await writeFile(file, `${JSON.stringify(current, null, 2)}\n`);
      await page.screenshot({ path: testInfo.outputPath(`${slug}-baseline.png`), fullPage: true });
      return;
    }
    await page.screenshot({ path: testInfo.outputPath(`${slug}-after.png`), fullPage: true });
    const baseline = JSON.parse(await readFile(file, "utf8")) as Arrangement;
    expect(current.order).toEqual(baseline.order);
    expect(current.beside).toEqual(baseline.beside);
  });
}
