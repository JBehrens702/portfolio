import { expect, test, type Page } from "@playwright/test";

// U3: the pinned carousel on gamma-project (three slides) and the single slide on
// beta-project (0.1.13-0.1.16, KTD8). Runs on the e2e fixture, like public.spec.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.route("https://media.e2e.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
});

/** The carousel's geometry: where the frame pins, one step of scroll, and the page position of slide 1. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const block = document.querySelector<HTMLElement>("[data-carousel]")!;
    const frame = block.children[block.children.length - 2] as HTMLElement;
    const spacer = block.lastElementChild as HTMLElement;
    const pinTop = parseFloat(getComputedStyle(frame).top);
    const start = window.scrollY + block.getBoundingClientRect().top - pinTop;
    return { pinTop, step: spacer.offsetHeight / 2, start, frameHeight: frame.offsetHeight };
  });
}

const activeIndex = (page: Page) =>
  page.evaluate(() => {
    const slides = [...document.querySelectorAll<HTMLElement>("[data-carousel] [data-slide]")];
    return slides.findIndex((slide) => slide.getAttribute("aria-hidden") === null);
  });

const frameTop = (page: Page) =>
  page.evaluate(() => {
    const block = document.querySelector<HTMLElement>("[data-carousel]")!;
    return (block.children[block.children.length - 2] as HTMLElement).getBoundingClientRect().top;
  });

test("AE1: the scroll turns the slides while the frame stays pinned, in both directions", async ({ page }) => {
  await page.goto("/experiences/gamma-project");
  const { pinTop, step, start } = await geometry(page);
  expect(step).toBeGreaterThan(100);

  const seen: number[] = [];
  const tops: number[] = [];
  for (const k of [0, 1, 2]) {
    await page.evaluate((y) => window.scrollTo(0, y), start + k * step);
    await expect.poll(() => activeIndex(page)).toBe(k);
    seen.push(await activeIndex(page));
    tops.push(await frameTop(page));
  }
  expect(seen).toEqual([0, 1, 2]);
  for (const top of tops) expect(Math.abs(top - pinTop)).toBeLessThan(2);

  // After the last slide the frame scrolls away with the page.
  await page.evaluate((y) => window.scrollTo(0, y), start + 2 * step + 300);
  await expect.poll(() => frameTop(page)).toBeLessThan(pinTop - 200);
  await expect(page.getByText("Gamma text after the slides.")).toBeInViewport();

  // Up again: 3, 2, 1, then the page continues up.
  const back: number[] = [];
  for (const k of [2, 1, 0]) {
    await page.evaluate((y) => window.scrollTo(0, y), start + k * step);
    await expect.poll(() => activeIndex(page)).toBe(k);
    back.push(k);
  }
  expect(back).toEqual([2, 1, 0]);
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, start - 400));
  await expect.poll(() => frameTop(page)).toBeGreaterThan(pinTop + 100);
});

test("the mouse wheel turns the slides one step at a time", async ({ page }) => {
  await page.goto("/experiences/gamma-project");
  const { start, step } = await geometry(page);
  await page.evaluate((y) => window.scrollTo(0, y), start);
  await expect.poll(() => activeIndex(page)).toBe(0);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, step);
  await expect.poll(() => activeIndex(page)).toBe(1);
  await page.mouse.wheel(0, step);
  await expect.poll(() => activeIndex(page)).toBe(2);
});

test("the keyboard reaches the next button, and the skip link moves focus past the carousel", async ({ page }) => {
  await page.goto("/experiences/gamma-project");
  const { start } = await geometry(page);
  await page.evaluate((y) => window.scrollTo(0, y), start);
  await expect.poll(() => activeIndex(page)).toBe(0);

  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => activeIndex(page)).toBe(1);

  const skip = page.getByRole("link", { name: "Skip the slides" });
  await skip.focus();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("after-g-car");
});

test("each slide is named by its position, and only the visible slide is exposed", async ({ page }) => {
  await page.goto("/experiences/gamma-project");
  await expect(page.getByRole("group", { name: "01/03" })).toBeAttached();
  await expect(page.locator("[data-carousel] [data-slide]")).toHaveCount(3);
  await expect(page.locator("[data-carousel] [data-slide]:not([aria-hidden])")).toHaveCount(1);
});

test("with reduced motion, a slide change has no transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experiences/gamma-project");
  const duration = await page.locator("[data-carousel] [data-slide]").first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration.split(",").every((d) => parseFloat(d) === 0)).toBe(true);
});

test("the frame fits the screen, and the page never scrolls sideways", async ({ page }) => {
  await page.goto("/experiences/gamma-project");
  const { frameHeight, pinTop } = await geometry(page);
  const viewport = page.viewportSize()!;
  expect(pinTop + frameHeight).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a carousel with one slide shows a plain image with its text and does not pin", async ({ page }) => {
  await page.goto("/experiences/beta-project");
  await expect(page.locator("[data-carousel]")).toHaveCount(0);
  await expect(page.getByAltText("Beta single slide")).toBeVisible();
  await expect(page.getByText("Beta single slide text.")).toBeVisible();
});
