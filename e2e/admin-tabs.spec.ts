import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { layoutBlocks } from "../src/lib/content/layout";
import { createBlobMediaStorage } from "../src/lib/content/media-gc";
import { assertSite, type Experience, type Row, type Site } from "../src/lib/content/schema";
import {
  blobCredentialsFromEnv,
  createBlobContentStore,
  docsCredentialsFromEnv,
  type BlobCredentials,
  type ContentStore,
} from "../src/lib/content/store";
import { deleteRoot, signInOwner } from "./fixtures/owner";

// U8: the out-of-date tab safeguard (2.4.32-2.4.35, 0.4.36) with two tabs of
// one signed-in browser, against the DEVELOPMENT Blob stores under a test-only
// content root, which is deleted from both stores after the run. Same server
// and variables as admin-layout.spec.ts:
//   CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<random> next dev
//   E2E_ADMIN=1 CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<same> npx playwright test e2e/admin-tabs.spec.ts --project=desktop

loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });

const ROOT = process.env.CONTENT_ROOT ?? "";
const WINDAID = "windaid";
const VICTAULIC = "victaulic";
const TURBINE = "turbine";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// The label of a text block's field (BlockFields); each seeded page has one text block.
const TEXT_LABEL = "Text (a blank line starts a new paragraph";
const OTHER_TAB = "Not saved: another tab changed this part";

const expect = baseExpect.configure({ timeout: 150_000 });
test.describe.configure({ mode: "serial", timeout: 1_200_000 });
test.skip(process.env.E2E_ADMIN !== "1", "set E2E_ADMIN=1 with CONTENT_SOURCE=blob and a test CONTENT_ROOT (see the top)");

function seedSite(): Site {
  const page = (slug: string, title: string, text: string): Experience => {
    const row: Row = { id: `r-${slug}`, type: "row", layout: "one", cells: [[{ id: `t-${slug}`, type: "text", text }]] };
    return { slug, homeTitle: title, pageTitle: title, skills: ["CAD"], homeText: `${title} home paragraph.`, layout: [row] };
  };
  return assertSite({
    schemaVersion: 2,
    profile: { name: "E2E Owner", tagline: "E2E tagline", introParagraphs: ["E2E intro."] },
    contact: { email: "e2e-owner@example.com" },
    labels: {
      nextExperience: { text: "Next Experience", approved: true },
      selectedWork: { text: "Selected Work", approved: true },
      softwareHeading: { text: "Software projects", approved: true },
      aboutHeading: { text: "About me", approved: true },
      readMore: { text: "Read more", approved: true },
    },
    software: [],
    experiences: [
      page(WINDAID, "WindAid", "WindAid seed paragraph."),
      page(VICTAULIC, "Victaulic Internship", "Victaulic seed paragraph."),
      page(TURBINE, "Turbine Test Stand", "Turbine seed paragraph."),
    ],
  });
}

let store: ContentStore;
let docs: BlobCredentials;
let media: BlobCredentials;
let context: BrowserContext;

async function draftExperience(slug: string): Promise<Experience> {
  const site = await store.readDraft();
  return site!.experiences.find((e) => e.slug === slug)!;
}

async function draftText(slug: string): Promise<string | undefined> {
  const block = layoutBlocks((await draftExperience(slug)).layout).find((b) => b.type === "text");
  return block?.type === "text" ? block.text : undefined;
}

/** A new tab of the signed-in browser on the editor of one experience, ready for input. */
async function openEditor(slug: string): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto(`/admin/experiences/${slug}`);
  await expect(tab.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  return tab;
}

async function saveAndExpectSaved(tab: Page) {
  await tab.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(tab.getByTestId("saved")).toBeVisible();
  await expect(tab.getByTestId("unsaved")).toHaveCount(0);
}

/**
 * The owner returns to a tab. Headless Chromium keeps every page "visible" and
 * fires no visibilitychange on bringToFront, so the tab is first marked hidden
 * and then visible, with one event each, as a real return does. StaleProvider
 * listens for that event on the document and checks only in the visible state.
 */
