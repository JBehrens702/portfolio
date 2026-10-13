import { expect as baseExpect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { assertSite, type Experience, type Site } from "../src/lib/content/schema";
import {
  blobCredentialsFromEnv,
  createBlobContentStore,
  docsCredentialsFromEnv,
  type BlobCredentials,
  type ContentStore,
} from "../src/lib/content/store";
import { deleteRoot, signInOwner } from "./fixtures/owner";

// U6 of the map plan: the map of the site on the admin home (2.4.18 to 2.4.30),
// signed in as the owner, against the DEVELOPMENT Blob stores under a test-only
// content root (deleted after the run). Same server and variables as
// admin-layout.spec.ts:
//   CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<random> next dev
//   E2E_ADMIN=1 CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<same> npx playwright test e2e/admin-map.spec.ts --project=desktop

loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });

const ROOT = process.env.CONTENT_ROOT ?? "";
const expect = baseExpect.configure({ timeout: 150_000 });
test.describe.configure({ mode: "serial", timeout: 1_200_000 });
test.skip(process.env.E2E_ADMIN !== "1", "set E2E_ADMIN=1 with CONTENT_SOURCE=blob and a test CONTENT_ROOT (see the top)");

function experience(slug: string, homeTitle: string, pageTitle: string): Experience {
  return {
    slug,
    homeTitle,
    pageTitle,
    skills: ["CAD"],
    homeText: `${homeTitle} home paragraph.`,
    layout: [{ id: `r-${slug}`, type: "row", layout: "one", cells: [[{ id: `t-${slug}`, type: "text", text: `${pageTitle} text.` }]] }],
  };
}

function seedSite(): Site {
  return assertSite({
    schemaVersion: 2,
    profile: { name: "E2E Owner", tagline: "E2E tagline", introParagraphs: ["E2E intro."] },
    contact: { email: "e2e-owner@example.com" },
    // The card links need "readMore" and the next links need "nextExperience" (KTD7).
    labels: {
      readMore: { text: "Read more", approved: true },
      nextExperience: { text: "Next Experience", approved: true },
    },
    software: [],
    experiences: [
      experience("windaid", "WindAid", "WindAid Page"),
      experience("victaulic", "Victaulic", "Victaulic Internship Page"),
      experience("thermocouple-reader", "Thermocouple reader", "Thermocouple Reader Page"),
      experience("volunteer", "Volunteer", "Volunteer Page"),
    ],
  });
}

let store: ContentStore;
let docs: BlobCredentials;
let media: BlobCredentials;
let context: BrowserContext;
let page: Page;

const titles = () => page.locator("[data-map-title]");
const experienceRow = (title: string): Locator => page.getByTestId("experience-row").filter({ has: page.getByRole("link", { name: title, exact: true }) });
const mapTitle = (row: Locator) => row.locator("[data-map-title]");
const largeFrame = () => page.getByTestId("map-picture").locator("iframe");

/** Opens the map and waits until React runs, so a title click selects instead of loading the page again. */
async function openMap() {
  await page.goto("/admin");
  await expect(page.getByTestId("admin-home")).toBeVisible();
  await expect(page.getByRole("button", { name: "Wall view" })).toBeEnabled();
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one signed-in project; the steps share one draft");
  test.setTimeout(400_000);
  if (!/^e2e-[a-z0-9-]+$/.test(ROOT)) throw new Error(`CONTENT_ROOT must be a test root such as "e2e-1a2b3c", not "${ROOT}"`);
  if (process.env.CONTENT_SOURCE !== "blob") throw new Error("CONTENT_SOURCE must be blob for this spec");
  docs = docsCredentialsFromEnv()!;
  media = blobCredentialsFromEnv()!;
  if (!docs || !media) throw new Error("No development Blob stores in the environment");
  store = createBlobContentStore({ root: ROOT, secret: process.env.CONTENT_PATH_SECRET ?? "" }, { credentials: docs });
  // The draft equals the published site (AE5 "Given").
  await store.writeDraft(seedSite());
  await store.writePublished(seedSite());
  context = await browser.newContext({ baseURL });
  context.setDefaultNavigationTimeout(180_000);
  page = await context.newPage();
  await signInOwner(page);
});

