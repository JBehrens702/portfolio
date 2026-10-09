import { expect as baseExpect, test, type BrowserContext, type Page } from "@playwright/test";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { loadEnvConfig } from "@next/env";
import { del } from "@vercel/blob";
import {
  blobCredentialsFromEnv,
  createBlobContentStore,
  docsCredentialsFromEnv,
  listAllBlobs,
  type BlobCredentials,
  type ContentStore,
} from "../src/lib/content/store";
import type { Site } from "../src/lib/content/schema";
import { exifSegments, hasGps, withGpsExif } from "./fixtures/exif";

// U6 scenarios in a real browser, signed in as the owner with Clerk's testing
// token, against the DEVELOPMENT Blob stores under a test-only content root, so
// the seeded content ("site") is never touched. As in the app, the documents
// (draft, published, history) are in the private documents store (DEVDOCS) and
// the uploaded files in the public media store (DEV). The root and everything
// under it are deleted from both stores after the run.
//
// Run it against its own dev server, started with the Blob source and the test root:
//   CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<random> next dev -p 3001
//   E2E_PUBLISH=1 CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<same> E2E_BASE_URL=http://localhost:3001 \
//     npx playwright test e2e/publish.spec.ts --project=desktop
// Without E2E_PUBLISH=1 (for example in the fixture-source run of the other
// specs) the whole file is skipped.

loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });

const ROOT = process.env.CONTENT_ROOT ?? "";
const ENABLED = process.env.E2E_PUBLISH === "1";

// A dev server compiles each route on its first visit, which can take more
// than a minute in the container; the waits here allow for that.
const expect = baseExpect.configure({ timeout: 150_000 });
test.describe.configure({ mode: "serial", timeout: 1_200_000 });
test.skip(!ENABLED, "set E2E_PUBLISH=1 with CONTENT_SOURCE=blob and a test CONTENT_ROOT (see the comment at the top)");

const VICTAULIC = "victaulic-internship";
const SUMMARY = "During my internship at Victaulic I tested grooved couplings. (e2e summary)";

function seedSite(): Site {
  return {
    schemaVersion: 1,
    profile: { name: "E2E Owner", tagline: "Hi, I'm E2E Owner", introParagraphs: ["E2E intro paragraph."] },
    contact: { email: "e2e-owner@example.com" },
    labels: {
      selectedWork: { text: "Selected Work", approved: true },
      readMore: { text: "Read more", approved: true },
      nextExperience: { text: "Next Experience", approved: true },
      previewMarker: { text: "Preview", approved: true },
      softwareHeading: { text: "Software projects", approved: false },
    },
    experiences: [
      { slug: "turbine-stand", homeTitle: "Turbine Stand", pageTitle: "Turbine Testing Stand", skills: ["CAD"], homeText: "Turbine home paragraph.", blocks: [] },
      {
        slug: VICTAULIC,
        homeTitle: "Victaulic Internship",
        pageTitle: "Victaulic Internship",
        skills: ["Testing"],
        homeText: "Victaulic home paragraph.",
        blocks: [
          { id: "t-keep", type: "text", text: "A paragraph that must survive a cancelled removal." },
          // An empty section: the heading stays hidden until the summary has text (0.1.8).
          { id: "h-summary", type: "heading", text: "Summary", level: 2 },
          { id: "t-summary", type: "text", text: "" },
        ],
      },
    ],
    software: [],
  };
}

let store: ContentStore;
let visitors: BrowserContext;
/** The private documents store, which the app reads with docsCredentialsFromEnv(). */
let docsCredentials: BlobCredentials;
/** The public media store, which the upload route writes with blobCredentialsFromEnv(). */
let mediaCredentials: BlobCredentials;
let context: BrowserContext;
let page: Page;

async function ownerEmail(): Promise<string> {
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(process.env.ADMIN_USER_ID ?? "")}`, {
    headers: { authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Clerk user lookup failed with status ${response.status}`);
  const user = (await response.json()) as {
    primary_email_address_id: string | null;
    email_addresses: { id: string; email_address: string }[];
  };
  const email = user.email_addresses.find((e) => e.id === user.primary_email_address_id) ?? user.email_addresses[0];
  if (!email) throw new Error("The owner's Clerk user has no email address");
  return email.email_address;
}

