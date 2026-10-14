import { expect, test, type Locator, type Page } from "@playwright/test";

// Hover motion and the About Me logo (0.1.17-0.1.20 in the hover-motion plan).
// A part that cannot be clicked must not move under the pointer; a part that is,
// or contains, an enabled link or button keeps its hover effect. Runs on the e2e
// fixture, like public.spec: CONTENT_SOURCE=file:e2e/fixtures/content CONTENT_ROOT=e2e.
//
// "Motion state" (KTD5): the computed transform, translate, scale and rotate of
// every element in a box and of its ::before and ::after, plus every animation or
// transition on the document timeline in that box, in any play state. Scroll-driven
// animations run on a scroll or view timeline, so they are not counted.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const SLUGS = ["alpha-project", "beta-project", "gamma-project"];
// The same "clickable" test as the corner-marks hover rule in src/app/globals.css.
const CLICKABLE = "a[href], button:not(:disabled)";

type MotionState = { styles: string[]; anims: string[] };

test.beforeEach(async ({ page }) => {
  await page.route("https://media.e2e.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
});

/** Reads the motion state of the box that `box` points at. */
function motionState(box: Locator): Promise<MotionState> {
  return box.evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll("*")];
    const props = ["transform", "translate", "scale", "rotate"];
    const styles: string[] = [];
    nodes.forEach((node, i) => {
      for (const pseudo of [null, "::before", "::after"]) {
        const style = getComputedStyle(node, pseudo);
        styles.push(`${i}${pseudo ?? ""} ${props.map((p) => style.getPropertyValue(p)).join(" | ")}`);
      }
    });
    const anims = document
      .getAnimations()
      .filter((a) => a.timeline === document.timeline)
      .flatMap((a) => {
        const effect = a.effect as KeyframeEffect | null;
        if (!effect?.target || !el.contains(effect.target)) return [];
        const name =
          (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.constructor.name;
        return [`${nodes.indexOf(effect.target)}${effect.pseudoElement ?? ""} ${a.constructor.name} ${name}`];
      });
    return { styles, anims };
  });
}

function changes(before: MotionState, after: MotionState): string[] {
  const out = after.styles.filter((line, i) => line !== before.styles[i]).map((line) => `style ${line}`);
  const left = [...before.anims];
  for (const anim of after.anims) {
    const i = left.indexOf(anim);
    if (i >= 0) left.splice(i, 1);
    else out.push(`animation ${anim}`);
  }
  return out;
}

/**
 * Hovers a box and returns what moved inside it. The pointer leaves first, so
 * the baseline is never read while the box is already hovered; the box is read
 * once while a transition still runs and once after the longest effect (0.9 s).
 */
async function hoverChanges(page: Page, box: Locator, away = { x: 0, y: 0 }): Promise<string[]> {
  await page.mouse.move(away.x, away.y);
  await box.scrollIntoViewIfNeeded();
  let before = await motionState(box);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const again = await motionState(box);
    if (changes(before, again).length === 0) break;
    before = again;
  }
  await box.hover({ force: true });
  await page.waitForTimeout(150);
  const during = await motionState(box);
  await page.waitForTimeout(1000);
  const after = await motionState(box);
  return [...new Set([...changes(before, during), ...changes(before, after)])];
}

/** The box that holds a `.corner-marks` element as its direct child. */
const marksBox = (scope: Locator) => scope.locator(".corner-marks").locator("..");

