import { expect, test } from "@playwright/test";

// Click to enlarge: an image of an experience page opens larger in a dialog.
// Runs on the e2e fixture, like public.spec: CONTENT_SOURCE=file:e2e/fixtures/content
// CONTENT_ROOT=e2e. alpha-project has a block with enlarge on (two shown images),
// beta-project a block with enlarge off, and gamma-project a carousel.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.route("https://media.e2e.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
});

test("the whole image is a button with a small tag, and opens larger in a dialog", async ({ page }) => {
  await page.goto("/experiences/alpha-project");
  const buttons = page.locator("main figure button[data-zoom]");
  await expect(buttons).toHaveCount(2);
  // The button's name is the image's alt text and the tag.
  const first = page.getByRole("button", { name: "Alpha figure one Enlarge image" });
  await expect(first).toBeVisible();
  // The second image has no alt text: the tag alone names the button.
  await expect(page.getByRole("button", { name: "Enlarge image", exact: true })).toHaveCount(1);

  // The tag is small: at most 12 px text, and far smaller than the image.
  const tag = first.getByText("Enlarge image");
  await expect(tag).toBeVisible();
  expect(parseFloat(await tag.evaluate((el) => getComputedStyle(el).fontSize))).toBeLessThanOrEqual(12);
  const tagBox = (await tag.boundingBox())!;
  const imageBox = (await first.boundingBox())!;
  expect(tagBox.width * tagBox.height).toBeLessThan((imageBox.width * imageBox.height) / 10);

  // A click away from the tag also opens the view: the whole image is the target.
  await first.click({ position: { x: 20, y: 20 } });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Alpha figure one" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");

  // Escape closes it and focus goes back to the image button.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("the close button and a click beside the image close the view; a click on the image does not", async ({ page }) => {
  await page.goto("/experiences/alpha-project");
  const first = page.getByRole("button", { name: "Alpha figure one Enlarge image" });
  const dialog = page.getByRole("dialog");

  await first.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("img").click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  await first.click();
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize()!;
  await page.mouse.click(5, viewport.height - 5);
  await expect(dialog).toBeHidden();
});

test("the second image opens its own large copy", async ({ page }) => {
  await page.goto("/experiences/alpha-project");
  await page.getByRole("button", { name: "Enlarge image", exact: true }).click();
  const large = page.getByRole("dialog").locator("img");
  await expect(large).toHaveCount(1);
  await expect(large).toHaveAttribute("alt", "");
});

test("a block with enlarge off and the carousel slides do not open larger", async ({ page }) => {
  await page.goto("/experiences/beta-project");
  await expect(page.locator("main figure img").first()).toBeVisible();
  await expect(page.locator("[data-zoom]")).toHaveCount(0);
  await expect(page.locator("dialog")).toHaveCount(0);

  await page.goto("/experiences/gamma-project");
  await expect(page.locator("[data-carousel]")).toHaveCount(1);
  await expect(page.locator("[data-carousel] [data-zoom]")).toHaveCount(0);
});