async function waitForClerk(target: Page) {
  for (let attempt = 1; ; attempt++) {
    try {
      await target.waitForLoadState("load");
      await target.waitForFunction(() => (window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true, null, {
        timeout: 20_000,
      });
      // A dev server that is still compiling reloads the page; the marker shows that it stayed put.
      await target.evaluate(() => ((window as { e2eStable?: boolean }).e2eStable = true));
      await target.waitForTimeout(1500);
      if (await target.evaluate(() => (window as { e2eStable?: boolean }).e2eStable === true)) return;
      throw new Error("the page reloaded");
    } catch (error) {
      if (attempt >= 5) throw error;
    }
  }
}

/** Deletes everything under the test root from one store. */
async function deleteRoot(credentials: BlobCredentials) {
  const urls = (await listAllBlobs(`${ROOT}/`, credentials)).map((b) => b.url);
  for (let i = 0; i < urls.length; i += 100) await del(urls.slice(i, i + 100), credentials);
}

async function draft(): Promise<Site> {
  const site = await store.readDraft();
  if (!site) throw new Error("no draft");
  return site;
}

/**
 * Opens an admin page and waits until React has hydrated it: the named button
 * is disabled in the server HTML and enabled once its handler is attached.
 */
async function open(path: string, readyButton: string) {
  await page.goto(path);
  await expect(page.getByRole("button", { name: readyButton, exact: true })).toBeEnabled({ timeout: 150_000 });
}

async function publishFromAdmin() {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByTestId("publish-result")).toContainText("Published at", { timeout: 150_000 });
}

/** A public page in a context without the owner's session. */
async function visitorPage(path: string): Promise<Page> {
  const visitor = await visitors.newPage();
  await visitor.goto(path);
  return visitor;
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one signed-in project is enough; the steps share one draft");
  test.setTimeout(400_000);
  // Never run against a root that is not a test root.
  if (!/^e2e-[a-z0-9-]+$/.test(ROOT)) throw new Error(`CONTENT_ROOT must be a test root such as "e2e-1a2b3c", not "${ROOT}"`);
  if (process.env.CONTENT_SOURCE !== "blob") throw new Error("CONTENT_SOURCE must be blob for this spec");
  const docs = docsCredentialsFromEnv();
  const media = blobCredentialsFromEnv();
  if (!docs) throw new Error("No development documents store in the environment (DEVDOCS_READ_WRITE_TOKEN or DEVDOCS_STORE_ID)");
  if (!media) throw new Error("No development media store in the environment (DEV_READ_WRITE_TOKEN or DEV_STORE_ID)");
  docsCredentials = docs;
  mediaCredentials = media;
  // The same store as the app: the private documents store (createContentStoreFromEnv).
  store = createBlobContentStore({ root: ROOT, secret: process.env.CONTENT_PATH_SECRET ?? "" }, { credentials: docsCredentials });
  const site = seedSite();
  await store.writeDraft(site);
  await store.writePublished({ ...site, labels: { ...site.labels, softwareHeading: { text: "Software projects", approved: true } } });

  await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY });
  context = await browser.newContext({ baseURL });
  visitors = await browser.newContext({ baseURL });
  // A page load can wait for the dev server to compile the route (see the top).
  context.setDefaultNavigationTimeout(180_000);
  visitors.setDefaultNavigationTimeout(180_000);
  page = await context.newPage();
  await setupClerkTestingToken({ page });
  // Clerk's development handshake can reload the sign-in page once, which
  // removes window.Clerk between the two waits inside clerk.signIn. Wait until
  // Clerk is loaded on a settled page, and try the sign-in once more on failure.
  const emailAddress = await ownerEmail();
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto("/sign-in", { waitUntil: "commit" });
      await waitForClerk(page);
      await clerk.signIn({ page, emailAddress });
      break;
    } catch (error) {
      console.log(`Clerk sign-in attempt ${attempt} failed at ${page.url()}: ${(error as Error).message.split("\n")[0]}`);
      if (attempt >= 3) throw error;
    }
  }
  await page.goto("/admin", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-home")).toBeVisible({ timeout: 60_000 });
});

test.afterAll(async () => {
  await context?.close();
  await visitors?.close();
  if (ENABLED && /^e2e-[a-z0-9-]+$/.test(ROOT)) {
    if (docsCredentials) await deleteRoot(docsCredentials);
    if (mediaCredentials) await deleteRoot(mediaCredentials);
  }
});

