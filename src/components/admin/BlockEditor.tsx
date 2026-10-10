"use client";

import { move, type Direction } from "@/lib/content/order";
import type { Block, BlockType, FactsBlock, FileBlock, ImagesBlock, Media } from "@/lib/content/schema";
import { AltTextField } from "./AltTextField";
import { MediaField } from "./MediaField";
import { placeUploadedImage, withCurrentAlt } from "./media-merge";
import { omit } from "./omit";
import { OrderButtons } from "./OrderButtons";
import styles from "./admin.module.css";

// One block of an experience page (KTD6): heading, text, facts, images, file,
// or quote. Text is plain text in a text area: paragraphs and simple Markdown
// links only (KTD5).

export const BLOCK_TYPES: { type: BlockType; name: string }[] = [
  { type: "heading", name: "Heading" },
  { type: "text", name: "Text" },
  { type: "facts", name: "Facts" },
  { type: "images", name: "Images" },
  { type: "file", name: "File" },
  { type: "quote", name: "Quote" },
];

export function blockTypeName(type: BlockType): string {
  return BLOCK_TYPES.find((t) => t.type === type)?.name ?? type;
}

/** True when a removal loses something the owner wrote or uploaded, so it needs a confirmation. */
export function blockHoldsContent(block: Block): boolean {
  switch (block.type) {
    case "heading":
    case "text":
    case "quote":
      return block.text.trim() !== "";
    case "facts":
      return block.items.length > 0;
    case "images":
      return block.items.length > 0 || (block.caption ?? "").trim() !== "";
    case "file":
      return block.label.trim() !== "" || block.file !== undefined;
  }
}

/** A short name of a block for the owner: its type and the start of its text. */
export function blockName(block: Block): string {
  const type = blockTypeName(block.type);
  const text =
    block.type === "heading" || block.type === "text" || block.type === "quote"
      ? block.text
      : block.type === "file"
        ? block.label
        : block.type === "images"
          ? (block.caption ?? "")
          : (block.items[0]?.label ?? "");
  const start = text.trim().replace(/\s+/g, " ");
  return start ? `${type} block "${start.length > 40 ? `${start.slice(0, 40)}...` : start}"` : `${type} block`;
}

/**
 * A change to this block, applied to the latest page state. A file upload ends
 * later than it starts, so a change never works on a copy of the block from
 * before the upload.
 */
export type BlockChange = (update: (block: Block) => Block) => void;

export interface BlockEditorProps {
  block: Block;
  index: number;
  count: number;
  /** A text change: marks the page unsaved. */
  onChange: BlockChange;
  /** A file change: saved into the draft at once. */
  onFileChange: BlockChange;
  onMove: (direction: Direction) => void;
  onRemove: () => void;
  mediaPrefix: string;
  confirm: (question: string) => Promise<boolean>;
  beginUpload: () => void;
  endUpload: () => void;
}

/** Applies `f` only when the latest block still has this block's type. */
function typed<T extends Block>(type: T["type"], f: (block: T) => T): (block: Block) => Block {
  return (block) => (block.type === type ? f(block as T) : block);
}

export function BlockEditor(props: BlockEditorProps) {
  const { block, index, count, onMove, confirm } = props;
  const name = blockName(block);

  async function remove() {
    if (!blockHoldsContent(block) || (await confirm(`Remove the ${name}?`))) props.onRemove();
  }

  return (
    <li className={styles.card} data-testid="block" data-block-type={block.type}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{blockTypeName(block.type)}</h3>
        <span className={styles.row}>
          <OrderButtons name={name} index={index} count={count} onMove={onMove} />
          <button
            type="button"
            className={`${styles.button} ${styles.small} ${styles.danger}`}
            aria-label={`Remove the ${name}`}
            onClick={() => void remove()}
          >
            Remove block
          </button>
        </span>
      </div>
      <BlockFields {...props} />
    </li>
  );
}

function BlockFields(props: BlockEditorProps) {
  const { block, onChange } = props;
  switch (block.type) {
    case "heading":
      return (
        <div className={styles.row}>
          <label className={styles.field} style={{ flex: "1 1 16rem" }}>
            <span>Heading text</span>
            <input
              className={styles.input}
              value={block.text}
              onChange={(e) => {
                const text = e.target.value;
                onChange(typed("heading", (b) => ({ ...b, text })));
              }}
            />
          </label>
          <label className={styles.field}>
            <span>Size</span>
            <select
              className={styles.select}
              value={block.level}
              onChange={(e) => {
                const level = e.target.value === "3" ? 3 : 2;
                onChange(typed("heading", (b) => ({ ...b, level })));
              }}
            >
              <option value="2">Section heading</option>
              <option value="3">Smaller heading</option>
            </select>
          </label>
        </div>
      );
    case "text":
    case "quote":
      return (
        <label className={styles.field}>
          <span>{block.type === "text" ? "Text (a blank line starts a new paragraph; links: [text](https://...))" : "Quote"}</span>
          <textarea
            className={styles.textarea}
            value={block.text}
            onChange={(e) => {
              const text = e.target.value;
              onChange((b) => (b.type === "text" || b.type === "quote" ? { ...b, text } : b));
            }}
          />
        </label>
      );
    case "facts":
      return <FactsFields {...props} block={block} />;
    case "images":
      return <ImagesFields {...props} block={block} />;
    case "file":
      return <FileFields {...props} block={block} />;
  }
}

