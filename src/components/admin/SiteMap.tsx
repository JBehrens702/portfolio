"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { OutsideKind } from "@/lib/content/site-links";
import { ExperienceList, MarkText } from "./ExperienceList";
import {
  frameTitle,
  isPlainClick,
  openHref,
  PAGE_PARAM,
  readView,
  rowFromParam,
  selectHref,
  writeView,
  type LinkLine,
  type MapRow,
  type MapView,
  type PageLinkLines,
} from "./site-map-model";
import { useHydrated } from "./useHydrated";
import styles from "./admin.module.css";

// The map of the site on the admin home (U6, 2.4.18 to 2.4.27). The list view
// shows the page list beside the selected page as a large, live picture of the
// saved draft; the wall view shows every page as a picture at once. Each
// picture is the page's preview in a scaled frame (KTD6); a removed page shows
// its live page, because the draft has no preview of it.
//
// The selected page lives in the address (?page=<slug>; no parameter for the
// home page), so a reload keeps it. The list or wall choice is a per-viewer
// convenience in localStorage (KTD9).

/** The width of the layout that each picture shows, scaled down to the frame. */
const FRAME_WIDTH = 1280;

// ---- The list or wall choice ----

const listeners = new Set<() => void>();
// The choice when localStorage refuses to store it: it lasts until a reload.
let memoryView: MapView | null = null;
const localStore = () => window.localStorage;