test.afterAll(async () => {
  await context?.close();
  if (docs) await deleteRoot(ROOT, docs);
  if (media) await deleteRoot(ROOT, media);
});

test("the list shows the home page, then each experience in site order, with its editor and preview addresses (2.4.19, 2.4.21)", async () => {
  await openMap();
  await expect(titles()).toHaveText(["Home", "WindAid", "Victaulic", "Thermocouple reader", "Volunteer"]);
  // The draft equals the published site: no marks.
  await expect(page.getByTestId("page-mark")).toHaveCount(0);

  const home = page.getByTestId("home-row");
  await expect(home.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "/admin/home");
  await expect(home.getByRole("link", { name: "Preview", exact: true })).toHaveAttribute("href", "/preview");
  for (const [slug, title] of [
    ["windaid", "WindAid"],
    ["victaulic", "Victaulic"],
    ["thermocouple-reader", "Thermocouple reader"],
    ["volunteer", "Volunteer"],
  ]) {
    const row = experienceRow(title);
    await expect(row.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", `/admin/experiences/${slug}`);
    await expect(row.getByRole("link", { name: "Preview", exact: true })).toHaveAttribute("href", `/preview/experiences/${slug}`);
  }
});

test("selecting a page loads its preview in the large frame with its links, and a reload keeps it (2.4.20, 2.4.22)", async () => {
  await openMap();
  // With no parameter, the home page is selected.
  await expect(largeFrame()).toHaveAttribute("src", "/preview");

  await mapTitle(experienceRow("Victaulic")).click();
  await expect(page).toHaveURL(/\/admin\?page=victaulic$/);
  await expect(mapTitle(experienceRow("Victaulic"))).toHaveAttribute("aria-current", "true");
  await expect(largeFrame()).toHaveAttribute("src", "/preview/experiences/victaulic");
  await expect(largeFrame()).toHaveAttribute("title", "Preview of Victaulic");
  const frame = page.frameLocator('[data-testid="map-picture"] iframe');
  await expect(frame.getByRole("heading", { level: 1, name: "Victaulic Internship Page" })).toBeVisible();
  await expect(page.getByTestId("map-picture").getByTestId("frame-placeholder")).toHaveCount(0);

  const from = page.getByTestId("links-from");
  await expect(from).toContainText("Home (card)");
  await expect(from).toContainText("WindAid (next link)");
  const to = page.getByTestId("links-to");
  await expect(to).toContainText("Home (header)");
  await expect(to).toContainText("Thermocouple reader (next link)");

  await page.reload();
  await expect(page.getByRole("button", { name: "Wall view" })).toBeEnabled();
  await expect(mapTitle(experienceRow("Victaulic"))).toHaveAttribute("aria-current", "true");
  await expect(largeFrame()).toHaveAttribute("src", "/preview/experiences/victaulic");

  // 2.4.26: the arrow keys move the selection through the rows.
  await mapTitle(experienceRow("Victaulic")).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/admin\?page=thermocouple-reader$/);
  await expect(mapTitle(experienceRow("Thermocouple reader"))).toBeFocused();
  await expect(largeFrame()).toHaveAttribute("src", "/preview/experiences/thermocouple-reader");
});

