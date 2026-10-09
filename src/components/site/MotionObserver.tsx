"use client";

import { useEffect } from "react";

// The fallback for the scroll reveals (see "Motion" in globals.css). Browsers
// with scroll-driven animations need no script, and with prefers-reduced-motion
// nothing moves, so in both cases this component does nothing. Otherwise it
// marks <html> with data-motion="io" and sets data-shown on each [data-reveal]
// element when it comes into view. It renders no element.

export function MotionObserver() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    if (CSS.supports?.("animation-timeline: view()")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    const watch = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])").forEach((el) => {
        // What is already on screen shows at once, so nothing flashes away.
        if (el.getBoundingClientRect().top < window.innerHeight) el.setAttribute("data-shown", "");
        else observer.observe(el);
      });
    };

    watch(document);
    root.setAttribute("data-motion", "io");

    // Client navigations add new elements; watch them too.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches("[data-reveal]")) watch(node.parentElement ?? document);
            else watch(node);
          }
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.removeAttribute("data-motion");
    };
  }, []);

  return null;
}

export default MotionObserver;
