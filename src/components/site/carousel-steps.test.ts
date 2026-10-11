import { describe, expect, it } from "vitest";
import { activeSlide, stepScrollTarget } from "./carousel-steps";

describe("activeSlide", () => {
  const step = 500;

  it("shows the first slide before the carousel pins", () => {
    expect(activeSlide(-300, step, 3)).toBe(0);
    expect(activeSlide(0, step, 3)).toBe(0);
  });

  it("selects the slide whose step is nearest", () => {
    expect(activeSlide(240, step, 3)).toBe(0);
    expect(activeSlide(260, step, 3)).toBe(1);
    expect(activeSlide(500, step, 3)).toBe(1);
    expect(activeSlide(760, step, 3)).toBe(2);
  });

  it("keeps the last slide after the last step", () => {
    expect(activeSlide(5000, step, 3)).toBe(2);
  });

  it("returns 0 for a single slide or a zero step", () => {
    expect(activeSlide(900, step, 1)).toBe(0);
    expect(activeSlide(900, 0, 3)).toBe(0);
  });
});

describe("stepScrollTarget", () => {
  it("is the page position at which slide k shows", () => {
    // The carousel pins when its top is 100 px below the top of the screen.
    expect(stepScrollTarget({ scrollY: 1000, top: 400, pinTop: 100, step: 500 }, 0)).toBe(1300);
    expect(stepScrollTarget({ scrollY: 1000, top: 400, pinTop: 100, step: 500 }, 2)).toBe(2300);
  });
});