function subscribeView(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const viewSnapshot = (): MapView => memoryView ?? readView(localStore);
const serverView = (): MapView => "list";

function chooseView(view: MapView) {
  memoryView = writeView(localStore, view) ? null : view;
  for (const listener of listeners) listener();
}

// ---- A picture: one page in a scaled frame ----

function ScaledFrame({ row, interactive, lazy }: { row: MapRow; interactive: boolean; lazy: boolean }) {
  const hydrated = useHydrated();
  const [loaded, setLoaded] = useState(false);
  // The scale follows the frame's width: a 1280 px wide page, shrunk to fit.
  const fit = useCallback((box: HTMLDivElement | null) => {
    if (!box) return;
    const update = () => {
      if (box.clientWidth > 0) box.style.setProperty("--frame-scale", String(box.clientWidth / FRAME_WIDTH));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={fit} className={styles.frameBox} data-loaded={loaded ? "" : undefined}>
      {/* The frame mounts after hydration, so its load event always reaches React. */}
      {hydrated ? (
        <iframe
          src={row.frameHref}
          title={frameTitle(row)}
          className={interactive ? styles.frame : `${styles.frame} ${styles.frameStill}`}
          loading={lazy ? "lazy" : undefined}
          tabIndex={interactive ? undefined : -1}
          onLoad={() => setLoaded(true)}
        />
      ) : null}
      {loaded ? null : (
        <div className={styles.framePlaceholder} data-testid="frame-placeholder" aria-hidden="true">
          {row.title}
        </div>
      )}
    </div>
  );
}

// ---- The selected page: its picture, its addresses, and its links ----

function LinkList({
  lines,
  rows,
  onSelect,
  label,
  empty,
  testId,
}: {
  lines: LinkLine[];
  rows: MapRow[];
  onSelect: (row: MapRow) => void;
  label: string;
  empty: string;
  testId: string;
}) {
  if (lines.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.mapLinkList} aria-label={label} data-testid={testId}>
      {lines.map((line) => {
        const target = rows.find((row) => row.page === line.page);
        return (
          <li key={line.page}>
            {target ? (
              <a
                href={selectHref(target)}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  onSelect(target);
                }}
              >
                {line.title}
              </a>
            ) : (
              line.title
            )}{" "}
            <span className={styles.muted}>({line.reasons})</span>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedPage({
  row,
  rows,
  lines,
  onSelect,
}: {
  row: MapRow;
  rows: MapRow[];
  lines: PageLinkLines;
  onSelect: (row: MapRow) => void;
}) {
  return (
    <section className={styles.mapPicture} data-testid="map-picture" aria-labelledby="selected-page-heading">
      <ScaledFrame key={row.frameHref} row={row} interactive lazy={false} />
      <div className={styles.cardHeader}>
        <span className={styles.row}>
          <h3 id="selected-page-heading" className={styles.cardTitle}>
            {row.title}
          </h3>
          <MarkText mark={row.mark} />
        </span>
        <span className={styles.row}>
          {row.editHref ? <a href={row.editHref}>Edit</a> : null}
          {row.previewHref ? <a href={row.previewHref}>Preview</a> : null}
          {row.liveHref ? <a href={row.liveHref}>Live page</a> : null}
        </span>
      </div>
      {row.kind === "removed" ? (
        <p className={styles.muted}>The draft removed this page. Visitors see it until you publish.</p>
      ) : (
        <div className={styles.mapLinks}>
          <div>
            <h4 className={styles.mapLinksHeading}>Links here from</h4>
            <LinkList lines={lines.from} rows={rows} onSelect={onSelect} label="Links here from" empty="No page links here." testId="links-from" />
          </div>
          <div>
            <h4 className={styles.mapLinksHeading}>Links to</h4>
            <LinkList lines={lines.to} rows={rows} onSelect={onSelect} label="Links to" empty="This page links to no other page." testId="links-to" />
          </div>
        </div>
      )}
    </section>
  );
}

// ---- The wall of pictures ----

function Wall({ rows }: { rows: MapRow[] }) {
  return (
    <ol className={styles.wall} aria-label="All pages">
      {rows.map((row) => (
        <li key={row.page} className={styles.wallTile} data-testid="wall-tile">
          <div className={styles.wallPicture}>
            <ScaledFrame row={row} interactive={false} lazy />
            <button
              type="button"
              className={styles.wallOpen}
              aria-label={row.kind === "removed" ? `Open ${row.title} live page` : `Open ${row.title} preview`}
              onClick={() => window.location.assign(openHref(row))}
            />
          </div>
          <div className={styles.cardHeader}>
            <span className={styles.row}>
              <span>{row.title}</span>
              <MarkText mark={row.mark} />
            </span>
            <span className={styles.row}>
              {row.editHref ? <a href={row.editHref}>Edit</a> : null}
              {row.previewHref ? (
                <a className={styles.muted} href={row.previewHref}>
                  Preview
                </a>
              ) : null}
              {row.liveHref ? <a href={row.liveHref}>Live page</a> : null}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---- The map ----

const OUTSIDE_WORDS: Record<OutsideKind, string> = {
  contact: "contact link",
  resume: "resume",
  software: "software card",
  file: "file",
  text: "link in the text",
};

export interface OutsideLine {
  href: string;
  kind: OutsideKind;
  /** The title of the page that shows the link first. */
  pageTitle: string;
}

export function SiteMap({
  rows,
  links,
  outside,
}: {
  rows: MapRow[];
  links: Record<string, PageLinkLines>;
  outside: OutsideLine[];
}) {
  const hydrated = useHydrated();
  const view = useSyncExternalStore(subscribeView, viewSnapshot, serverView);
  const params = useSearchParams();
  const selected = rowFromParam(params.get(PAGE_PARAM), rows);

  // replaceState keeps the address in step with Next.js (useSearchParams), with
  // no server request; a reload then reads the same page from the address.
  const select = (row: MapRow) => window.history.replaceState(null, "", selectHref(row));

  return (
    <section className={styles.section} aria-labelledby="map-heading" data-testid="site-map" data-view={view}>
      <div className={styles.cardHeader}>
        <h2 id="map-heading">Pages</h2>
        <div className={styles.row} role="group" aria-label="View">
          <button
            type="button"
            className={`${styles.button} ${styles.small}`}
            aria-pressed={view === "list"}
            disabled={!hydrated}
            onClick={() => chooseView("list")}
          >
            List view
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.small}`}
            aria-pressed={view === "wall"}
            disabled={!hydrated}
            onClick={() => chooseView("wall")}
          >
            Wall view
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className={styles.mapLayout}>
          <ExperienceList rows={rows} selected={selected.page} onSelect={select} />
          <SelectedPage row={selected} rows={rows} lines={links[selected.page] ?? { to: [], from: [] }} onSelect={select} />
        </div>
      ) : (
        <Wall rows={rows} />
      )}

      {outside.length > 0 ? (
        <details className={styles.mapOutside}>
          <summary>Links that leave the site ({outside.length})</summary>
          <ul className={styles.mapLinkList}>
            {outside.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.href}
                </a>{" "}
                <span className={styles.muted}>
                  ({OUTSIDE_WORDS[link.kind]}, {link.pageTitle})
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
