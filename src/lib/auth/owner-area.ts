// The paths and requests that src/proxy.ts checks (3.4.1, KTD3). They sit here,
// not in the proxy file, because a proxy file exports only its function and
// its config.

const OWNER_AREAS = ["/admin", "/preview", "/api/admin"];

/** /admin, /preview, /api/admin, and every path below them. Not /sign-in. */
export function isOwnerArea(pathname: string): boolean {
  return OWNER_AREAS.some((area) => pathname === area || pathname.startsWith(`${area}/`));
}

/** A plain page load or an App Router navigation; not an API call or a server action. */
export function isPageRequest(request: Request, pathname: string): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    !pathname.startsWith("/api/") &&
    !request.headers.has("next-action")
  );
}
