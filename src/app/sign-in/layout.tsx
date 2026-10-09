import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

// The owner's sign-in page (3.4.1). Sign-ups are off in Clerk (Invite-only).

// KTD12: never indexed.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider signInUrl="/sign-in">{children}</ClerkProvider>;
}
