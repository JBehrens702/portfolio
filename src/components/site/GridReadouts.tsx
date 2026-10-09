"use client";

import { useEffect, useRef, useState } from "react";
import { coordMark } from "./markings";

// Live grid coordinates for the hero (see markings.ts). Both readouts measure
// against the nearest ancestor with data-grid-origin, in CSS pixels snapped to
// the 24 px grid. They are aria-hidden, carry data-marking, and hold no words.

const ORIGIN = "[data-grid-origin]";

/**
 * The grid position of a corner of the parent element: "start" is the top-left
 * corner, "end" the bottom-right one. It shows once measured (data-measured)
 * and follows changes of size.
 */
export function CoordReadout({ corner, className }: { corner: "start" | "end"; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    const origin = el?.closest(ORIGIN);
    if (!el || !box || !origin || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const o = origin.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      setText(corner === "start" ? coordMark(b.left - o.left, b.top - o.top) : coordMark(b.right - o.left, b.bottom - o.top));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(origin);
    observer.observe(box);
    return () => observer.disconnect();
  }, [corner]);

  return (
    <span
      ref={ref}
      className={className ? `readout ${className}` : "readout"}
      aria-hidden="true"
      data-marking=""
      data-measured={text ? "" : undefined}
    >
      {text ?? coordMark(0, 0)}
    </span>
  );
}

/**
 * The pointer position inside the origin element, with a faint crosshair. With
 * a fine pointer and no reduced-motion preference it follows the pointer;
 * otherwise (touch screens, reduced motion) it stays at the origin.
 */
export function PointerReadout({ className, crosshairClassName }: { className?: string; crosshairClassName?: string }) {
  const readout = useRef<HTMLSpanElement>(null);
  const crosshair = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(() => coordMark(0, 0));

  useEffect(() => {
    const el = readout.current;
    const origin = el?.closest<HTMLElement>(ORIGIN);
    if (!el || !origin) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const draw = () => {
      frame = 0;
      setText(coordMark(x, y));
      crosshair.current?.style.setProperty("--px", `${x}px`);
      crosshair.current?.style.setProperty("--py", `${y}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const rect = origin.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      crosshair.current?.setAttribute("data-active", "");
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const onLeave = () => crosshair.current?.removeAttribute("data-active");
    origin.addEventListener("pointermove", onMove);
    origin.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      origin.removeEventListener("pointermove", onMove);
      origin.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <>
      <span ref={crosshair} className={crosshairClassName} aria-hidden="true" />
      <span ref={readout} className={className ? `readout ${className}` : "readout"} aria-hidden="true" data-marking="">
        <svg viewBox="0 0 12 12" focusable="false">
          <path d="M6 0v4.5M6 7.5V12M0 6h4.5M7.5 6H12" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect x="4.25" y="4.25" width="3.5" height="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        {text}
      </span>
    </>
  );
}