test.describe("hover motion", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, "the hover checks run at PC width only");

  test("the hero photo box does not move under the pointer", async ({ page }) => {
    await page.goto("/");
    // The nearest box with its own brackets: the photo box, not the whole hero panel.
    const box = page
      .getByRole("img", { name: "Fixture hero photo" })
      .locator("xpath=ancestor::div[span[contains(concat(' ', @class, ' '), ' corner-marks ')]][1]");
    await expect(box).toHaveCount(1);
    expect(await hoverChanges(page, box)).toEqual([]);
  });

  test("the About Me logo box does not move under the pointer", async ({ page }) => {
    await page.goto("/");
    expect(await hoverChanges(page, marksBox(page.locator("#about")))).toEqual([]);
  });

  test("a software card without a link does not react to the pointer", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#software article").filter({ has: page.getByRole("heading", { name: "Dashboard", exact: true }) });
    await expect(card).toHaveCount(1);
    await expect(card.locator(CLICKABLE)).toHaveCount(0);
    const edge = () => card.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rest = await edge();
    expect(await hoverChanges(page, card)).toEqual([]);
    expect(await edge()).toBe(rest);
  });

  test("the title band and a photo that does not open larger do not move under the pointer", async ({ page }) => {
    await page.goto("/experiences/alpha-project");
    const band = marksBox(page.locator("article > header"));
    await expect(band).toHaveCount(1);
    expect(await hoverChanges(page, band)).toEqual([]);
    // beta-project's image block has "Enlarge on click" turned off.
    await page.goto("/experiences/beta-project");
    const photos = page.locator("figure div[data-reveal='wipe']");
    expect(await photos.count()).toBeGreaterThan(0);
    for (const photo of await photos.all()) expect(await hoverChanges(page, photo)).toEqual([]);
  });

  test("positive control: a photo that opens larger moves its brackets", async ({ page }) => {
    await page.goto("/experiences/alpha-project");
    const photos = page.locator("figure button[data-zoom]");
    expect(await photos.count()).toBeGreaterThan(0);
    for (const photo of await photos.all()) expect(await hoverChanges(page, photo)).not.toEqual([]);
  });

  test("carousel slides and turned-off carousel buttons do not move under the pointer", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/experiences/gamma-project");
    const carousel = page.locator("[data-carousel]");
    const count = await carousel.locator("[data-slide]").count();
    expect(count).toBeGreaterThan(1);
    const { start, step } = await carousel.evaluate((block, n) => {
      const frame = block.children[block.children.length - 2] as HTMLElement;
      const spacer = block.lastElementChild as HTMLElement;
      const pinTop = parseFloat(getComputedStyle(frame).top);
      return {
        start: window.scrollY + block.getBoundingClientRect().top - pinTop,
        step: spacer.offsetHeight / (n - 1),
      };
    }, count);
    const previous = page.getByRole("button", { name: "Previous", exact: true });
    const next = page.getByRole("button", { name: "Next", exact: true });

    for (let k = 0; k < count; k++) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), start + k * step);
      const slide = carousel.locator(`[data-slide="${k}"]`);
      await expect(slide).not.toHaveAttribute("aria-hidden", /.*/);
      expect(await hoverChanges(page, marksBox(slide))).toEqual([]);
      if (k === 0) {
        await expect(previous).toBeDisabled();
        expect(await hoverChanges(page, previous)).toEqual([]);
        // Positive control: an enabled button still reacts.
        expect(await hoverChanges(page, next)).not.toEqual([]);
      }
      if (k === count - 1) {
        await expect(next).toBeDisabled();
        expect(await hoverChanges(page, next)).toEqual([]);
      }
    }
  });

  test("positive control: an experience summary still reacts to the pointer", async ({ page }) => {
    await page.goto("/");
    const summary = page.locator("#work article").first();
    expect(await hoverChanges(page, summary)).not.toEqual([]);
  });

  test("positive control: a software card with a link lights its edge", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#software article").filter({ has: page.getByRole("heading", { name: "[UN]Quotable", exact: true }) });
    await expect(card.getByRole("link")).toHaveCount(1);
    await page.mouse.move(0, 0);
    await card.scrollIntoViewIfNeeded();
    const rest = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(rest);
  });

  test("positive control: the next-experience link still moves its brackets", async ({ page }) => {
    await page.goto("/experiences/alpha-project");
    const link = page.locator("a:has(> .corner-marks)");
    await expect(link).toHaveCount(1);
    expect(await hoverChanges(page, link)).not.toEqual([]);
  });

  // 0.1.19 (MAY): the header logo is a link home, so it now reacts like the menu links.
  const logoLink = (page: Page) => page.locator("header").first().locator("a").first();
  const bottomLeft = (page: Page) => ({ x: 0, y: (page.viewportSize()?.height ?? 720) - 1 });
  const barOpacity = (link: Locator) => link.evaluate((el) => getComputedStyle(el, "::after").opacity);

  test("positive control: the header logo link reacts to the pointer", async ({ page }) => {
    await page.goto("/");
    expect(await hoverChanges(page, logoLink(page), bottomLeft(page))).not.toEqual([]);
    expect(await barOpacity(logoLink(page))).toBe("1");
  });

  test("with reduced motion, the header logo bar appears without moving", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await barOpacity(logoLink(page))).toBe("0");
    expect(await hoverChanges(page, logoLink(page), bottomLeft(page))).toEqual([]);
    expect(await barOpacity(logoLink(page))).toBe("1");
  });

  // The sweep: every box that could look clickable but is not (KTD5).
  for (const path of ["/", ...SLUGS.map((slug) => `/experiences/${slug}`)]) {
    test(`sweep: no box without a link or button moves under the pointer on ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto(path);
      const labels = await page.evaluate((clickableSelector) => {
        const clickable = (el: Element) => el.matches(clickableSelector) || el.querySelector(clickableSelector) !== null;
        const candidates = new Set<Element>();
        document.querySelectorAll(".corner-marks").forEach((m) => m.parentElement && candidates.add(m.parentElement));
        document.querySelectorAll("article, [data-reveal], button:disabled").forEach((el) => candidates.add(el));
        const out: string[] = [];
        for (const el of candidates) {
          // The carousel test steps through the slides; hidden slides cannot be hovered.
          if (el.closest("[data-carousel]")) continue;
          if (clickable(el) || el.parentElement?.closest(clickableSelector)) continue;
          // A box inside a card with a link is part of that card, which keeps its effect.
          const card = el.closest("article[data-reveal]");
          if (card && clickable(card)) continue;
          el.setAttribute("data-hover-probe", String(out.length));
          out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] || "-"}`);
        }
        return out;
      }, CLICKABLE);
      expect(labels.length).toBeGreaterThan(0);

      const moved: string[] = [];
      for (const [i, label] of labels.entries()) {
        const box = page.locator(`[data-hover-probe="${i}"]`);
        if (!(await box.isVisible())) continue;
        const found = await hoverChanges(page, box);
        if (found.length > 0) moved.push(`${label}: ${found.slice(0, 3).join("; ")}`);
      }
      expect(moved).toEqual([]);
    });
  }
});

test.describe("About Me logo", () => {
  const logo = (page: Page) => marksBox(page.locator("#about"));

  test("it shows only on screens 900 px wide or wider", async ({ page }, testInfo) => {
    await page.goto("/");
    if (testInfo.project.name === "phone") {
      await expect(logo(page)).toBeHidden();
      return;
    }
    await expect(logo(page)).toBeVisible();
    await page.setViewportSize({ width: 899, height: 800 });
    await expect(logo(page)).toBeHidden();
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(logo(page)).toBeVisible();
  });
});
