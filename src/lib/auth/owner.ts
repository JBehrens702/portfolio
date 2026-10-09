import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// The owner check (3.4.1, KTD3). Clerk proves who the user is; this module
// decides whether that user is the owner: the Clerk user ID must equal the env
// var ADMIN_USER_ID. A second Clerk user is refused, and an unset or blank
// ADMIN_USER_ID refuses everyone (fail closed).
//
// Call one of the entry points at the top of every admin page, preview page,
// server action, and admin route handler, in addition to the check in
// src/proxy.ts (defense in depth):
//   - pages:           const userId = await requireOwnerPage();
//   - server actions:  const userId = await requireOwner();   // throws OwnerRefusedError
//   - route handlers:  const check = await getOwnerCheck();
//                      if (!check.ok) return refusalResponse(check);

export type OwnerRefusal = "signed-out" | "not-owner" | "not-configured";

export type OwnerCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: OwnerRefusal; status: 401 | 403 };

/** 401 when nobody is signed in; 403 when a user is signed in but is not the owner. */
function refusal(reason: OwnerRefusal): OwnerCheck & { ok: false } {
  return { ok: false, reason, status: reason === "signed-out" ? 401 : 403 };
}

/**
 * The one decision. A pure function, so the proxy and the tests use it too.
 * The user ID must match ADMIN_USER_ID exactly; only the spaces around the
 * configured value are ignored.
 */
export function checkOwner(userId: string | null | undefined, adminUserId: string | undefined): OwnerCheck {
  if (typeof userId !== "string" || userId.trim() === "") return refusal("signed-out");
  const owner = adminUserId?.trim() ?? "";
  if (owner === "") return refusal("not-configured");
  if (userId !== owner) return refusal("not-owner");
  return { ok: true, userId };
}

/** The decision for the current request: the Clerk session and ADMIN_USER_ID, both read now. */
export async function getOwnerCheck(): Promise<OwnerCheck> {
  const { userId } = await auth();
  return checkOwner(userId, process.env.ADMIN_USER_ID);
}

/** Thrown by requireOwner(). `status` is 401 (no session) or 403 (not the owner). */
export class OwnerRefusedError extends Error {
  readonly reason: OwnerRefusal;
  readonly status: 401 | 403;

  constructor(reason: OwnerRefusal) {
    super(`Owner check refused: ${reason}`);
    this.name = "OwnerRefusedError";
    this.reason = reason;
    this.status = refusal(reason).status;
  }
}

/** For server actions and route handlers: the owner's user ID, or a thrown OwnerRefusedError. */
export async function requireOwner(): Promise<string> {
  const check = await getOwnerCheck();
  if (!check.ok) throw new OwnerRefusedError(check.reason);
  return check.userId;
}

/**
 * For admin and preview pages: the owner's user ID. Without a session, it
 * redirects to the sign-in page (which returns here after sign-in). A signed-in
 * user who is not the owner is redirected to the public home page.
 */
export async function requireOwnerPage(): Promise<string> {
  const session = await auth();
  const check = checkOwner(session.userId, process.env.ADMIN_USER_ID);
  if (check.ok) return check.userId;
  if (check.reason === "signed-out") return session.redirectToSignIn();
  return redirect("/");
}

/** The JSON refusal for a route handler. It carries only the reason, never a token or a user ID. */
export function refusalResponse(refused: Extract<OwnerCheck, { ok: false }> | OwnerRefusedError): Response {
  return Response.json(
    { error: refused.reason },
    { status: refused.status, headers: { "cache-control": "no-store" } },
  );
}