async function returnTo(tab: Page) {
  await tab.bringToFront();
  await tab.evaluate(() => {
    const mark = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    mark("hidden");
    mark("visible");
    // The browser's own value comes back from the prototype.
    Reflect.deleteProperty(document, "visibilityState");
  });
}

/** The next server action call of a tab (the return check is the only one in flight). */
function nextActionResponse(tab: Page) {
  return tab.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined);
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
  await store.writeDraft(seedSite());
  await store.writePublished(seedSite());
  context = await browser.newContext({ baseURL });
  context.setDefaultNavigationTimeout(180_000);
  await signInOwner(await context.newPage());
  // signInOwner sets the Clerk testing token on its own page only (after
  // clerkSetup creates it); every tab the tests open needs it too, or Clerk's
  // development check sends that tab to sign-in.
  await setupClerkTestingToken({ context });
});

test.afterAll(async () => {
  await context?.close();
  if (docs) await deleteRoot(ROOT, docs);
  if (media) await deleteRoot(ROOT, media);
});

test("AE1: a save from an out-of-date tab is refused, keeps its edits, and offers Reload (2.4.32, 2.4.34)", async () => {
  const tabA = await openEditor(WINDAID);
  const tabB = await openEditor(WINDAID);

  await tabA.getByLabel(TEXT_LABEL).fill("WindAid paragraph from tab A.");
  await saveAndExpectSaved(tabA);
  expect(await draftText(WINDAID)).toBe("WindAid paragraph from tab A.");

  // A different field of the same page part.
  await tabB.getByLabel("Subtitle (optional)").fill("Subtitle from tab B");
  await tabB.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(tabB.getByTestId("save-error")).toContainText(OTHER_TAB);
  await expect(tabB.getByTestId("save-reload")).toBeVisible();
  await expect(tabB.getByLabel("Subtitle (optional)")).toHaveValue("Subtitle from tab B");
  await expect(tabB.getByLabel(TEXT_LABEL)).toHaveValue("WindAid seed paragraph.");
  await expect(tabB.getByTestId("unsaved")).toBeVisible();

  // The draft holds tab A's change and nothing of tab B's.
  const saved = await draftExperience(WINDAID);
  expect(await draftText(WINDAID)).toBe("WindAid paragraph from tab A.");
  expect(saved.subtitle ?? "").toBe("");

  // Reload asks first, because tab B has unsaved edits; Cancel keeps them.
  await tabB.getByTestId("save-reload").click();
  const dialog = tabB.getByTestId("confirm-dialog");
  await expect(dialog).toContainText("Reload and lose your unsaved edits?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(tabB.getByLabel("Subtitle (optional)")).toHaveValue("Subtitle from tab B");

  // Reload shows the draft: tab A's text, without tab B's subtitle.
  await tabB.getByTestId("save-reload").click();
  await tabB.getByTestId("confirm-dialog").getByRole("button", { name: "Reload" }).click();
  await expect(tabB.getByLabel(TEXT_LABEL)).toHaveValue("WindAid paragraph from tab A.");
  await expect(tabB.getByLabel("Subtitle (optional)")).toHaveValue("");
  await expect(tabB.getByTestId("save-error")).toHaveCount(0);

  await tabA.close();
  await tabB.close();
});

test("AE2: saves to two different pages from two tabs both succeed (2.4.33)", async () => {
  const tabA = await openEditor(WINDAID);
  const tabB = await openEditor(VICTAULIC);

  await tabA.getByLabel(TEXT_LABEL).fill("WindAid paragraph, second visit.");
  await tabB.getByLabel(TEXT_LABEL).fill("Victaulic paragraph from tab B.");
  await saveAndExpectSaved(tabA);
  await saveAndExpectSaved(tabB);
  await expect(tabB.getByTestId("save-error")).toHaveCount(0);

  expect(await draftText(WINDAID)).toBe("WindAid paragraph, second visit.");
  expect(await draftText(VICTAULIC)).toBe("Victaulic paragraph from tab B.");

  await tabA.close();
  await tabB.close();
});

test("AE4: a tab whose page another tab saved shows the banner on return, before any edit (2.4.35)", async () => {
  const tabA = await openEditor(VICTAULIC);
  const tabB = await openEditor(VICTAULIC);

  await tabB.getByLabel(TEXT_LABEL).fill("Victaulic paragraph, saved while tab A waited.");
  await saveAndExpectSaved(tabB);

  await returnTo(tabA);
  const banner = tabA.getByTestId("stale-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Another tab saved a newer version of the Victaulic Internship page");
  // Nothing was typed in tab A.
  await expect(tabA.getByLabel(TEXT_LABEL)).toHaveValue("Victaulic paragraph from tab B.");
  await expect(tabA.getByTestId("unsaved")).toHaveCount(0);

  // The banner's Reload (no unsaved edits, so no question) loads the newer version.
  await banner.getByRole("button", { name: "Reload" }).click();
  await expect(tabA.getByLabel(TEXT_LABEL)).toHaveValue("Victaulic paragraph, saved while tab A waited.");
  await expect(tabA.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  await expect(tabA.getByTestId("stale-banner")).toHaveCount(0);

  // A tab never warns about its own save.
  await tabA.getByLabel(TEXT_LABEL).fill("Victaulic paragraph from tab A itself.");
  await saveAndExpectSaved(tabA);
  const checked = nextActionResponse(tabA);
  await returnTo(tabA);
  await (await checked).finished();
  await tabA.waitForTimeout(1000);
  await expect(tabA.getByTestId("stale-banner")).toHaveCount(0);

  await tabA.close();
  await tabB.close();
});

test("AE3: a save that brings back a file no longer in the media store is refused (0.4.36)", async () => {
  const tab = await openEditor(TURBINE);
  const cardImage = tab.getByTestId("media-field").filter({ hasText: "the card image" });

  // An upload saves at once.
  await tab.getByLabel("Upload the card image").setInputFiles({ name: "e2e-card.png", mimeType: "image/png", buffer: PNG });
  await expect(tab.getByLabel("Replace the card image")).toBeVisible();
  await expect.poll(async () => (await draftExperience(TURBINE)).cardImage?.url ?? "").not.toBe("");
  const url = (await draftExperience(TURBINE)).cardImage!.url;
  await expect(tab.getByTestId("unsaved")).toHaveCount(0);

  // A removal saves at once.
  await cardImage.getByRole("button", { name: "Remove file" }).click();
  await tab.getByTestId("confirm-dialog").getByRole("button", { name: "Remove" }).click();
  await expect(tab.getByLabel("Upload the card image")).toBeVisible();
  await expect.poll(async () => (await draftExperience(TURBINE)).cardImage).toBeUndefined();
  await expect(tab.getByTestId("unsaved")).toHaveCount(0);

  // The test stands in for the cleanup after a Publish: the file leaves the media store.
  const storage = createBlobMediaStorage(media);
  await storage.delete([url]);
  await expect.poll(() => storage.exists(url)).toBe(false);

  // Undo brings the removed image back on screen; its save is refused by the file check.
  await tab.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(tab.getByLabel("Replace the card image")).toBeVisible();
  await tab.getByRole("button", { name: "Save draft", exact: true }).click();
  const error = tab.getByTestId("save-error");
  await expect(error).toContainText('Not saved: the file "e2e-card.png" is no longer stored. Upload it again.');
  await expect(error).not.toContainText(OTHER_TAB);
  await expect(tab.getByTestId("save-reload")).toHaveCount(0);
  await expect(tab.getByTestId("unsaved")).toBeVisible();

  // The draft is unchanged: no card image, also in a fresh load of the editor.
  expect((await draftExperience(TURBINE)).cardImage).toBeUndefined();
  const fresh = await openEditor(TURBINE);
  await expect(fresh.getByLabel("Upload the card image")).toBeVisible();
  await expect(fresh.getByLabel("Replace the card image")).toHaveCount(0);

  await tab.close();
  await fresh.close();
});
