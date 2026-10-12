"use client";

import { useCallback, useEffect, useState } from "react";
import { resetExperience, saveExperience } from "@/app/admin/actions";
import { layoutIds } from "@/lib/content/layout";
import { newBlock, newCarousel, newRow } from "@/lib/content/order";
import type { BlockType, Experience, LayoutItem, Site } from "@/lib/content/schema";
import { withLayout, type LayoutEdit } from "@/lib/content/layout-edit";
import { visibleSite } from "@/lib/content/visibility";
import { ExperiencePage } from "@/components/site/ExperiencePage";
import { MotionObserver } from "@/components/site/MotionObserver";
import { BLOCK_TYPES } from "./BlockEditor";
import { CardFields, trimSkills } from "./CardFields";
import { useConfirm } from "./ConfirmDialog";
import { LayoutEditor } from "./LayoutEditor";
import { SaveBar } from "./SaveBar";
import { useDraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The editor of one experience (2.4.2, 2.4.4): the home block fields, the page
// title, and the page layout in its real structure and style (2.4.9-2.4.14,
// KTD6). Text edits wait for "Save draft"; a file upload or removal saves the
// page at once, so the uploaded file is in the draft. Undo and redo step through
// the changes of this visit; "Show as visitors see it" renders the real page from
// the unsaved value (2.4.13).

function forSave(experience: Experience): Experience {
  return { ...experience, skills: trimSkills(experience.skills) };
}

/** True when a key press belongs to a text field, which keeps the browser's own undo. */
function inTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * True when a dialog is open. A confirm question covers the page, so undo must
 * not change the page behind it, wherever the focus is.
 */
function dialogOpen(): boolean {
  return document.querySelector("dialog[open]") !== null;
}

/** A new layout item for "Add block": a heading item, or a one-column row with the block. */
function newItem(type: BlockType, layout: LayoutItem[]): LayoutItem {
  const taken = layoutIds(layout);
  if (type === "heading") return newBlock("heading", taken) as LayoutItem;
  const row = newRow("one", taken);
  return { ...row, cells: [[newBlock(type, [...taken, row.id])]] } as LayoutItem;
}

export function ExperienceEditor({ initial, site, mediaPrefix }: { initial: Experience; site: Site; mediaPrefix: string }) {
  const slug = initial.slug;
  const persist = useCallback((value: Experience) => saveExperience(slug, forSave(value)), [slug]);
  const editor = useDraftEditor(initial, persist);
  const { value, update, undo, redo } = editor;
  const { confirm, dialog } = useConfirm();
  const [newType, setNewType] = useState<BlockType>("text");
  const [visitorView, setVisitorView] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Reset (2.4.15, KTD11): the published version of this page replaces its draft.
  async function reset() {
    const question = "Reset this page to the published version? Every change on this page that is not published is lost.";
    if (!(await confirm(question, "Reset"))) return;
    setResetError(null);
    try {
      const result = await resetExperience(slug);
      if (result.ok) editor.replace(result.experience);
      else setResetError(result.message);
    } catch {
      setResetError("Not reset: the connection failed. Your draft is unchanged.");
    }
  }

  const set = <K extends keyof Experience>(key: K, v: Experience[K]) => update((e) => ({ ...e, [key]: v }), `field:${String(key)}`);
  const edit: LayoutEdit = (change, key) => update((e) => withLayout(e, change), key);
  // An upload or removal that changes the layout saves at once; a change that
  // leaves the layout as it was starts no save.
  const editAndSave: LayoutEdit = (change) => {
    let changed = false;
    update((e) => {
      const next = withLayout(e, change);
      changed = next !== e;
      return next;
    });
    if (changed) void editor.save();
  };

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y outside text fields and dialogs (2.4.14).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || inTextField(event.target) || dialogOpen()) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const visible = visibleSite({ ...site, experiences: site.experiences.map((e) => (e.slug === slug ? forSave(value) : e)) });
  const shown = visible.experiences.find((e) => e.slug === slug);

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>
        <a href={`/preview/experiences/${encodeURIComponent(slug)}`}>Preview this page</a> (shows the saved draft)
      </p>

      <section className={styles.card} aria-labelledby="home-block">
        <h2 id="home-block" className={styles.cardTitle}>
          Home page block
        </h2>
        <CardFields editor={editor} imageLabel="the card image" mediaPrefix={mediaPrefix} confirm={confirm} />
      </section>

      <section className={styles.card} aria-labelledby="full-page">
        <h2 id="full-page" className={styles.cardTitle}>
          Full page
        </h2>
        <label className={styles.field}>
          <span>Page heading</span>
          <input className={styles.input} name="pageTitle" value={value.pageTitle} onChange={(e) => set("pageTitle", e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Subtitle (optional)</span>
          <input className={styles.input} name="subtitle" value={value.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
        </label>
      </section>

      <div className={styles.editTools} data-testid="edit-tools">
        <button type="button" className={`${styles.button} ${styles.small}`} onClick={undo} disabled={!editor.canUndo}>
          Undo
        </button>
        <button type="button" className={`${styles.button} ${styles.small}`} onClick={redo} disabled={!editor.canRedo}>
          Redo
        </button>
        <label className={styles.row}>
          <input type="checkbox" checked={visitorView} onChange={(e) => setVisitorView(e.target.checked)} />
          <span>Show as visitors see it</span>
        </label>
        <button type="button" className={`${styles.button} ${styles.small} ${styles.danger}`} onClick={() => void reset()}>
          Reset this page
        </button>
        {resetError && (
          <span className={styles.error} role="alert" data-testid="reset-error">
            {resetError}
          </span>
        )}
      </div>

      {visitorView ? (
        <div className={styles.visitorView} data-testid="visitor-view">
          {shown ? (
            <ExperiencePage site={visible} experience={shown} linkBase="/preview" />
          ) : (
            <p className={styles.muted}>Nothing on this page shows yet.</p>
          )}
          <MotionObserver />
        </div>
      ) : (
        <LayoutEditor
          layout={value.layout}
          edit={edit}
          editAndSave={editAndSave}
          mediaPrefix={mediaPrefix}
          confirm={confirm}
          beginUpload={editor.beginUpload}
          endUpload={editor.endUpload}
        />
      )}

      {!visitorView && (
        <div className={styles.row}>
          <label className={styles.row}>
            <span className={styles.muted}>New block</span>
            <select className={styles.select} value={newType} onChange={(e) => setNewType(e.target.value as BlockType)}>
              {BLOCK_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.button} onClick={() => edit((layout) => [...layout, newItem(newType, layout)])}>
            Add block
          </button>
          <button type="button" className={styles.button} onClick={() => edit((layout) => [...layout, newCarousel(layoutIds(layout))])}>
            Add carousel
          </button>
        </div>
      )}

      <SaveBar editor={editor} />
      {dialog}
    </div>
  );
}