test("AE6: Publish with an unapproved label is refused and names it; after approval, Publish works", async () => {
  const before = JSON.stringify(await store.readPublished());
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const result = page.getByTestId("publish-result");
  await expect(result).toContainText("Not published: approve these labels first.");
  await expect(result.getByTestId("unapproved-label")).toHaveCount(1);
  await expect(result.getByTestId("unapproved-label")).toContainText('softwareHeading: “Software projects”');
  expect(JSON.stringify(await store.readPublished())).toBe(before);

  await result.getByRole("button", { name: "Approve softwareHeading" }).click();
  await expect(result.getByText("Approved")).toBeVisible();
  expect((await draft()).labels.softwareHeading.approved).toBe(true);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByTestId("publish-result")).toContainText("Published at");
  expect((await store.readPublished())!.labels.softwareHeading.approved).toBe(true);
});

test("AE2: a saved summary is hidden from visitors, shown in the preview, and public after Publish", async () => {
  await open(`/admin/experiences/${VICTAULIC}`, "Save draft");
  const summary = page.locator("[data-testid=block][data-block-type=text] textarea").last();
  await expect(summary).toHaveValue("");
  await summary.fill(SUMMARY);
  await expect(page.getByTestId("unsaved")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("saved")).toContainText("Saved at");
  await expect(page.getByTestId("unsaved")).toHaveCount(0);

  const visitor = await visitorPage(`/experiences/${VICTAULIC}`);
  await expect(visitor.getByRole("heading", { level: 1, name: "Victaulic Internship" })).toBeVisible();
  await expect(visitor.getByText(SUMMARY)).toHaveCount(0);
  await expect(visitor.getByRole("heading", { name: "Summary" })).toHaveCount(0);

  await page.goto(`/preview/experiences/${VICTAULIC}`);
  await expect(page.getByTestId("preview-marker")).toBeVisible();
  await expect(page.getByText(SUMMARY)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();

  await publishFromAdmin();
  await visitor.goto(`/experiences/${VICTAULIC}`);
  await expect(visitor.getByText(SUMMARY)).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Summary" })).toBeVisible();
  await visitor.close();
});

test("upload refusals name the allowed types and the 25 MB limit, and change nothing", async () => {
  const before = JSON.stringify(await draft());
  await open(`/admin/experiences/${VICTAULIC}`, "Save draft");
  const card = page.getByLabel("Upload the card image");
  await card.setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await expect(page.getByTestId("upload-error")).toHaveText("File refused. Allowed image types: JPEG, PNG, WebP, and GIF, up to 25 MB.");

  await open("/admin/profile", "Save draft");
  const resume = page.getByLabel("Upload the resume");
  await resume.setInputFiles({ name: "tool.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(page.getByTestId("upload-error")).toHaveText(
    "File refused. Allowed types: JPEG, PNG, WebP, GIF, PDF, and DOCX, up to 25 MB.",
  );
  await resume.setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(25 * 1024 * 1024 + 1, 0x20) });
  await expect(page.getByTestId("upload-error")).toContainText("up to 25 MB");
  expect(JSON.stringify(await draft())).toBe(before);
});

