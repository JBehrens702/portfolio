"use client";

import { useState } from "react";
import { saveSoftware } from "@/app/admin/actions";
import { move, slugify, unique } from "@/lib/content/order";
import type { SoftwareCard } from "@/lib/content/schema";
import { AltTextField } from "./AltTextField";
import { useConfirm } from "./ConfirmDialog";
import { MediaField } from "./MediaField";
import { omit } from "./omit";
import { OrderButtons } from "./OrderButtons";
import { SaveBar } from "./SaveBar";
import { useDraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The software cards editor (0.1.4, 2.4.2, 2.4.5): add, remove, and order the
// cards, and edit each card's name, overview, screenshot, and link. A card has
// no full page (0.1.5).

export function SoftwareEditor({ initial, mediaPrefix }: { initial: SoftwareCard[]; mediaPrefix: string }) {
  const editor = useDraftEditor(initial, saveSoftware);
  const { value, update } = editor;
  const { confirm, dialog } = useConfirm();
  const [newName, setNewName] = useState("");

  const card = (id: string, f: (card: SoftwareCard) => SoftwareCard, save = false) => {
    update((cards) => cards.map((c) => (c.id === id ? f(c) : c)));
    if (save) void editor.save();
  };

  return (
    <div className={styles.stack}>
      <ol className={styles.list} aria-label="Software cards">
        {value.map((item, index) => (
          <li key={item.id} className={styles.card} data-testid="software-card">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{item.name || "New card"}</h2>
              <span className={styles.row}>
                <OrderButtons
                  name={`the card "${item.name}"`}
                  index={index}
                  count={value.length}
                  onMove={(d) => update((cards) => move(cards, cards.findIndex((c) => c.id === item.id), d))}
                />
                <button
                  type="button"
                  className={`${styles.button} ${styles.small} ${styles.danger}`}
                  onClick={async () => {
                    if (await confirm(`Remove the software card "${item.name}"?`)) {
                      update((cards) => cards.filter((c) => c.id !== item.id));
                    }
                  }}
                >
                  Remove card
                </button>
              </span>
            </div>
            <label className={styles.field}>
              <span>Name</span>
              <input
                className={styles.input}
                value={item.name}
                onChange={(e) => {
                  const name = e.target.value;
                  card(item.id, (c) => ({ ...c, name }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Overview (a blank line starts a new paragraph)</span>
              <textarea
                className={styles.textarea}
                value={item.overview ?? ""}
                onChange={(e) => {
                  const overview = e.target.value;
                  card(item.id, (c) => ({ ...c, overview }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Link (https://..., optional)</span>
              <input
                className={styles.input}
                inputMode="url"
                value={item.link ?? ""}
                onChange={(e) => {
                  const link = e.target.value.trim();
                  card(item.id, (c) => ({ ...c, link }));
                }}
              />
            </label>
            <MediaField
              label={`the screenshot of "${item.name}"`}
              kind="image"
              value={item.screenshot}
              mediaPrefix={mediaPrefix}
              confirm={confirm}
              beginUpload={editor.beginUpload}
              endUpload={editor.endUpload}
              onUploaded={(screenshot) => card(item.id, (c) => ({ ...c, screenshot }), true)}
              onRemove={() => card(item.id, (c) => omit(c, "screenshot"), true)}
            />
            <AltTextField
              label="Screenshot alt text"
              media={item.screenshot}
              onChange={(alt) => card(item.id, (c) => (c.screenshot ? { ...c, screenshot: { ...c.screenshot, alt } } : c))}
            />
          </li>
        ))}
      </ol>

      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          update((cards) => [...cards, { id: unique(slugify(name, "software"), cards.map((c) => c.id)), name }]);
          setNewName("");
        }}
      >
        <label className={styles.row}>
          <span className={styles.muted}>New card name</span>
          <input className={styles.input} style={{ width: "auto" }} value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <button type="submit" className={styles.button}>
          Add card
        </button>
      </form>

      <SaveBar editor={editor} />
      {dialog}
    </div>
  );
}
