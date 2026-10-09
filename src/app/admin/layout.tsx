import type { Metadata } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";

// The admin area (3.4.1). src/proxy.ts and each page, server action, and route
// handler check the owner (src/lib/auth/owner.ts). Clerk loads here and in the
// preview and sign-in layouts only; the public pages carry no Clerk code (KTD3).
//
// The admin UI texts are not site content: only the owner sees them.

// KTD12: never indexed. robots.txt also disallows /admin.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in">
      <header className="container" style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", minHeight: "var(--header-height)" }}>
        <a href="/admin">Admin</a>
        <a href="/preview">Preview</a>
        <span style={{ marginLeft: "auto" }}>
          <UserButton />
        </span>
      </header>
      {children}
    </ClerkProvider>
  );
}
