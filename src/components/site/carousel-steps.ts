// The scroll steps of a pinned carousel (KTD8). The carousel is a tall block; its
// frame sticks in the middle of the screen while the page scrolls through one
// step per slide. "scrolled" is how far the page has scrolled since the frame
// pinned: negative before, and at least (count - 1) * step after the last slide.

/** The index of the slide to show: the step nearest to the scroll position. */
export function activeSlide(scrolled: number, step: number, count: number): number {
  if (count <= 1 || step <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrolled / step)));
}

export interface StepGeometry {
  /** window.scrollY now. */
  scrollY: number;
  /** The carousel block's top, relative to the screen, now. */
  top: number;
  /** The screen position at which the frame pins. */
  pinTop: number;
  /** The scroll distance of one slide. */
  step: number;
}

/** The window.scrollY at which slide `index` shows (the previous and next buttons scroll there). */
export function stepScrollTarget({ scrollY, top, pinTop, step }: StepGeometry, index: number): number {
  return scrollY + (top - pinTop) + index * step;
}
