"use client";

import { useSyncExternalStore } from "react";
import { barLinks, type BarMode, type BarPage } from "./page-bar-model";
import styles from "./PageBar.module.css";

// The page bar (KTD10, 2.4.31): one click to the map, or to the editor or
// preview of any page. On a preview page it floats at the bottom, so the page
// keeps the layout a visitor sees; on an editor page it sits at the top.
//
// Inside a frame (the admin map's pictures, KTD6) the bar is left out. The
// server knows it from `Sec-Fetch-Dest: iframe` on the first load (`framed`);
// after a click inside the frame the request is a client navigation without
// that header, so the browser checks `window.self !== window.top` as well.

const noSubscribe = () => () => {};
const inFrame = () => window.self !== window.top;
const notOnServer = () => false;

export interface PageBarProps {
  pages: BarPage[];
  /** The page this bar is on, or null (for example the Labels editor). */
  current: string | null;
  mode: BarMode;
  /** The server saw a framed request. */
  framed?: boolean;
}

export function PageBar({ pages, current, mode, framed = false }: PageBarProps) {
  const framedInBrowser = useSyncExternalStore(noSubscribe, inFrame, notOnServer);
  if (framed || framedInBrowser) return null;

  return (
    <nav
      className={`${styles.bar} ${mode === "preview" ? styles.floating : styles.inline}`}
      aria-label={mode === "edit" ? "Pages to edit" : "Pages to preview"}
      data-testid="page-bar"
    >
      <a className={styles.map} href="/admin">
        Map
      </a>
      <ul className={styles.pages}>
        {barLinks(pages, current, mode).map((link) => (
          <li key={link.href} className={styles.page}>
            <a href={link.href} aria-current={link.current ? "page" : undefined} className={link.current ? styles.current : undefined}>
              {link.title}
            </a>
            <a href={link.other.href} aria-label={link.other.name} className={styles.other}>
              {link.other.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