function FileFields(props: BlockEditorProps & { block: FileBlock }) {
  const { block, onChange, onFileChange } = props;
  const label = block.label.trim();
  return (
    <div className={styles.stack}>
      <label className={styles.field}>
        <span>Link text</span>
        <input
          className={styles.input}
          value={block.label}
          onChange={(e) => {
            const value = e.target.value;
            onChange(typed<FileBlock>("file", (b) => ({ ...b, label: value })));
          }}
        />
      </label>
      <MediaField
        label={label ? `the file "${label}"` : "the file"}
        kind="file"
        value={block.file}
        mediaPrefix={props.mediaPrefix}
        confirm={props.confirm}
        beginUpload={props.beginUpload}
        endUpload={props.endUpload}
        onUploaded={(file) => onFileChange(typed<FileBlock>("file", (b) => ({ ...b, file: withCurrentAlt(file, b.file) })))}
        onRemove={() => onFileChange(typed<FileBlock>("file", (b) => omit(b, "file")))}
      />
    </div>
  );
}

function FactsFields(props: BlockEditorProps & { block: FactsBlock }) {
  const { block, onChange, confirm } = props;
  const items = (f: (list: FactsBlock["items"]) => FactsBlock["items"]) =>
    onChange(typed<FactsBlock>("facts", (b) => ({ ...b, items: f(b.items) })));
  return (
    <div className={styles.stack}>
      <ol className={styles.list}>
        {block.items.map((item, i) => (
          <li key={i} className={styles.row} style={{ alignItems: "flex-start" }}>
            <label className={styles.field} style={{ flex: "1 1 12rem" }}>
              <span>Label</span>
              <input
                className={styles.input}
                value={item.label}
                onChange={(e) => {
                  const label = e.target.value;
                  items((list) => list.map((it, j) => (j === i ? { ...it, label } : it)));
                }}
              />
            </label>
            <label className={styles.field} style={{ flex: "2 1 16rem" }}>
              <span>Value (a new line shows as a new line)</span>
              <textarea
                className={styles.textarea}
                style={{ minHeight: "4rem" }}
                value={item.value}
                onChange={(e) => {
                  const value = e.target.value;
                  items((list) => list.map((it, j) => (j === i ? { ...it, value } : it)));
                }}
              />
            </label>
            <OrderButtons
              name={`fact "${item.label || i + 1}"`}
              index={i}
              count={block.items.length}
              onMove={(d) => items((list) => move(list, i, d))}
            />
            <button
              type="button"
              className={`${styles.button} ${styles.small} ${styles.danger}`}
              onClick={async () => {
                const filled = item.label.trim() !== "" || item.value.trim() !== "";
                if (!filled || (await confirm(`Remove the fact "${item.label || item.value}"?`))) {
                  items((list) => list.filter((_, j) => j !== i));
                }
              }}
            >
              Remove fact
            </button>
          </li>
        ))}
      </ol>
      <div>
        <button
          type="button"
          className={`${styles.button} ${styles.small}`}
          onClick={() => items((list) => [...list, { label: "", value: "" }])}
        >
          Add fact
        </button>
      </div>
    </div>
  );
}

function ImagesFields(props: BlockEditorProps & { block: ImagesBlock }) {
  const { block, onChange, onFileChange } = props;
  const items = (save: boolean, f: (list: ImagesBlock["items"]) => ImagesBlock["items"]) =>
    (save ? onFileChange : onChange)(typed<ImagesBlock>("images", (b) => ({ ...b, items: f(b.items) })));
  const setImage = (i: number, save: boolean, f: (image: Media | undefined) => Media | undefined) =>
    items(save, (list) =>
      list.map((item, j) => {
        if (j !== i) return item;
        const image = f(item.image);
        return image ? { image } : {};
      }),
    );
  return (
    <div className={styles.stack}>
      <ol className={styles.list}>
        {block.items.map((item, i) => (
          <li key={i} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.muted}>Image {i + 1}</span>
              <span className={styles.row}>
                <OrderButtons
                  name={`image ${i + 1}`}
                  index={i}
                  count={block.items.length}
                  onMove={(d) => items(false, (list) => move(list, i, d))}
                />
                <button
                  type="button"
                  className={`${styles.button} ${styles.small} ${styles.danger}`}
                  onClick={async () => {
                    const name = item.image?.fileName ? `the image "${item.image.fileName}"` : `image ${i + 1}`;
                    if (!item.image || (await props.confirm(`Remove ${name}?`))) {
                      items(true, (list) => list.filter((_, j) => j !== i));
                    }
                  }}
                >
                  Remove image
                </button>
              </span>
            </div>
            <MediaField
              label={`image ${i + 1}`}
              kind="image"
              value={item.image}
              mediaPrefix={props.mediaPrefix}
              confirm={props.confirm}
              beginUpload={props.beginUpload}
              endUpload={props.endUpload}
              // `item` is this item as it was when the upload started; the
              // result goes to that item wherever it is now (not to index i).
              onUploaded={(image) => items(true, (list) => placeUploadedImage(list, item, image))}
            />
            <AltTextField
              label="Alt text (what the image shows, for screen readers)"
              media={item.image}
              onChange={(alt) => setImage(i, false, (image) => (image ? { ...image, alt } : image))}
            />
          </li>
        ))}
      </ol>
      <MediaField
        label="a new image"
        kind="image"
        value={undefined}
        addText="Add image"
        mediaPrefix={props.mediaPrefix}
        confirm={props.confirm}
        beginUpload={props.beginUpload}
        endUpload={props.endUpload}
        onUploaded={(image) => items(true, (list) => [...list, { image }])}
      />
      <label className={styles.field}>
        <span>Caption (optional)</span>
        <input
          className={styles.input}
          value={block.caption ?? ""}
          onChange={(e) => {
            const caption = e.target.value;
            onChange(typed<ImagesBlock>("images", (b) => ({ ...b, caption })));
          }}
        />
      </label>
    </div>
  );
}
