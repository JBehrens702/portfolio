// Theme colours (plan KTD10, requirement 0.3.1). The three logo purples are sampled
// from scripts/logo/logo-source.png:
//   purple-deep   #8d20c4  the rule between the name and "MECHANICAL ENGINEERING"
//   purple-bright #b34ce0  the letters of "JONATHAN BEHRENS"
//   lavender      #efc3fe  the letters of "MECHANICAL ENGINEERING"
// purple-dark and purple-ink are darker steps of purple-deep for the gradients.
//
// Colour by emphasis (design A, "Blueprint grid", 2026-10-09):
//   purple panels  the items with the highest emphasis (hero, featured work, title bands, contact)
//   near-black     the page on graph paper, the top bar, and the charcoal cards
//   light callout  quotes and fact lists (callout, callout-text, callout-accent)
//   orange         section headings and technical accents: corner marks, hazard
//                  stripes, tick marks, links, and the primary button (dark text)
//
// Orange text never sits on purple (2.6:1 on purple-deep). On purple, text is
// white; orange shows there only as graphics on purple-dark or purple-ink (3:1+).
//
// src/app/globals.css defines the same values as CSS custom properties.
// contrast.test.ts fails if the two drift apart or a pair below drops under its minimum.

export const themeColors = {
  "--color-bg": "#0b0810",
  "--color-bar": "#050307",
  "--color-surface": "#16111d",
  "--color-surface-raised": "#1d1726",
  "--color-border": "#2f2539",
  "--color-text": "#ede9f2",
  "--color-text-muted": "#b8aec4",
  "--color-purple-deep": "#8d20c4",
  "--color-purple-bright": "#b34ce0",
  "--color-purple-dark": "#5a1484",
  "--color-purple-ink": "#2a0a40",
  "--color-lavender": "#efc3fe",
  "--color-orange": "#ff7a1a",
  "--color-on-orange": "#120a00",
  "--color-accent": "#ffc79a",
  "--color-heading": "#f7f2fb",
  "--color-link": "#ff8f3d",
  "--color-focus": "#ff7a1a",
  "--color-on-purple": "#ffffff",
  "--color-on-purple-muted": "#f6e3ff",
  "--color-callout": "#f1edf5",
  "--color-callout-text": "#1c1326",
  "--color-callout-muted": "#5b5068",
  "--color-callout-accent": "#6b179a",
} as const;

export type ThemeColorName = keyof typeof themeColors;

export interface ContrastRule {
  use: string;
  fg: ThemeColorName;
  bg: ThemeColorName;
  min: number;
}

// WCAG AA: 4.5:1 for text, 3:1 for non-text UI parts such as a focus outline
// and for meaningful graphics. Text on a purple panel sits on purple-deep or a
// darker step; purple-bright is only a decorative glow, so only the focus
// outline is checked on it.
export const contrastRules: readonly ContrastRule[] = [
  // Dark page, top bar, and cards.
  { use: "body text on the page", fg: "--color-text", bg: "--color-bg", min: 4.5 },
  { use: "body text on a card", fg: "--color-text", bg: "--color-surface", min: 4.5 },
  { use: "body text on a raised card", fg: "--color-text", bg: "--color-surface-raised", min: 4.5 },
  { use: "muted text on the page", fg: "--color-text-muted", bg: "--color-bg", min: 4.5 },
  { use: "muted text on a card", fg: "--color-text-muted", bg: "--color-surface", min: 4.5 },
  { use: "muted text on a raised card", fg: "--color-text-muted", bg: "--color-surface-raised", min: 4.5 },
  { use: "links on the page", fg: "--color-link", bg: "--color-bg", min: 4.5 },
  { use: "links on a card", fg: "--color-link", bg: "--color-surface", min: 4.5 },
  { use: "links on a raised card", fg: "--color-link", bg: "--color-surface-raised", min: 4.5 },
  { use: "headings on the page", fg: "--color-heading", bg: "--color-bg", min: 4.5 },
  { use: "headings on a card", fg: "--color-heading", bg: "--color-surface", min: 4.5 },
  { use: "accent text (skill tags) on the page", fg: "--color-accent", bg: "--color-bg", min: 4.5 },
  { use: "accent text on a card", fg: "--color-accent", bg: "--color-surface", min: 4.5 },
  { use: "accent text on a raised card", fg: "--color-accent", bg: "--color-surface-raised", min: 4.5 },
  { use: "focus outline on the page", fg: "--color-focus", bg: "--color-bg", min: 3 },
  { use: "focus outline on a card", fg: "--color-focus", bg: "--color-surface", min: 3 },
  { use: "focus outline on a raised card", fg: "--color-focus", bg: "--color-surface-raised", min: 3 },
  { use: "focus outline on the top bar", fg: "--color-focus", bg: "--color-bar", min: 3 },
  // Orange: headings, labels, and the primary button.
  { use: "orange section headings on the page", fg: "--color-orange", bg: "--color-bg", min: 4.5 },
  { use: "orange labels on a card", fg: "--color-orange", bg: "--color-surface", min: 4.5 },
  { use: "orange labels on a raised card", fg: "--color-orange", bg: "--color-surface-raised", min: 4.5 },
  { use: "button text on the orange button", fg: "--color-on-orange", bg: "--color-orange", min: 4.5 },
  // The top bar.
  { use: "menu text on the top bar", fg: "--color-text", bg: "--color-bar", min: 4.5 },
  { use: "menu text on the top bar, hover and active", fg: "--color-orange", bg: "--color-bar", min: 4.5 },
  // Purple panels.
  { use: "button text on deep purple", fg: "--color-text", bg: "--color-purple-deep", min: 4.5 },
  { use: "text on deep purple", fg: "--color-on-purple", bg: "--color-purple-deep", min: 4.5 },
  { use: "text on dark purple", fg: "--color-on-purple", bg: "--color-purple-dark", min: 4.5 },
  { use: "text on ink purple", fg: "--color-on-purple", bg: "--color-purple-ink", min: 4.5 },
  { use: "muted text on deep purple", fg: "--color-on-purple-muted", bg: "--color-purple-deep", min: 4.5 },
  { use: "muted text on dark purple", fg: "--color-on-purple-muted", bg: "--color-purple-dark", min: 4.5 },
  { use: "button text on a white button", fg: "--color-purple-dark", bg: "--color-on-purple", min: 4.5 },
  { use: "focus outline on deep purple", fg: "--color-on-purple", bg: "--color-purple-deep", min: 3 },
  { use: "focus outline on the purple glow", fg: "--color-on-purple", bg: "--color-purple-bright", min: 3 },
  { use: "orange corner marks and contact edges on dark purple", fg: "--color-orange", bg: "--color-purple-dark", min: 3 },
  { use: "orange corner marks on ink purple", fg: "--color-orange", bg: "--color-purple-ink", min: 3 },
  // Light callouts.
  { use: "text on a light callout", fg: "--color-callout-text", bg: "--color-callout", min: 4.5 },
  { use: "muted text on a light callout", fg: "--color-callout-muted", bg: "--color-callout", min: 4.5 },
  { use: "labels and links on a light callout", fg: "--color-callout-accent", bg: "--color-callout", min: 4.5 },
  { use: "focus outline on a light callout", fg: "--color-callout-accent", bg: "--color-callout", min: 3 },
];
