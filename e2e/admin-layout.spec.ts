import { expect as baseExpect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { layoutBlocks } from "../src/lib/content/layout";
import { assertSite, type Row, type Site } from "../src/lib/content/schema";
import {
  blobCredentialsFromEnv,
  createBlobContentStore,
  docsCredentialsFromEnv,
  type BlobCredentials,
  type ContentStore,
} from "../src/lib/content/store";
import { deleteRoot, signInOwner } from "./fixtures/owner";

// U5 and U6: the layout editor in a real browser, signed in as the owner,
// against the DEVELOPMENT Blob stores under a test-only content root, which is
// deleted from both stores after the run. Start a dev server with that root:
//   CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<random> next dev
//   E2E_ADMIN=1 CONTENT_SOURCE=blob CONTENT_ROOT=e2e-<same> npx playwright test e2e/admin-layout.spec.ts --project=desktop

loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });

const ROOT = process.env.CONTENT_ROOT ?? "";
const SLUG = "layout-lab";
const PATH = `/admin/experiences/${SLUG}`;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const expect = baseExpect.configure({ timeout: 150_000 });
test.describe.configure({ mode: "serial", timeout: 1_200_000 });
test.skip(process.env.E2E_ADMIN !== "1", "set E2E_ADMIN=1 with CONTENT_SOURCE=blob and a test CONTENT_ROOT (see the top)");

function seedSite(): Site {
  const text = (id: string, value: string) => ({ id, type: "text" as const, text: value });
  const row = (id: string, block: ReturnType<typeof text>): Row => ({ id, type: "row", layout: "one", cells: [[block]] });
  return assertSite({
    schemaVersion: 2,
    profile: { name: "E2E Owner", tagline: "E2E tagline", introParagraphs: ["E2E intro."] },
    contact: { email: "e2e-owner@example.com" },
    labels: { nextExperience: { text: "Next Experience", approved: true } },
    software: [],
    experiences: [
      {
        slug: SLUG,
        homeTitle: "Layout Lab",
        pageTitle: "Layout Lab",
        skills: ["CAD"],
        homeText: "Layout lab home paragraph.",
        layout: [
          { id: "h-design", type: "heading", text: "Design", level: 2 },
          row("r-first", text("t-first", "First box text.")),
          row("r-second", text("t-second", "Second box text.")),
        ],
      },
    ],
  });
}

let store: ContentStore;
let docs: BlobCredentials;
let media: BlobCredentials;
let context: BrowserContext;
let page: Page;

async function draftLayout() {
  const site = await store.readDraft();
  return site!.experiences.find((e) => e.slug === SLUG)!.layout;
}

const rows = () => page.getByTestId("row");
const box = (text: string): Locator =>
  page.getByTestId("block").filter({ has: page.getByRole("button", { name: `Remove the Text block "${text}"` }) });

async function openEditor() {
  await page.goto(PATH);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
}

async function save() {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("unsaved")).toHaveCount(0);
}

/** Drags with the mouse in small steps, as the drag sensor needs real movement. */
async function dragTo(handle: Locator, target: () => Locator) {
  // Mouse events only reach what is on screen; the boxes sit below the page fields.
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox({ timeout: 10_000 }))!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
  await expect(target()).toBeVisible({ timeout: 10_000 });
  const to = (await target().boundingBox({ timeout: 10_000 }))!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
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
  page = await context.newPage();
  await signInOwner(page);
});

test.afterAll(async () => {
  await context?.close();
  if (docs) await deleteRoot(ROOT, docs);
  if (media) await deleteRoot(ROOT, media);
});

test("F1: a box dragged beside a one-column row makes a halves row", async () => {
  await openEditor();
  await expect(rows()).toHaveCount(2);
  await dragTo(page.getByRole("button", { name: 'Drag the Text block "Second box text."' }), () =>
    rows().first().getByTestId("drop-beside"),
  );
  await expect(rows()).toHaveCount(1);
  await expect(rows().first()).toHaveAttribute("data-row-layout", "halves");
  await save();
  const [, row] = await draftLayout();
  expect(row.type === "row" && row.cells.map((cell) => cell.map((b) => b.id))).toEqual([["t-first"], ["t-second"]]);

  // The preview shows the two boxes side by side.
  const preview = await context.newPage();
  await preview.goto(`/preview/experiences/${SLUG}`);
  const first = (await preview.getByText("First box text.").boundingBox())!;
  const second = (await preview.getByText("Second box text.").boundingBox())!;
  expect(first.x + first.width).toBeLessThanOrEqual(second.x);
  expect(Math.abs(first.y - second.y)).toBeLessThan(4);
  await preview.close();
});

