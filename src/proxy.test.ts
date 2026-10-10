import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// 3.4.1 / KTD3: the proxy is the first gate of the admin area. Clerk's
// middleware wrapper is replaced by the bare handler, so these tests call the
// handler with a fake auth() and need no Clerk session.

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  auth: vi.fn(),
}));

import proxy from "./proxy";
import { isOwnerArea, isPageRequest } from "@/lib/auth/owner-area";

type Handler = (
  auth: () => Promise<{ userId: string | null; redirectToSignIn: (options: { returnBackUrl: string }) => Response }>,
  request: NextRequest,
) => Promise<Response | undefined>;
const handler = proxy as unknown as Handler;

const OWNER = "user_owner000000000000000001";
const OTHER = "user_other000000000000000002";
const SIGN_IN = new Response(null, { status: 307, headers: { location: "https://site.example/sign-in" } });

function signedInAs(userId: string | null) {
  const redirectToSignIn = vi.fn(() => SIGN_IN);
  return { auth: async () => ({ userId, redirectToSignIn }), redirectToSignIn };
}

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "https://site.example"), init);
}

beforeEach(() => {
  vi.stubEnv("ADMIN_USER_ID", OWNER);
});

describe("owner area and page request", () => {
  it("covers /admin, /preview, /api/admin, and every path below them; nothing else", () => {
    for (const path of ["/admin", "/admin/labels", "/preview", "/preview/experiences/a", "/api/admin", "/api/admin/upload"]) {
      expect(isOwnerArea(path), path).toBe(true);
    }
    for (const path of ["/", "/sign-in", "/sign-in/factor-one", "/administrator", "/previews", "/api/admins", "/experiences/a"]) {
      expect(isOwnerArea(path), path).toBe(false);
    }
  });

  it("counts a GET or HEAD page load as a page request, but not an API call or a server action", () => {
    expect(isPageRequest(request("/admin"), "/admin")).toBe(true);
    expect(isPageRequest(request("/admin", { method: "HEAD" }), "/admin")).toBe(true);
    expect(isPageRequest(request("/admin", { method: "POST" }), "/admin")).toBe(false);
    expect(isPageRequest(request("/admin", { method: "POST", headers: { "next-action": "abc" } }), "/admin")).toBe(false);
    expect(isPageRequest(request("/admin", { headers: { "next-action": "abc" } }), "/admin")).toBe(false);
    expect(isPageRequest(request("/api/admin/upload"), "/api/admin/upload")).toBe(false);
  });
});

describe("the proxy", () => {
  it("lets the owner through", async () => {
    const { auth } = signedInAs(OWNER);
    expect(await handler(auth, request("/admin"))).toBeUndefined();
    expect(await handler(auth, request("/api/admin/upload", { method: "POST" }))).toBeUndefined();
  });

  it("does not check paths outside the owner area", async () => {
    const auth = vi.fn();
    expect(await handler(auth, request("/sign-in"))).toBeUndefined();
    expect(auth).not.toHaveBeenCalled();
  });

  it("sends a signed-out page load to the sign-in page, which returns to it", async () => {
    const { auth, redirectToSignIn } = signedInAs(null);
    expect(await handler(auth, request("/preview/experiences/a"))).toBe(SIGN_IN);
    expect(redirectToSignIn).toHaveBeenCalledWith({ returnBackUrl: "https://site.example/preview/experiences/a" });
  });

  it("redirects a signed-in user who is not the owner from a page to the public home page", async () => {
    const { auth, redirectToSignIn } = signedInAs(OTHER);
    for (const path of ["/admin", "/preview"]) {
      const response = await handler(auth, request(path));
      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toBe("https://site.example/");
    }
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("refuses a non-owner's API call and server action with 403, never a redirect", async () => {
    const { auth } = signedInAs(OTHER);
    const calls = [
      request("/api/admin/upload", { method: "POST" }),
      request("/api/admin/upload"),
      request("/admin/labels", { method: "POST", headers: { "next-action": "abc" } }),
    ];
    for (const call of calls) {
      const response = await handler(auth, call);
      expect(response?.status).toBe(403);
      expect(response?.headers.get("location")).toBeNull();
      expect(await response?.json()).toEqual({ error: "not-owner" });
    }
  });

  it("refuses a signed-out API call with 401", async () => {
    const { auth } = signedInAs(null);
    const response = await handler(auth, request("/api/admin/upload", { method: "POST" }));
    expect(response?.status).toBe(401);
  });

  it("refuses everyone when ADMIN_USER_ID is not set (fail closed)", async () => {
    vi.stubEnv("ADMIN_USER_ID", " ");
    const { auth } = signedInAs(OWNER);
    expect((await handler(auth, request("/admin")))?.headers.get("location")).toBe("https://site.example/");
    expect((await handler(auth, request("/api/admin/upload", { method: "POST" })))?.status).toBe(403);
  });
});
