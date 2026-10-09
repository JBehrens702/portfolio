import type { Metadata } from "next";
import { JetBrains_Mono, Michroma, Orbitron } from "next/font/google";
import { SITE_TITLE } from "@/components/site/site-title";
import "./globals.css";

// Design A ("Blueprint grid"): three angular, technical faces.
//   Orbitron        the display face for headings: square-cut and wide.
//   JetBrains Mono  the body face: a monospace built for long reading on screens.
//   Michroma        the menu and the buttons: wide, square-cut capitals.
// next/font serves all three from this site, so no request goes to Google, and
// the fallback metrics prevent a layout shift.
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const michroma = Michroma({ subsets: ["latin"], weight: "400", variable: "--font-michroma", display: "swap" });

export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s | ${SITE_TITLE}` },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${orbitron.variable} ${jetbrainsMono.variable} ${michroma.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
