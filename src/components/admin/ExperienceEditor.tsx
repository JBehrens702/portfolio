"use client";

import { useCallback, useState } from "react";
import { saveExperience } from "@/app/admin/actions";
import type { Block, BlockType, Experience } from "@/lib/content/schema";
import { BLOCK_TYPES, BlockEditor, newBlock, type BlockChange } from "./BlockEditor";
import { useConfirm } from "./ConfirmDialog";
import { MediaField } from "./MediaField";
import { moved } from "./OrderButtons";
import { SaveBar } from "./SaveBar";
import { useDraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The editor of one experience (2.4.2, 2.4.4, KTD6): the home block fields and
// the ordered blocks of the full page. Text edits wait for "Save draft"; a file
// upload or removal saves the page at once, so the uploaded file is in the draft.

/** The skills as the owner typed them: one per line, blank lines dropped on save. */
function forSave(experience: Experience): Experience {
  return { ...experience, skills: experience.skills.map((s) => s.trim()).filter((s) => s !== "") };
}

export function ExperienceEditor({ initial, mediaPrefix }: { initial: Experience; mediaPrefix: string }) {
  const slug = initial.slug;
  const persist = useCallback((value: Experience) => saveExperience(slug, forSave(value)), [slug]);
  const editor = useDraftEditor(initial, persist);
  const { value, update } = editor;
  const { confirm, dialog } = useConfirm();
  const [newType, setNewType] = useState<BlockType>("text");

  const set = <K extends keyof Experience>(key: K, v: Experience[K]) => update((e) => ({ ...e, [key]: v }));
  const blockChange = (id: string, save: boolean): BlockChange => (f) => {
    update((e) => ({ ...e, blocks: e.blocks.map((b) => (b.id === id ? f(b) : b)) }));
    if (save) void editor.save();
  };
  const blocks = (f: (list: Block[]) => Block[]) => update((e) => ({ ...e, blocks: f(e.blocks) }));

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>
        <a href={`/preview/experiences/${encodeURIComponent(slug)}`}>Preview this page</a> (shows the saved draft)
      </p>

      <section className={styles.card} aria-labelledby="home-block">
        <h2 id="home-block" className={styles.cardTitle}>
          Home page block
        </h2>
        <label className={styles.field}>
          <span>Title on the home page</span>
          <input className={styles.input} name="homeTitle" value={value.homeTitle} onChange={(e) => set("homeTitle", e.target.value)} />
        </label>
        <MediaField
          label="the card image"
          kind="image"
          value={value.cardImage}
          mediaPrefix={mediaPrefix}
          confirm={confirm}
          beginUpload={editor.beginUpload}
          endUpload={editor.endUpload}
          onUploaded={(cardImage) => {
            update((e) => ({ ...e, cardImage }));
            void editor.save();
          }}
          onRemove={() => {
            update((e) => {
              const { cardImage: _removed, ...rest } = e;
              void _removed;
              return rest;
            });
            void editor.save();
          }}
        />
        {value.cardImage ? (
          <label className={styles.field}>
            <span>Card image alt text (what the image shows, for screen readers)</span>
            <input
              className={styles.input}
              value={value.cardImage.alt ?? ""}
              onChange={(e) => {
                const alt = e.target.value;
                update((x) => (x.cardImage ? { ...x, cardImage: { ...x.cardImage, alt } } : x));
              }}
            />
          </label>
        ) : null}
        <label className={styles.field}>
          <span>Skills (one per line)</span>
          <textarea
            className={styles.textarea}
            name="skills"
            value={value.skills.join("\n")}
            onChange={(e) => set("skills", e.target.value.split("\n"))}
          />
        </label>
        <label className={styles.field}>
          <span>First paragraph (shown on the home page)</span>
          <textarea className={styles.textarea} name="homeText" value={value.homeText} onChange={(e) => set("homeText", e.target.value)} />
        </label>
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

        <ol className={styles.list} aria-label="Blocks">
          {value.blocks.map((block, index) => (
            <BlockEditor
              key={block.id}
              block={block}
              index={index}
              count={value.blocks.length}
              onChange={blockChange(block.id, false)}
              onFileChange={blockChange(block.id, true)}
              onMove={(direction) => blocks((list) => moved(list, list.findIndex((b) => b.id === block.id), direction))}
              onRemove={() => blocks((list) => list.filter((b) => b.id !== block.id))}
              mediaPrefix={mediaPrefix}
              confirm={confirm}
              beginUpload={editor.beginUpload}
              endUpload={editor.endUpload}
            />
          ))}
        </ol>

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
          <button type="button" className={styles.button} onClick={() => blocks((list) => [...list, newBlock(newType, list)])}>
            Add block
          </button>
        </div>
      </section>

      <SaveBar editor={editor} />
      {dialog}
    </div>
  );
}
