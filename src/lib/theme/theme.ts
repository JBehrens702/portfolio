// Theme colours (plan KTD10, requirement 0.3.1). The three purples are sampled
// from scripts/logo/logo-source.png:
//   purple-deep   #8d20c4  the rule between the name and "MECHANICAL ENGINEERING"
//   purple-bright #b34ce0  the letters of "JONATHAN BEHRENS"
//   lavender      #efc3fe  the letters of "MECHANICAL ENGINEERING"
// src/app/globals.css defines the same values as CSS custom properties.
// contrast.test.ts fails if the two drift apart or a pair below drops under its minimum.

export const themeColors = {
  "--color-bg": "#0e0a14",
  "--color-surface": "#140f1b",
  "--color-border": "#2f2539",
  "--color-text": "#ede9f2",
  "--color-text-muted": "#b8aec4",
  "--color-purple-deep": "#8d20c4",
  "--color-purple-bright": "#b34ce0",
  "--color-lavender": "#efc3fe",
  "--color-heading": "#b34ce0",
  "--color-link": "#efc3fe",
  "--color-focus": "#b34ce0",
} as const;

export type ThemeColorName = keyof typeof themeColors;

export interface ContrastRule {
  use: string;
  fg: ThemeColorName;
  bg: ThemeColorName;
  min: number;
}

// WCAG AA: 4.5:1 for text, 3:1 for non-text UI parts such as a focus outline.
export const contrastRules: readonly ContrastRule[] = [
  { use: "body text on the page", fg: "--color-text", bg: "--color-bg", min: 4.5 },
  { use: "body text on a card", fg: "--color-text", bg: "--color-surface", min: 4.5 },
  { use: "muted text on the page", fg: "--color-text-muted", bg: "--color-bg", min: 4.5 },
  { use: "muted text on a card", fg: "--color-text-muted", bg: "--color-surface", min: 4.5 },
  { use: "links on the page", fg: "--color-link", bg: "--color-bg", min: 4.5 },
  { use: "links on a card", fg: "--color-link", bg: "--color-surface", min: 4.5 },
  { use: "headings on the page", fg: "--color-heading", bg: "--color-bg", min: 4.5 },
  { use: "headings on a card", fg: "--color-heading", bg: "--color-surface", min: 4.5 },
  { use: "focus outline on the page", fg: "--color-focus", bg: "--color-bg", min: 3 },
  { use: "focus outline on a card", fg: "--color-focus", bg: "--color-surface", min: 3 },
  { use: "button text on deep purple", fg: "--color-text", bg: "--color-purple-deep", min: 4.5 },
];
