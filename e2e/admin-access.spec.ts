import { expect, test, type APIRequestContext } from "@playwright/test";

// U5 access scenarios (AE4, 3.4.1, KTD3, KTD12). Every test runs WITHOUT a
// Clerk session, so it needs no Clerk test account. Run them against the same
// dev server as e2e/public.spec.ts (the Clerk keys come from .env.local).
//
// The admin home carries data-testid="admin-home" and the preview pages carry
// data-testid="preview-marker"; a refused visitor must see neither.

const PROTECTED_PAGES = ["/admin", "/preview", "/preview/experiences/alpha-project"];

/** The path of a redirect target, or null for a response that is not a redirect. */
function redirectPath(location: string | undefined, base: string): string | null {
  return location ? new URL(location, base).pathname : null;
}

async function expectNoUploadToken(request: APIRequestContext, path: string) {
  // The body of a Vercel Blob client-upload token request.
  const response = await request.post(path, {
    data: {
      type: "blob.generate-client-token",
      payload: { pathname: "resume.pdf", callbackUrl: "http://localhost/x", clientPayload: null, multipart: false },
    },
    maxRedirects: 0,
  });
  expect([401, 403]).toContain(response.status());
  const body = await response.text();
  expect(body).not.toMatch(/clientToken|vercel_blob_client/i);
  return response;
}

test.describe("signed-out visitor", () => {
  for (const path of PROTECTED_PAGES) {
    test(`AE4: ${path} redirects to sign-in and sends no protected HTML`, async ({ request, baseURL }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBeGreaterThanOrEqual(300);
      expect(response.status()).toBeLessThan(400);
      expect(redirectPath(response.headers()["location"], baseURL!)).toBe("/sign-in");
      const body = await response.text();
      expect(body).not.toContain("admin-home");
      expect(body).not.toContain("preview-marker");
    });
  }

  test("AE4: opening /admin in a browser ends on the sign-in page with no editing screen", async ({ page }) => {
    // Clerk's script on the sign-in page can start its own navigation, so wait only for
    // the first response, then poll the address.
    await page.goto("/admin", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/sign-in(\/|\?|$)/);
    await expect(page.getByTestId("admin-home")).toHaveCount(0);
    await expect(page.locator("textarea, input[type=file]")).toHaveCount(0);
  });

  test("AE4: opening /preview in a browser ends on the sign-in page with no draft", async ({ page }) => {
    await page.goto("/preview", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/sign-in(\/|\?|$)/);
    await expect(page.getByTestId("preview-marker")).toHaveCount(0);
  });

  test("/api/admin/upload refuses a token request and returns no upload token", async ({ request }) => {
    const response = await expectNoUploadToken(request, "/api/admin/upload");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("any /api/admin path refuses GET and POST without a session", async ({ request }) => {
    await expectNoUploadToken(request, "/api/admin/anything");
    const get = await request.get("/api/admin/anything", { maxRedirects: 0 });
    expect([401, 403]).toContain(get.status());
  });

  test("a server action POST to /admin is refused before it runs", async ({ request }) => {
    const response = await request.post("/admin", {
      headers: { "next-action": "0".repeat(40), accept: "text/x-component", "content-type": "text/plain" },
      data: "[]",
      maxRedirects: 0,
    });
    expect([401, 403]).toContain(response.status());
    expect(await response.text()).not.toContain("admin-home");
  });

  test("KTD12: the sign-in page sends noindex", async ({ request }) => {
    const response = await request.get("/sign-in");
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/<meta name="robots" content="noindex[^"]*"/);
  });
});

test.describe("public pages carry no sign-in code (KTD3)", () => {
  test("the proxy does not run on the home page and no Clerk script loads", async ({ page, request }) => {
    const home = await request.get("/");
    expect(home.status()).toBe(200);
    expect(Object.keys(home.headers()).filter((name) => name.startsWith("x-clerk"))).toEqual([]);

    const scripts: string[] = [];
    page.on("response", async (response) => {
      if (response.request().resourceType() === "script") {
        scripts.push(`${response.url()}\n${await response.text().catch(() => "")}`);
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script).not.toMatch(/@clerk\/|clerk\.accounts\.dev|clerk-js/i);
    expect(await page.evaluate(() => "Clerk" in window)).toBe(false);
  });
});
