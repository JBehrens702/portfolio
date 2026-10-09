import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

// The owner's preview of the draft (2.4.7). src/proxy.ts and each page check the
// owner. Clerk loads here and in the admin and sign-in layouts only (KTD3), so
// the session stays fresh while the owner reads the preview.

// KTD12: never indexed. robots.txt also disallows /preview.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider signInUrl="/sign-in">{children}</ClerkProvider>;
}
