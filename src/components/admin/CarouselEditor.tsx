"use client";

import { addSlide, mapSlide, moveSlide, removeSlide } from "@/lib/content/layout-edit";
import type { Carousel, LayoutItem } from "@/lib/content/schema";
import { AltTextField } from "./AltTextField";
import { MediaField } from "./MediaField";
import { withCurrentAlt } from "./media-merge";
import { omit } from "./omit";
import { OrderButtons } from "./OrderButtons";
import styles from "./admin.module.css";

// The fields of one carousel (2.4.12): its slides in order, each with an image,
// the image's alt text, and a description. An upload or a removed image saves
// the page at once, as other files do; text waits for "Save draft".

export type LayoutEdit = (change: (items: LayoutItem[]) => LayoutItem[], key?: string) => void;

export interface CarouselEditorProps {
  carousel: Carousel;
  /** Every id in the page layout, so a new slide gets a free one. */
  takenIds: string[];
  edit: LayoutEdit;
  editAndSave: LayoutEdit;
  mediaPrefix: string;
  confirm: (question: string) => Promise<boolean>;
  beginUpload: () => void;
  endUpload: () => void;
}

export function CarouselEditor(props: CarouselEditorProps) {
  const { carousel, edit, editAndSave, confirm } = props;
  const count = carousel.slides.length;
  return (
    <div className={styles.stack} data-testid="carousel-editor">
      <ol className={styles.list} aria-label="Slides">
        {carousel.slides.map((slide, i) => {
          const name = `slide ${i + 1}`;
          const change = (save: boolean, f: Parameters<typeof mapSlide>[3], key?: string) =>
            (save ? editAndSave : edit)((items) => mapSlide(items, carousel.id, slide.id, f), key);
          return (
            <li key={slide.id} className={styles.card} data-testid="slide">
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Slide {i + 1}</span>
                <span className={styles.row}>
                  <OrderButtons name={name} index={i} count={count} onMove={(d) => edit((items) => moveSlide(items, carousel.id, i, d))} />
                  <button
                    type="button"
                    className={`${styles.button} ${styles.small} ${styles.danger}`}
                    onClick={async () => {
                      const filled = slide.image !== undefined || slide.text.trim() !== "";
                      if (!filled || (await confirm(`Remove ${name}?`))) edit((items) => removeSlide(items, carousel.id, slide.id));
                    }}
                  >
                    Remove slide
                  </button>
                </span>
              </div>
              <MediaField
                label={`the image of ${name}`}
                kind="image"
                value={slide.image}
                mediaPrefix={props.mediaPrefix}
                confirm={confirm}
                beginUpload={props.beginUpload}
                endUpload={props.endUpload}
                onUploaded={(image) => change(true, (s) => ({ ...s, image: withCurrentAlt(image, s.image) }))}
                onRemove={() => change(true, (s) => omit(s, "image"))}
              />
              <AltTextField
                label={`Alt text of ${name} (what the image shows, for screen readers)`}
                media={slide.image}
                onChange={(alt) => change(false, (s) => (s.image ? { ...s, image: { ...s.image, alt } } : s), `slide:${slide.id}:alt`)}
              />
              <label className={styles.field}>
                <span>Description of {name} (a blank line starts a new paragraph)</span>
                <textarea
                  className={styles.textarea}
                  value={slide.text}
                  onChange={(e) => {
                    const text = e.target.value;
                    change(false, (s) => ({ ...s, text }), `slide:${slide.id}:text`);
                  }}
                />
              </label>
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          className={`${styles.button} ${styles.small}`}
          onClick={() => edit((items) => addSlide(items, carousel.id, props.takenIds))}
        >
          Add slide
        </button>
      </div>
    </div>
  );
}
