import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 3.4.1 / KTD3: only the user whose Clerk ID equals ADMIN_USER_ID passes.
// Clerk's auth() and Next's redirect() are replaced, so these tests need no
// Clerk session and no Next.js request.

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import {
  checkOwner,
  getOwnerCheck,
  OwnerRefusedError,
  refusalResponse,
  requireOwner,
  requireOwnerPage,
} from "./owner";

const OWNER = "user_owner000000000000000001";
const OTHER = "user_other000000000000000002";

/** What Clerk's auth() returns: a user ID (or null) and a sign-in redirect that throws. */
function signedInAs(userId: string | null) {
  const redirectToSignIn = vi.fn((): never => {
    throw new Error("NEXT_REDIRECT sign-in");
  });
  authMock.mockResolvedValue({ userId, redirectToSignIn });
  return redirectToSignIn;
}

beforeEach(() => {
  vi.stubEnv("ADMIN_USER_ID", OWNER);
  authMock.mockReset();
  redirectMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkOwner", () => {
  it("allows the owner and returns the owner's user ID", () => {
    expect(checkOwner(OWNER, OWNER)).toEqual({ ok: true, userId: OWNER });
  });

  it("refuses another signed-in user with 403", () => {
    expect(checkOwner(OTHER, OWNER)).toEqual({ ok: false, reason: "not-owner", status: 403 });
  });

  it("refuses a visitor without a session with 401", () => {
    expect(checkOwner(null, OWNER)).toEqual({ ok: false, reason: "signed-out", status: 401 });
    expect(checkOwner(undefined, OWNER)).toEqual({ ok: false, reason: "signed-out", status: 401 });
    expect(checkOwner("", OWNER)).toEqual({ ok: false, reason: "signed-out", status: 401 });
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("refuses everyone when ADMIN_USER_ID is %s (fail closed)", (_name, adminUserId) => {
    for (const userId of [OWNER, OTHER, "", "   "]) {
      const check = checkOwner(userId, adminUserId);
      expect(check.ok).toBe(false);
    }
    expect(checkOwner(OWNER, adminUserId)).toEqual({ ok: false, reason: "not-configured", status: 403 });
  });

  it("does not match a user ID that only differs by spaces or case", () => {
    expect(checkOwner(` ${OWNER} `, OWNER).ok).toBe(false);
    expect(checkOwner(OWNER.toUpperCase(), OWNER).ok).toBe(false);
  });

  it("ignores spaces around the configured ADMIN_USER_ID", () => {
    expect(checkOwner(OWNER, `  ${OWNER}\n`)).toEqual({ ok: true, userId: OWNER });
  });
});

describe("getOwnerCheck", () => {
  it("reads the Clerk session and ADMIN_USER_ID at call time", async () => {
    signedInAs(OWNER);
    expect(await getOwnerCheck()).toEqual({ ok: true, userId: OWNER });
    vi.stubEnv("ADMIN_USER_ID", OTHER);
    expect((await getOwnerCheck()).ok).toBe(false);
  });
});

describe("requireOwner (server actions and route handlers)", () => {
  it("returns the owner's user ID", async () => {
    signedInAs(OWNER);
    await expect(requireOwner()).resolves.toBe(OWNER);
  });

  it("throws a 403 refusal for another signed-in user", async () => {
    signedInAs(OTHER);
    const error = await requireOwner().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OwnerRefusedError);
    expect(error).toMatchObject({ status: 403, reason: "not-owner" });
  });

  it("throws a 401 refusal without a session", async () => {
    signedInAs(null);
    await expect(requireOwner()).rejects.toMatchObject({ status: 401, reason: "signed-out" });
  });

  it.each([undefined, "", "  "])("refuses the owner too when ADMIN_USER_ID is %j", async (value) => {
    if (value === undefined) vi.stubEnv("ADMIN_USER_ID", undefined);
    else vi.stubEnv("ADMIN_USER_ID", value);
    signedInAs(OWNER);
    await expect(requireOwner()).rejects.toMatchObject({ status: 403, reason: "not-configured" });
  });
});

describe("requireOwnerPage (admin and preview pages)", () => {
  it("returns the owner's user ID and does not redirect", async () => {
    signedInAs(OWNER);
    await expect(requireOwnerPage()).resolves.toBe(OWNER);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign-in", async () => {
    const redirectToSignIn = signedInAs(null);
    await expect(requireOwnerPage()).rejects.toThrow("NEXT_REDIRECT sign-in");
    expect(redirectToSignIn).toHaveBeenCalledOnce();
  });

  it("sends another signed-in user to the public home page", async () => {
    const redirectToSignIn = signedInAs(OTHER);
    await expect(requireOwnerPage()).rejects.toThrow("NEXT_REDIRECT /");
    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("sends the owner away when ADMIN_USER_ID is unset", async () => {
    vi.stubEnv("ADMIN_USER_ID", undefined);
    signedInAs(OWNER);
    await expect(requireOwnerPage()).rejects.toThrow("NEXT_REDIRECT /");
  });
});

describe("refusalResponse", () => {
  it("gives the refusal status and only a short error code", async () => {
    const response = refusalResponse({ ok: false, reason: "signed-out", status: 401 });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "signed-out" });

    const forbidden = refusalResponse(new OwnerRefusedError("not-owner"));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "not-owner" });
  });
});