test("Cancel in a remove confirmation leaves the draft unchanged", async () => {
  const before = JSON.stringify(await draft());

  await page.goto("/admin");
  const row = page.getByTestId("experience-row").filter({ hasText: "Turbine Stand" });
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText('Remove the experience "Turbine Stand" with its home block and full page?');
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("experience-row")).toHaveCount(2);

  await open(`/admin/experiences/${VICTAULIC}`, "Save draft");
  const blocks = page.getByTestId("block");
  await expect(blocks).toHaveCount(3);
  await page.getByRole("button", { name: /Remove the Text block "A paragraph that must survive/ }).click();
  await expect(page.getByTestId("confirm-dialog")).toContainText('Remove the Text block "A paragraph that must survive');
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(blocks).toHaveCount(3);
  await expect(page.getByTestId("unsaved")).toHaveCount(0);

  expect(JSON.stringify(await draft())).toBe(before);
});

test("AE3 and GPS: a new experience with an image gets a home block, a full page, and a next link; the stored JPEG has no GPS data", async () => {
  // The fixture: a small JPEG from the browser's encoder, with a GPS EXIF segment added.
  const plain = Buffer.from(
    (
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 24;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#8d20c4";
        ctx.fillRect(0, 0, 32, 24);
        return canvas.toDataURL("image/jpeg", 0.9);
      })
    ).split(",")[1],
    "base64",
  );
  const withGps = withGpsExif(plain);
  expect(hasGps(withGps)).toBe(true);

  await open("/admin", "Add experience");
  await page.getByLabel("New experience title").fill("Wind Tunnel Rig");
  await page.getByRole("button", { name: "Add experience" }).click();
  await expect(page).toHaveURL(/\/admin\/experiences\/wind-tunnel-rig$/, { timeout: 150_000 });
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled({ timeout: 150_000 });

  await page.locator('textarea[name="skills"]').fill("CFD\nFabrication");
  await page.locator('textarea[name="homeText"]').fill("I built a small wind tunnel rig.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("saved")).toBeVisible();

  await page.getByLabel("Upload the card image").setInputFiles({ name: "Rig Photo.jpg", mimeType: "image/jpeg", buffer: withGps });
  // The alt text field shows once the uploaded file is in the page.
  const alt = page.getByLabel("Card image alt text (what the image shows, for screen readers)");
  await expect(alt).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId("upload-error")).toHaveCount(0);
  // The stored file, as the page links it: re-encoded, so no EXIF and no GPS data.
  const storedUrl = await page.getByTestId("media-field").first().locator("a").getAttribute("href");
  expect(new URL(storedUrl!).pathname).toMatch(new RegExp(`^/${ROOT}/media/rig-photo-.+\\.jpg$`)); // the random suffix
  const stored = Buffer.from(await (await fetch(storedUrl!)).arrayBuffer());
  expect(stored[0]).toBe(0xff);
  expect(exifSegments(stored)).toEqual([]);
  expect(hasGps(stored)).toBe(false);

  await alt.fill("The wind tunnel rig");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);

  const card = (await draft()).experiences.find((e) => e.slug === "wind-tunnel-rig")!.cardImage!;
  expect(card.url).toBe(storedUrl);
  expect(card).toMatchObject({ contentType: "image/jpeg", width: 32, height: 24, alt: "The wind tunnel rig", fileName: "Rig Photo.jpg" });

  await publishFromAdmin();
  const visitor = await visitorPage("/");
  const blocks = visitor.locator("#work article");
  await expect(blocks.locator("h3")).toHaveText(["Turbine Stand", "Victaulic Internship", "Wind Tunnel Rig"]);
  await expect(blocks.nth(2).getByRole("img", { name: "The wind tunnel rig" })).toBeVisible();
  await expect(blocks.nth(2).locator("ul li")).toHaveText(["CFD", "Fabrication"]);
  await visitor.goto("/experiences/wind-tunnel-rig");
  await expect(visitor.getByRole("heading", { level: 1, name: "Wind Tunnel Rig" })).toBeVisible();
  await visitor.goto(`/experiences/${VICTAULIC}`);
  await expect(visitor.getByRole("link", { name: /Next Experience/ })).toHaveAttribute("href", "/experiences/wind-tunnel-rig");
  await visitor.close();
});

test("two uploads with the same file name get different pathnames", async () => {
  await open("/admin/experiences/wind-tunnel-rig", "Save draft");
  await page.getByLabel("New block").selectOption("images");
  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("saved")).toBeVisible();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  for (let n = 1; n <= 2; n++) {
    await page.getByLabel("Upload a new image").setInputFiles({ name: "same.png", mimeType: "image/png", buffer: png });
    await expect(page.getByLabel(`Replace image ${n}`)).toBeVisible({ timeout: 150_000 });
  }
  // Each upload saves the page; wait until the second save is in the draft.
  const imagePaths = async () => {
    const block = (await draft()).experiences.find((e) => e.slug === "wind-tunnel-rig")!.blocks.find((b) => b.type === "images");
    return block?.type === "images" ? block.items.map((item) => item.image?.pathname) : [];
  };
  await expect.poll(async () => (await imagePaths()).length, { timeout: 150_000 }).toBe(2);
  const paths = await imagePaths();
  expect(paths[0]).not.toBe(paths[1]);
  for (const p of paths) expect(p).toMatch(new RegExp(`^${ROOT}/media/same-.+\\.png$`));
});

test("reordering the experiences changes the home page order after Publish", async () => {
  await page.goto("/admin");
  await page.getByRole("button", { name: 'Move "Wind Tunnel Rig" up' }).click();
  await expect(page.getByTestId("experience-row").locator("a").first()).toHaveText("Turbine Stand");
  await expect(page.getByTestId("experience-row").nth(1).locator("a").first()).toHaveText("Wind Tunnel Rig", { timeout: 150_000 });

  const visitor = await visitorPage("/");
  await expect(visitor.locator("#work article h3")).toHaveText(["Turbine Stand", "Victaulic Internship", "Wind Tunnel Rig"]);
  await publishFromAdmin();
  await visitor.goto("/");
  await expect(visitor.locator("#work article h3")).toHaveText(["Turbine Stand", "Wind Tunnel Rig", "Victaulic Internship"]);
  await visitor.close();
});
