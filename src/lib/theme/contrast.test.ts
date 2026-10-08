import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, relativeLuminance } from "./contrast";
import { contrastRules, themeColors } from "./theme";

const globalsCss = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

function rootColorVars(css: string): Record<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error("globals.css has no :root block");
  const vars: Record<string, string> = {};
  for (const m of root[1].matchAll(/(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    vars[m[1]] = m[2].toLowerCase();
  }
  return vars;
}

describe("contrastRatio", () => {
  it("gives 21:1 for black on white and 1:1 for equal colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#8d20c4", "#8d20c4")).toBe(1);
  });

  it("matches a known WCAG value (#767676 on white is 4.54:1)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("rejects a colour that is not #rrggbb", () => {
    expect(() => parseHex("purple")).toThrow();
    expect(() => relativeLuminance("#fff")).toThrow();
  });
});

describe("theme colours", () => {
  it("globals.css defines exactly the exported theme colours", () => {
    expect(rootColorVars(globalsCss)).toEqual(themeColors);
  });

  it.each(contrastRules.map((r) => [r.use, r] as const))("%s meets its minimum contrast", (_use, rule) => {
    const ratio = contrastRatio(themeColors[rule.fg], themeColors[rule.bg]);
    expect(ratio, `${rule.fg} on ${rule.bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(rule.min);
  });

  it("checks body text and links at 4.5:1 and the focus outline at 3:1 against the background", () => {
    const has = (fg: string, min: number) =>
      contrastRules.some((r) => r.fg === fg && r.bg === "--color-bg" && r.min >= min);
    expect(has("--color-text", 4.5)).toBe(true);
    expect(has("--color-link", 4.5)).toBe(true);
    expect(has("--color-focus", 3)).toBe(true);
  });
});
