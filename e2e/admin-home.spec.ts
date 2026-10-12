import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { assertSite, type Site } from "../src/lib/content/schema";
import {
  blobCredentialsFromEnv,
  createBlobContentStore,
  docsCredentialsFromEnv,
  type BlobCredentials,
  type ContentStore,
} from "../src/lib/content/store";
import { deleteRoot, signInOwner } from "./fixtures/owner";

// U7: the home page editor (2.4.8), signed in as the owner, against the
// DEVELOPMENT Blob stores under a test-only content root (deleted after the run).
// Same server and variables as admin-layout.spec.ts:
//   E2E_ADMIN=1 CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<same> npx playwright test e2e/admin-home.spec.ts --project=desktop

loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });

const ROOT = process.env.CONTENT_ROOT ?? "";
const expect = baseExpect.configure({ timeout: 150_000 });
test.describe.configure({ mode: "serial", timeout: 1_200_000 });
test.skip(process.env.E2E_ADMIN !== "1", "set E2E_ADMIN=1 with CONTENT_SOURCE=blob and a test CONTENT_ROOT");

function seedSite(): Site {
  return assertSite({
    schemaVersion: 2,
    profile: { name: "E2E Owner", tagline: "Old tagline", introParagraphs: ["E2E intro."] },
    contact: { email: "e2e-owner@example.com" },
    labels: {
      selectedWork: { text: "Selected Work", approved: true },
      softwareHeading: { text: "Software projects", approved: true },
      aboutHeading: { text: "About me", approved: true },
      readMore: { text: "Read more", approved: true },
    },
    software: [{ id: "tool", name: "E2E Tool", overview: "A tool." }],
    experiences: [
      {
        slug: "home-lab",
        homeTitle: "Home Lab",
        pageTitle: "Home Lab Page",
        skills: ["CAD"],
        homeText: "Home lab paragraph.",
        layout: [{ id: "r", type: "row", layout: "one", cells: [[{ id: "t", type: "text", text: "Layout text that must stay." }]] }],
      },
    ],
  });
}

let store: ContentStore;
let docs: BlobCredentials;
let media: BlobCredentials;
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one signed-in project");
  test.setTimeout(400_000);
  if (!/^e2e-[a-z0-9-]+$/.test(ROOT)) throw new Error(`CONTENT_ROOT must be a test root such as "e2e-1a2b3c", not "${ROOT}"`);
  docs = docsCredentialsFromEnv()!;
  media = blobCredentialsFromEnv()!;
  store = createBlobContentStore({ root: ROOT, secret: process.env.CONTENT_PATH_SECRET ?? "" }, { credentials: docs });
  await store.writeDraft(seedSite());
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

test("the home editor shows the home sections in their real order", async () => {
  await page.goto("/admin/home");
  await expect(page.getByTestId("home-editor")).toBeVisible();
  const headings = page.locator("[data-testid=home-editor] > section > div > h2");
  await expect(headings).toHaveText(["Selected Work", "Software projects", "About me", "Contact"]);
  await expect(page.getByLabel("Top of the home page").getByLabel("Heading (tagline)")).toHaveValue("Old tagline");
});

test("a tagline and a card title saved in the home editor show in the preview, and the layout stays", async () => {
  await page.goto("/admin/home");
  const saveButtons = page.getByRole("button", { name: "Save draft", exact: true });
  await expect(saveButtons.first()).toBeEnabled();
  await page.getByLabel("Heading (tagline)").fill("New tagline");
  await page.getByLabel("About me").getByRole("textbox").fill("New intro paragraph.");
  await page.getByLabel("Contact").getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByLabel("Contact").getByTestId("saved")).toBeVisible();

  const card = page.getByTestId("home-card");
  await card.getByLabel("Title on the home page").fill("Home Lab Renamed");
  await card.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(card.getByTestId("saved")).toBeVisible();

  const site = (await store.readDraft())!;
  expect(site.profile.tagline).toBe("New tagline");
  expect(site.profile.introParagraphs).toEqual(["New intro paragraph."]);
  expect(site.experiences[0].homeTitle).toBe("Home Lab Renamed");
  expect(JSON.stringify(site.experiences[0].layout)).toContain("Layout text that must stay.");

  await page.goto("/preview");
  await expect(page.getByText("New tagline")).toBeVisible();
  await expect(page.locator("#work article h3")).toHaveText(["Home Lab Renamed"]);
  await page.goto("/admin/experiences/home-lab");
  await expect(page.locator('input[name="homeTitle"]')).toHaveValue("Home Lab Renamed");
});
