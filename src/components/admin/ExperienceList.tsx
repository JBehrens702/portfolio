"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type KeyboardEvent, type MouseEvent } from "react";
import { addExperience, moveExperience, removeExperience, type ActionResult } from "@/app/admin/actions";
import { useConfirm } from "./ConfirmDialog";
import { IssueList } from "./IssueList";
import { OrderButtons } from "./OrderButtons";
import { NARROW_QUERY, nextRowIndex, openHref, selectHref, type MapRow } from "./site-map-model";
import { NETWORK_FAILURE } from "./useDraftEditor";
import { useHydrated } from "./useHydrated";
import styles from "./admin.module.css";

// The page list of the admin map (U6, KTD9): the home page, each experience
// under it in site order, and each page that the draft removed. The experience
// rows keep the controls of the old admin home (2.4.4, 2.4.5, 2.4.28): open,
// move, remove, and add; each button saves the draft at once.
//
// A row's title selects the page for the large picture (2.4.20). It is a link
// to the map with that page in the address, so it also works before hydration
// and in a new tab. At phone width it opens the page's preview (2.4.27).

type Message = { ok: boolean; text: string; issues?: string[] } | null;

/** A page's change mark as a word (2.4.29, 2.4.30): "new", "changed", or "removed". */
export function MarkText({ mark }: { mark: MapRow["mark"] }) {
  if (!mark) return null;
  return (
    <span className={styles.mark} data-testid="page-mark" data-mark={mark}>
      {mark}
    </span>
  );
}

export function ExperienceList({
  rows,
  selected,
  onSelect,
}: {
  rows: MapRow[];
  /** The page id of the selected row. */
  selected: string;
  onSelect: (row: MapRow) => void;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const [title, setTitle] = useState("");
  const hydrated = useHydrated();
  const busy = pending || !hydrated;
  const listRef = useRef<HTMLOListElement>(null);

  const home = rows.filter((row) => row.kind === "home");
  const experiences = rows.filter((row) => row.kind === "experience");
  const removed = rows.filter((row) => row.kind === "removed");
  // The rows in the order that the list shows them, for the arrow keys.
  const shown = [...home, ...experiences, ...removed];

  function run(action: () => Promise<ActionResult | { ok: true; slug: string; savedAt: string }>, done?: (slug?: string) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setMessage({ ok: true, text: `Saved at ${new Date(result.savedAt).toLocaleTimeString()}.` });
          if (done) done("slug" in result ? result.slug : undefined);
          else router.refresh();
        } else {
          setMessage({ ok: false, text: result.message, issues: result.issues });
        }
      } catch {
        setMessage({ ok: false, text: NETWORK_FAILURE });
      }
    });
  }

  function onTitleClick(event: MouseEvent<HTMLAnchorElement>, row: MapRow) {
    // A click with a modifier key opens the link in a new tab or window, as usual.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.matchMedia(NARROW_QUERY).matches) window.location.assign(openHref(row));
    else onSelect(row);
  }

  function onTitleKey(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    const next = nextRowIndex(index, event.key, shown.length);
    if (next === null) return;
    event.preventDefault();
    listRef.current?.querySelectorAll<HTMLAnchorElement>("[data-map-title]")[next]?.focus();
    onSelect(shown[next]);
  }

  function titleLink(row: MapRow) {
    const index = shown.indexOf(row);
    const isSelected = row.page === selected;
    return (
      <a
        href={selectHref(row)}
        className={styles.mapTitle}
        data-map-title=""
        aria-current={isSelected ? "true" : undefined}
        onClick={(event) => onTitleClick(event, row)}
        onKeyDown={(event) => onTitleKey(event, index)}
      >
        {row.title}
      </a>
    );
  }

  function pageLinks(row: MapRow) {
    return (
      <>
        {row.editHref ? <a href={row.editHref}>Edit</a> : null}
        {row.previewHref ? (
          <a className={styles.muted} href={row.previewHref}>
            Preview
          </a>
        ) : null}
      </>
    );
  }

  return (
    <div className={styles.stack}>
      <ol className={styles.list} aria-label="Pages" ref={listRef}>
        {home.map((row) => (
          <li key={row.page} className={styles.stack}>
            <div className={styles.card} data-testid="home-row" data-selected={row.page === selected ? "" : undefined}>
              <div className={styles.cardHeader}>
                <span className={styles.row}>
                  {titleLink(row)}
                  <MarkText mark={row.mark} />
                </span>
                <span className={styles.row}>{pageLinks(row)}</span>
              </div>
            </div>

            <ol className={`${styles.list} ${styles.mapNested}`} aria-label="Experience pages">
              {experiences.map((row, index) => (
                <li
                  key={row.page}
                  className={styles.card}
                  data-testid="experience-row"
                  data-selected={row.page === selected ? "" : undefined}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.row}>
                      {titleLink(row)}
                      <MarkText mark={row.mark} />
                    </span>
                    <span className={styles.row}>
                      {pageLinks(row)}
                      <OrderButtons
                        name={`"${row.title}"`}
                        index={index}
                        count={experiences.length}
                        disabled={busy}
                        onMove={(direction) => run(() => moveExperience(row.page, direction))}
                      />
                      <button
                        type="button"
                        className={`${styles.button} ${styles.small} ${styles.danger}`}
                        disabled={busy}
                        onClick={async () => {
                          const question = `Remove the experience "${row.title}" with its home block and full page?`;
                          if (await confirm(question)) run(() => removeExperience(row.page));
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                </li>
              ))}

              {removed.map((row) => (
                <li
                  key={row.page}
                  className={`${styles.card} ${styles.mapRemoved}`}
                  data-testid="removed-row"
                  data-selected={row.page === selected ? "" : undefined}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.row}>
                      {titleLink(row)}
                      <MarkText mark={row.mark} />
                    </span>
                    <span className={styles.row}>
                      <span className={styles.muted}>Still on the live site until you publish.</span>
                      {row.liveHref ? <a href={row.liveHref}>Live page</a> : null}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          const name = title.trim();
          if (!name) return;
          run(
            () => addExperience(name),
            (slug) => {
              if (slug) router.push(`/admin/experiences/${encodeURIComponent(slug)}`);
            },
          );
        }}
      >
        <label className={styles.row}>
          <span className={styles.muted}>New experience title</span>
          <input className={styles.input} style={{ width: "auto" }} name="newExperience" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit" className={styles.button} disabled={busy}>
          Add experience
        </button>
      </form>

      {message ? (
        <div role={message.ok ? "status" : "alert"} className={message.ok ? undefined : styles.error}>
          {message.text}
          <IssueList issues={message.issues} />
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
