import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAllowedMarking } from "../src/components/site/markings";

// U4 scenarios. The dev server reads e2e/fixtures/content through the file
// backend: CONTENT_SOURCE=file:e2e/fixtures/content CONTENT_ROOT=e2e.
// Fixture media sit on the host media.e2e.test, which never resolves; each test
// answers those requests itself with a tiny PNG or PDF.

const FIXTURE = path.join(__dirname, "fixtures", "content", "e2e", "published.json");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const SLUGS = ["alpha-project", "beta-project", "gamma-project"];

async function serveFixtureMedia(page: Page) {
  await page.route("https://media.e2e.test/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(".pdf")) {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers:
          url.searchParams.get("download") === "1"
            ? { "content-disposition": `attachment; filename="${path.basename(url.pathname)}"` }
            : {},
        body: "%PDF-1.4\n% fixture\n",
      });
    }
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
}

async function sidewaysOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.beforeEach(async ({ page }) => {
  await serveFixtureMedia(page);
});

test("F1: the home page shows the hero, then one block per experience in order", async ({ page }) => {
  await page.goto("/");
  // The heading is the tagline (the Google Site heading), not a second copy of the name.
  await expect(page.getByRole("heading", { level: 1, name: "Hi, I'm Fixture Owner" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Fixture hero photo" })).toBeVisible();

  const work = page.locator("#work");
  await expect(work.getByRole("heading", { level: 2, name: "Selected Work" })).toBeVisible();
  const blocks = work.locator("article");
  await expect(blocks).toHaveCount(3);
  await expect(blocks.locator("h3")).toHaveText(["Alpha Project", "Beta Project", "Gamma Project"]);

  for (const [i, slug] of SLUGS.entries()) {
    const block = blocks.nth(i);
    await expect(block.locator("img")).toHaveCount(1);
    await expect(block.getByText(/home paragraph\.$/)).toBeVisible();
    const link = block.getByRole("link", { name: /Read more/ });
    await expect(link).toHaveAttribute("href", `/experiences/${slug}`);
  }
  // An empty skill is hidden, and an empty skills list shows no list.
  await expect(blocks.nth(0).locator("ul li")).toHaveText(["CAD", "FEA"]);
  await expect(blocks.nth(1).locator("ul")).toHaveCount(0);
  await expect(blocks.nth(2).locator("ul li")).toHaveText(["Leadership", "Volunteering"]);

  await blocks.nth(0).getByRole("link", { name: /Read more/ }).click();
  // The first client navigation after a dev-server start can wait for compilation.
  await expect(page).toHaveURL(/\/experiences\/alpha-project$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Alpha Project Page" })).toBeVisible();
});

test("the intro paragraphs and the contact links show", async ({ page }) => {
  await page.goto("/");
  const about = page.locator("#about");
  await expect(about.getByText("Fixture intro paragraph one.")).toBeVisible();
  await expect(about.getByRole("link", { name: "an intro link" })).toHaveAttribute("href", "https://example.com/intro");

  const contact = page.locator("#contact");
  await expect(contact.getByRole("heading", { name: "Get in touch:" })).toBeVisible();
  await expect(contact.getByRole("link", { name: "linkedin.com/in/fixture-owner" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/fixture-owner/",
  );
  await expect(contact.getByRole("link", { name: "fixture@example.com" })).toHaveAttribute("href", "mailto:fixture@example.com");
  await expect(contact.getByRole("link", { name: "app.joinrise.co/professional/fixture-owner" })).toHaveAttribute(
    "href",
    "https://app.joinrise.co/professional/fixture-owner",
  );
});

test("the software strip comes after the experiences, and no card links to a full page", async ({ page }) => {
  await page.goto("/");
  const work = page.locator("#work");
  const software = page.locator("#software");
  await expect(software).toBeVisible();
  const after = await work.evaluate(
    (w, s) => !!s && (w.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    await software.elementHandle(),
  );
  expect(after).toBe(true);

  const cards = software.locator("article");
  await expect(cards.locator("h3")).toHaveText(["Dashboard", "[UN]Quotable"]); // the card without overview is hidden
  await expect(cards.nth(0).getByRole("img", { name: "Dashboard screenshot" })).toBeVisible();
  await expect(cards.nth(0).locator("a")).toHaveCount(0);

  const link = cards.nth(1).getByRole("link", { name: /\[UN\]Quotable/ });
  await expect(link).toHaveAttribute("href", "https://unquotable.626house.casa");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");

  const hrefs = await software.locator("a").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
  expect((await page.request.get("/experiences/dashboard")).status()).toBe(404);
  expect((await page.request.get("/experiences/unquotable")).status()).toBe(404);
});

test("an image without owner alt text has an empty alt attribute", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#work article").nth(1).locator("img")).toHaveAttribute("alt", "");
  await expect(page.locator("#work article").nth(0).locator("img")).toHaveAttribute("alt", "Alpha card image");

  await page.goto("/experiences/alpha-project");
  const figures = page.locator("main figure img");
  await expect(figures).toHaveCount(2); // the item without a file is hidden
  await expect(figures.nth(0)).toHaveAttribute("alt", "Alpha figure one");
  await expect(figures.nth(1)).toHaveAttribute("alt", "");
});

test("an experience page shows its blocks in order and hides what is empty", async ({ page }) => {
  await page.goto("/experiences/alpha-project");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Alpha Project Page");
  await expect(main.getByText("Alpha subtitle")).toBeVisible();
  await expect(main.locator("h2, h3")).toHaveText(["Alpha overview", "Alpha details"]);
  await expect(main.locator("dl dt")).toHaveText(["Skills Demonstrated", "Client"]);
  await expect(main.locator("dl dd").first()).toHaveText("CAD, FEA");
  // A line break in a fact value shows as a line break.
  expect(await main.locator("dl dd").nth(1).evaluate((el) => (el as HTMLElement).innerText)).toBe(
    "Dr. Fixture Client\nProfessor, Fixture University",
  );
  await expect(main.locator("figcaption")).toHaveText("Alpha figure caption");
  await expect(main.locator("blockquote")).toHaveText("Alpha quoted problem statement.");
  await expect(main.getByText("Missing file")).toHaveCount(0);
  await expect(main.getByText("Hidden empty section")).toHaveCount(0);

  const file = main.getByRole("link", { name: "Download Alpha report" });
  await expect(file).toHaveAttribute("href", "https://media.e2e.test/e2e/media/alpha-report.pdf?download=1");
  const download = page.waitForEvent("download");
  await file.click();
  expect((await download).suggestedFilename()).toBe("alpha-report.pdf");
});

test("a text link renders as a link, an autolink too, and raw HTML renders as plain text", async ({ page }) => {
  await page.goto("/experiences/alpha-project");
  const main = page.locator("main");
  const link = main.getByRole("link", { name: "a block link" });
  await expect(link).toHaveAttribute("href", "https://example.com/block");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");

  // A CommonMark autolink is a link too.
  const autolink = main.getByRole("link", { name: "https://www.example.com/video" });
  await expect(autolink).toHaveAttribute("href", "https://www.example.com/video");
  await expect(autolink).toHaveAttribute("target", "_blank");

  // A site path opens in the same tab.
  const internal = main.getByRole("link", { name: "gamma page" });
  await expect(internal).toHaveAttribute("href", "/experiences/gamma-project");
  await expect(internal).not.toHaveAttribute("target", /.*/);

  await expect(main.getByText("Raw <b>bold</b> and <script>window.__xss = 1</script> stay text.")).toBeVisible();
  await expect(main.locator("b, script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test("each experience page links to the next one, and the last links to the first", async ({ page }) => {
  for (const [i, slug] of SLUGS.entries()) {
    await page.goto(`/experiences/${slug}`);
    const next = page.getByRole("link", { name: /Next Experience/ });
    await expect(next).toHaveAttribute("href", `/experiences/${SLUGS[(i + 1) % SLUGS.length]}`);
  }
  await page.getByRole("link", { name: /Next Experience/ }).click();
  await expect(page).toHaveURL(/\/experiences\/alpha-project$/);
});

test("an unknown experience slug gives a 404 page", async ({ page }) => {
  const response = await page.goto("/experiences/no-such-experience");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
});

test("the Tab key moves through the home page links in reading order, each with a visible outline", async ({
  page,
}) => {
  await page.goto("/");
  // Number every link and button in document order, then keep the ones that can take focus.
  // The numbers live in page memory, not in DOM attributes, so React hydration is not disturbed.
  const expected = await page.evaluate(() => {
    const ids: string[] = [];
    const probe = new Map<Element, string>();
    (window as unknown as { __tabProbe: Map<Element, string> }).__tabProbe = probe;
    document.querySelectorAll("a[href], button").forEach((el, i) => {
      const element = el as HTMLElement;
      probe.set(element, String(i));
      const shown = element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
      if (shown && element.tabIndex >= 0) ids.push(String(i));
    });
    return ids;
  });
  expect(expected.length).toBeGreaterThan(5);

  await page.locator("body").focus();
  for (const id of expected) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      const probe = (window as unknown as { __tabProbe: Map<Element, string> }).__tabProbe;
      return { id: probe.get(el) ?? null, outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(focused?.id).toBe(id);
    expect(focused?.outline).not.toBe("none");
    expect(focused?.width).toBeGreaterThanOrEqual(2);
  }
});

// The decorative technical markings (owner decision, 2026-10-09): every one is
// aria-hidden, cannot be selected, sits outside headings and links, and holds
// only derived numbers, grid letters, and the drafting tokens of markings.ts.
test("every technical marking is aria-hidden, unselectable, and holds no words", async ({ page }) => {
  for (const url of ["/", ...SLUGS.map((slug) => `/experiences/${slug}`), "/experiences/no-such-experience"]) {
    await page.goto(url);
    const markings = await page.locator("[data-marking]").evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent ?? "",
        hidden: el.closest('[aria-hidden="true"]') !== null,
        selectable: getComputedStyle(el).userSelect !== "none",
        inNamed: el.closest("h1, h2, h3, h4, h5, h6, a, button, label") !== null,
      })),
    );
    if (url === "/") expect(markings.length, url).toBeGreaterThan(10);
    for (const marking of markings) {
      expect(marking.hidden, `${url}: ${marking.text}`).toBe(true);
      expect(marking.selectable, `${url}: ${marking.text}`).toBe(false);
      expect(marking.inNamed, `${url}: ${marking.text}`).toBe(false);
      expect(isAllowedMarking(marking.text), `${url}: "${marking.text}"`).toBe(true);
    }
  }

  // The values are derived from the order and the count: the fixture has three experiences.
  await page.goto("/");
  await expect(page.locator("#work article [data-marking]")).toHaveText(["REF 01/03", "REF 02/03", "REF 03/03"]);
  await page.goto("/experiences/beta-project");
  await expect(page.locator("main header [data-marking]")).toHaveText("REF 02/03");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("no page scrolls sideways at 375 px", async ({ page }) => {
    for (const url of ["/", ...SLUGS.map((slug) => `/experiences/${slug}`), "/experiences/no-such-experience"]) {
      await page.goto(url);
      expect(await sidewaysOverflow(page), url).toBeLessThanOrEqual(0);
    }
  });
});

// AE1 changes the published fixture on disk, so only one project runs it. The
// dev server bypasses its "use cache" entries for a request that sends
// "cache-control: no-cache"; that stands in for the cache refresh of a Publish.
test("AE1: no resume button without a resume; after a publish with one, the button downloads it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "changes the shared fixture; one project is enough");
  await page.setExtraHTTPHeaders({ "cache-control": "no-cache" });
  const original = await readFile(FIXTURE, "utf8");
  try {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Resume" })).toHaveCount(0);
    await expect(page.locator("[data-resume]")).toHaveCount(0);

    const site = JSON.parse(original);
    site.profile.resumeFile = {
      url: "https://media.e2e.test/e2e/media/resume.pdf",
      pathname: "e2e/media/resume.pdf",
      contentType: "application/pdf",
      fileName: "Resume.pdf",
    };
    await writeFile(FIXTURE, JSON.stringify(site, null, 2) + "\n", "utf8");

    await page.goto("/");
    const button = page.locator("main [data-resume]");
    await expect(button).toBeVisible();
    await expect(button).toHaveText("Resume");
    await expect(button).toHaveAttribute("href", "https://media.e2e.test/e2e/media/resume.pdf?download=1");
    const download = page.waitForEvent("download");
    await button.click();
    expect((await download).suggestedFilename()).toBe("resume.pdf");
  } finally {
    await writeFile(FIXTURE, original, "utf8");
    // Refill the cache with the restored document for the other tests.
    await page.request.get("/", { headers: { "cache-control": "no-cache" } });
  }
});
