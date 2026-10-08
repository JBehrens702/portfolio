import { expect, test } from "@playwright/test";

// U3 scenarios. Run them after U4 wires the Header into the pages.

test("robots.txt disallows /admin and /preview", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toMatch(/^Disallow: \/admin$/m);
  expect(body).toMatch(/^Disallow: \/preview$/m);
});

test("the site title is the title of the Google Site", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Jonathan Behrens' Portfolio");
});

test.describe("phone menu at 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the menu button opens the menu, Tab reaches each link, and each link goes to its section", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.locator("header").first();
    const button = header.locator("button[aria-expanded]");
    const list = page.locator(`#${await button.getAttribute("aria-controls")}`);

    // No sideways scroll at phone width (0.1.9).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Closed: the links are hidden and the button is at least 44 px high.
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Open with the keyboard.
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();

    const links = list.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    // Tab moves through every link in order; each is at least 44 px high.
    for (let i = 0; i < count; i++) {
      await page.keyboard.press("Tab");
      await expect(links.nth(i)).toBeFocused();
      expect((await links.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    // Escape closes the menu and returns focus to the button.
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();

    // Each in-page link goes to its section.
    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    for (const [i, href] of hrefs.entries()) {
      const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
      if (!hash) continue; // the resume link is a file, not a section
      if (!(await button.getAttribute("aria-expanded"))?.includes("true")) await button.click();
      await links.nth(i).click();
      await expect(page).toHaveURL(new RegExp(`${hash}$`));
      await expect(button).toHaveAttribute("aria-expanded", "false");
      const section = page.locator(hash);
      await expect(section).toBeInViewport();
    }
  });
});
