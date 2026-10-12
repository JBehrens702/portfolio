"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Carousel as CarouselData, Slide } from "@/lib/content/schema";
import { activeSlide, stepScrollTarget } from "./carousel-steps";
import { ofCount } from "./markings";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import { Readout } from "./Readout";
import styles from "./Experience.module.css";
import siteStyles from "./Site.module.css";

// The pinned carousel (0.1.13-0.1.16, KTD8). The block is tall: its frame sticks
// in the middle of the screen while the page scrolls one step per slide, so the
// browser's own scroll (wheel, trackpad, touch, keyboard) turns the slides in both
// directions and releases the page after the last slide. The buttons scroll the
// page to the neighbouring step, and the skip link jumps past the carousel.

export interface CarouselLabels {
  previous: string | null;
  next: string | null;
  skip: string | null;
}

interface CarouselProps {
  /** A carousel from visibleSite(): every slide has an image. */
  carousel: CarouselData;
  linkBase: string;
  labels: CarouselLabels;
}

function SlideBody({ slide, linkBase }: { slide: Slide; linkBase: string }) {
  return (
    <>
      <div className={styles.slideMedia}>
        <MediaImage media={slide.image!} sizes="(min-width: 1024px) 40rem, 100vw" className={styles.slideImage} />
        <span className="corner-marks" aria-hidden="true" />
      </div>
      {slide.text.trim() !== "" && <Markdown text={slide.text} className={`${styles.prose} ${styles.slideText}`} linkBase={linkBase} />}
    </>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Carousel({ carousel, linkBase, labels }: CarouselProps) {
  const { slides } = carousel;
  const count = slides.length;
  const block = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const geometry = useCallback(() => {
    const top = block.current!.getBoundingClientRect().top;
    const pinTop = parseFloat(getComputedStyle(frame.current!).top) || 0;
    const step = count > 1 ? spacer.current!.offsetHeight / (count - 1) : 0;
    return { scrollY: window.scrollY, top, pinTop, step };
  }, [count]);

  useEffect(() => {
    if (count < 2) return;
    let frameRequest = 0;
    const update = () => {
      frameRequest = 0;
      const { top, pinTop, step } = geometry();
      setActive(activeSlide(pinTop - top, step, count));
    };
    const schedule = () => {
      if (!frameRequest) frameRequest = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frameRequest) cancelAnimationFrame(frameRequest);
    };
  }, [count, geometry]);

  const goTo = (index: number) => {
    window.scrollTo({
      top: stepScrollTarget(geometry(), index),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const afterId = `after-${carousel.id}`;

  // One slide: a plain image with its text; nothing to pin (KTD8).
  if (count === 1) {
    return (
      <figure className={styles.slideStatic} data-reveal="">
        <SlideBody slide={slides[0]} linkBase={linkBase} />
      </figure>
    );
  }

  return (
    <>
      <div ref={block} className={styles.carousel} style={{ "--slides": count } as CSSProperties} data-carousel="">
        {labels.skip && (
          <a href={`#${afterId}`} className={styles.carouselSkip}>
            {labels.skip}
          </a>
        )}
        <div ref={frame} className={styles.carouselFrame}>
          <div className={styles.carouselSlides}>
            {slides.map((slide, i) => (
              <figure
                key={slide.id}
                className={i === active ? `${styles.slide} ${styles.slideActive}` : styles.slide}
                role="group"
                aria-label={ofCount(i, count)}
                aria-hidden={i === active ? undefined : true}
                data-slide={i}
              >
                <SlideBody slide={slide} linkBase={linkBase} />
              </figure>
            ))}
          </div>
          <div className={styles.carouselControls}>
            {labels.previous && (
              <button type="button" className={siteStyles.buttonGhost} onClick={() => goTo(active - 1)} disabled={active === 0}>
                {labels.previous}
              </button>
            )}
            <Readout text={ofCount(active, count)} className={styles.carouselCount} />
            {labels.next && (
              <button type="button" className={siteStyles.buttonGhost} onClick={() => goTo(active + 1)} disabled={active === count - 1}>
                {labels.next}
              </button>
            )}
          </div>
        </div>
        <div ref={spacer} className={styles.carouselSpacer} aria-hidden="true" />
      </div>
      <span id={afterId} tabIndex={-1} className={styles.carouselAfter} />
    </>
  );
}
