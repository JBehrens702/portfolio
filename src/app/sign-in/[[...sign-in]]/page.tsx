import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

// Clerk's sign-in form. After sign-in, the owner returns to the page that asked
// for it (the redirect_url that the proxy sets), or else to /admin.
//
// <SignIn> reads the URL (usePathname), which with Cache Components is known
// only at request time, so it streams in behind a Suspense boundary.
export default function SignInPage() {
  return (
    <main
      id="main"
      className="container"
      style={{ display: "grid", placeItems: "center", minHeight: "80vh", paddingBlock: "var(--space-8)" }}
    >
      <Suspense fallback={null}>
        <SignIn path="/sign-in" routing="path" fallbackRedirectUrl="/admin" />
      </Suspense>
    </main>
  );
}