test("the wall view shows one picture per page, survives a reload, and opens a preview (2.4.25)", async () => {
  await openMap();
  await page.getByRole("button", { name: "Wall view" }).click();
  const tiles = page.getByTestId("wall-tile");
  await expect(tiles).toHaveCount(5);
  await expect(tiles.locator("iframe")).toHaveCount(5);
  await expect(tiles.locator("iframe").first()).toHaveAttribute("loading", "lazy");
  await expect(tiles.nth(2).getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "/admin/experiences/victaulic");
  await expect(tiles.nth(2).getByRole("link", { name: "Preview", exact: true })).toHaveAttribute("href", "/preview/experiences/victaulic");

  await page.reload();
  await expect(page.getByRole("button", { name: "Wall view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("wall-tile")).toHaveCount(5);
  await expect(page.getByTestId("map-picture")).toHaveCount(0);

  await page.getByRole("button", { name: "Open Victaulic preview" }).click();
  await expect(page).toHaveURL(/\/preview\/experiences\/victaulic$/);

  // Back to the list view for the next steps.
  await openMap();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("map-picture")).toBeVisible();
});

test("at phone width the list shows alone, and a tap on a row opens its preview (2.4.27)", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  try {
    await openMap();
    await expect(page.getByTestId("experience-row")).toHaveCount(4);
    await expect(page.getByTestId("map-picture")).toBeHidden();
    await mapTitle(experienceRow("Victaulic")).click();
    await expect(page).toHaveURL(/\/preview\/experiences\/victaulic$/);
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test("AE5: an edit, a new page, and a removal show their marks; after Publish no mark remains (2.4.29, 2.4.30)", async () => {
  // The owner edits the Victaulic page (its page part).
  const site = (await store.readDraft())!;
  await store.writeDraft({
    ...site,
    experiences: site.experiences.map((e) => (e.slug === "victaulic" ? { ...e, pageTitle: "Victaulic Internship Page, edited" } : e)),
  });

  // Add a page from the map; the map opens its editor.
  await openMap();
  await page.getByLabel("New experience title").fill("Wind Rig");
  await page.getByRole("button", { name: "Add experience" }).click();
  await expect(page).toHaveURL(/\/admin\/experiences\/wind-rig$/);

  // Remove the Volunteer page from its map row.
  await openMap();
  await experienceRow("Volunteer").getByRole("button", { name: "Remove", exact: true }).click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText('Remove the experience "Volunteer"');
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByTestId("experience-row")).toHaveCount(4);

  await page.reload();
  await expect(page.getByRole("button", { name: "Wall view" })).toBeEnabled();
  await expect(titles()).toHaveText(["Home", "WindAid", "Victaulic", "Thermocouple reader", "Wind Rig", "Volunteer"]);
  // The home page shows the order and the cards, so it is changed too (KTD8).
  await expect(page.getByTestId("home-row").getByTestId("page-mark")).toHaveText("changed");
  await expect(experienceRow("WindAid").getByTestId("page-mark")).toHaveCount(0);
  await expect(experienceRow("Victaulic").getByTestId("page-mark")).toHaveText("changed");
  await expect(experienceRow("Thermocouple reader").getByTestId("page-mark")).toHaveCount(0);
  await expect(experienceRow("Wind Rig").getByTestId("page-mark")).toHaveText("new");

  // The removed page: the mark and a link to the live page, and no editor, preview, move, or remove control (KTD9).
  const removed = page.getByTestId("removed-row");
  await expect(removed).toHaveCount(1);
  await expect(removed.getByTestId("page-mark")).toHaveText("removed");
  await expect(removed.getByRole("link", { name: "Live page", exact: true })).toHaveAttribute("href", "/experiences/volunteer");
  await expect(removed.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(removed.getByRole("link", { name: "Preview", exact: true })).toHaveCount(0);
  await expect(removed.getByRole("button")).toHaveCount(0);
  // Its picture is the live page.
  await removed.locator("[data-map-title]").click();
  await expect(page).toHaveURL(/\/admin\?page=volunteer$/);
  await expect(largeFrame()).toHaveAttribute("src", "/experiences/volunteer");
  await expect(largeFrame()).toHaveAttribute("title", "Live page of Volunteer");

  // F2: publish from the map's Publish panel; then no page carries a mark.
  await page.getByTestId("publish-panel").getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByTestId("publish-result")).toContainText("Published at");
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Wall view" })).toBeEnabled();
  await expect(titles()).toHaveText(["Home", "WindAid", "Victaulic", "Thermocouple reader", "Wind Rig"]);
  await expect(page.getByTestId("page-mark")).toHaveCount(0);
  await expect(page.getByTestId("removed-row")).toHaveCount(0);
});

test("the map keeps the controls of the admin home: move, the Publish panel, and the editor links (2.4.28)", async () => {
  await openMap();
  await expect(page.getByTestId("publish-panel")).toBeVisible();
  await expect(page.getByRole("link", { name: "Home page", exact: true })).toHaveAttribute("href", "/admin/home");
  await expect(page.getByRole("link", { name: "Profile and contact links", exact: true })).toHaveAttribute("href", "/admin/profile");
  await expect(page.getByRole("link", { name: "Software cards", exact: true })).toHaveAttribute("href", "/admin/software");
  await expect(page.getByRole("link", { name: "Labels", exact: true })).toHaveAttribute("href", "/admin/labels");
  await expect(page.getByTestId("admin-home")).toContainText("(all approved)");

  await page.getByRole("button", { name: 'Move "Wind Rig" up' }).click();
  await expect(titles()).toHaveText(["Home", "WindAid", "Victaulic", "Wind Rig", "Thermocouple reader"]);
  expect((await store.readDraft())!.experiences.map((e) => e.slug)).toEqual(["windaid", "victaulic", "wind-rig", "thermocouple-reader"]);
  // A reorder is an unpublished change of the home page.
  await expect(page.getByTestId("home-row").getByTestId("page-mark")).toHaveText("changed");
});

// ---- U7: the page bar on every editor and preview page (KTD10, 2.4.31) ----

test("F1: the page bar opens any page's preview or editor in one click, and the map (2.4.31)", async () => {
  await page.goto("/admin/experiences/windaid");
  const editBar = page.getByTestId("page-bar");
  await expect(editBar.getByRole("link", { name: "WindAid", exact: true })).toHaveAttribute("aria-current", "page");
  await editBar.getByRole("link", { name: "Preview Victaulic", exact: true }).click();
  await expect(page).toHaveURL(/\/preview\/experiences\/victaulic$/);

  const previewBar = page.getByTestId("page-bar");
  await expect(previewBar.getByRole("link", { name: "Victaulic", exact: true })).toHaveAttribute("aria-current", "page");
  await previewBar.getByRole("link", { name: "Edit Victaulic", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/experiences\/victaulic$/);

  await page.getByTestId("page-bar").getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
});

test("on the Profile editor the bar marks the home page as the current page (KTD10)", async () => {
  await page.goto("/admin/profile");
  await expect(page.getByTestId("page-bar").getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
});

test("the map's large picture shows no page bar, also after a click inside it (KTD6)", async () => {
  await openMap();
  await expect(largeFrame()).toHaveAttribute("src", "/preview");
  await expect(page.getByTestId("map-picture").getByTestId("frame-placeholder")).toHaveCount(0);
  const frame = page.frameLocator('[data-testid="map-picture"] iframe');
  await expect(frame.locator('a[href="/preview/experiences/windaid"]').first()).toBeVisible();
  await expect(frame.getByTestId("page-bar")).toHaveCount(0);

  // A client navigation inside the frame carries no Sec-Fetch-Dest: iframe; the browser check hides the bar.
  await frame.locator('a[href="/preview/experiences/windaid"]').first().click();
  await expect(frame.getByRole("heading", { level: 1, name: "WindAid Page" })).toBeVisible();
  await expect(frame.getByTestId("page-bar")).toHaveCount(0);
});

test("at phone width the page bar scrolls inside itself, and the page never scrolls sideways (2.4.31)", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  try {
    for (const url of ["/admin/experiences/windaid", "/preview/experiences/windaid"]) {
      await page.goto(url);
      await expect(page.getByTestId("page-bar")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `sideways scroll on ${url}`).toBeLessThanOrEqual(0);
    }
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});