test("a row's layout changes at once, and undo and redo step through the changes (AE3)", async () => {
  await openEditor();
  await page.getByLabel("Columns of the row 1").selectOption("third-two");
  await expect(rows().first()).toHaveAttribute("data-row-layout", "third-two");
  await page.getByLabel("Columns of the row 1").selectOption("one");
  await expect(rows().first()).toHaveAttribute("data-row-layout", "one");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows().first()).toHaveAttribute("data-row-layout", "third-two");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows().first()).toHaveAttribute("data-row-layout", "halves");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(rows().first()).toHaveAttribute("data-row-layout", "one");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows().first()).toHaveAttribute("data-row-layout", "third-two");
  await save();
});

test("F2: a carousel with three slides saves, adds its labels, and shows in the preview", async () => {
  await openEditor();
  await page.getByRole("button", { name: "Add carousel", exact: true }).click();
  for (const n of [1, 2, 3]) {
    if (n > 1) await page.getByRole("button", { name: "Add slide", exact: true }).click();
    await page.getByLabel(`Upload the image of slide ${n}`).setInputFiles({ name: `v${n}.png`, mimeType: "image/png", buffer: PNG });
    await expect(page.getByLabel(`Replace the image of slide ${n}`)).toBeVisible();
    await page.getByLabel(`Alt text of slide ${n} (what the image shows, for screen readers)`).fill(`Revision ${n} of the part`);
    await page.getByLabel(`Description of slide ${n} (a blank line starts a new paragraph)`).fill(`Revision ${n} description.`);
  }
  await save();
  const layout = await draftLayout();
  const carousel = layout.find((item) => item.type === "carousel");
  expect(carousel?.type === "carousel" && carousel.slides.map((s) => [s.image?.alt, s.text])).toEqual([
    ["Revision 1 of the part", "Revision 1 description."],
    ["Revision 2 of the part", "Revision 2 description."],
    ["Revision 3 of the part", "Revision 3 description."],
  ]);
  const labels = (await store.readDraft())!.labels;
  expect(labels.carouselNext).toEqual({ text: "Next", approved: false });

  const preview = await context.newPage();
  await preview.goto(`/preview/experiences/${SLUG}`);
  await expect(preview.locator("[data-carousel] [data-slide]")).toHaveCount(3);
  await preview.close();
});

test("the visitor view hides every field and shows the page as visitors see it (2.4.13)", async () => {
  await openEditor();
  await page.getByLabel("Show as visitors see it").check();
  const view = page.getByTestId("visitor-view");
  await expect(view.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(view.getByText("First box text.")).toBeVisible();
  await expect(view.locator("input, textarea, select")).toHaveCount(0);
  await expect(page.getByTestId("layout-editor")).toHaveCount(0);
  await page.getByLabel("Show as visitors see it").uncheck();
  await expect(page.getByTestId("layout-editor")).toBeVisible();
});

test("on a phone the editor shows one column, and the move buttons move a box across cells (2.4.16)", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openEditor();
  await expect(page.getByRole("button", { name: 'Drag the Text block "First box text."' })).toBeHidden();
  const first = (await box("First box text.").boundingBox())!;
  const second = (await box("Second box text.").boundingBox())!;
  expect(first.y + first.height).toBeLessThanOrEqual(second.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: 'Move the Text block "First box text." down' }).click();
  await save();
  const [, row] = await draftLayout();
  expect(row.type === "row" && row.cells.map((cell) => cell.map((b) => b.id))).toEqual([[], ["t-first", "t-second"]]);
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("AE4: reset brings back the published page, and cancel changes nothing (2.4.15)", async () => {
  await openEditor();
  await page.getByRole("button", { name: "Reset this page", exact: true }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(rows().first()).toHaveAttribute("data-row-layout", "third-two");

  await page.getByRole("button", { name: "Reset this page", exact: true }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Reset" }).click();
  await expect(rows()).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  const ids = layoutBlocks(await draftLayout()).map((b) => b.id);
  expect(ids).toEqual(["h-design", "t-first", "t-second"]);
});
