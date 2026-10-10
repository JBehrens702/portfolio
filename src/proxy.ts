import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkOwner, refusalResponse } from "@/lib/auth/owner";
import { isOwnerArea, isPageRequest } from "@/lib/auth/owner-area";

// The first gate of the admin area (3.4.1, KTD3). Clerk signs the owner in; the
// owner check then needs the Clerk user ID to equal ADMIN_USER_ID. Each admin
// page, preview page, server action, and route handler checks the owner again
// (src/lib/auth/owner.ts), because a server action is a POST to its page and
// must never rely on this file alone.
//
// The proxy runs only on the admin area and the sign-in page (see `config`), so
// the public pages carry no Clerk code and pay no Clerk cost.

/** The sign-in page, src/app/sign-in/[[...sign-in]]/page.tsx. */
const SIGN_IN_PATH = "/sign-in";

export default clerkMiddleware(
  async (auth, request) => {
    if (!isOwnerArea(request.nextUrl.pathname)) return;

    const session = await auth();
    const check = checkOwner(session.userId, process.env.ADMIN_USER_ID);
    if (check.ok) return;

    if (isPageRequest(request, request.nextUrl.pathname)) {
      // No session: sign in, then come back. Signed in but not the owner: the public home page.
      if (check.reason === "signed-out") return session.redirectToSignIn({ returnBackUrl: request.url });
      return NextResponse.redirect(new URL("/", request.url));
    }
    // API calls and server actions get a status, never a redirect or a page.
    return refusalResponse(check);
  },
  { signInUrl: SIGN_IN_PATH },
);

export const config = {
  // Constants only: Next.js reads this at build time.
  matcher: ["/admin/:path*", "/preview/:path*", "/api/admin/:path*", "/sign-in/:path*"],
};
