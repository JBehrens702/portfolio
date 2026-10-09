import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import { SITE_TITLE } from "@/components/site/site-title";
import "./globals.css";

// Lexend: the display face for headings, a geometric sans close to the logo
// lettering. Inter: the body face, built for reading on screens. next/font
// serves both from this site, so no request goes to Google, and the fallback
// metrics prevent a layout shift.
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s | ${SITE_TITLE}` },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${lexend.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
