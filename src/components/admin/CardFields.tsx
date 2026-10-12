"use client";

import type { ExperienceCardInput } from "@/app/admin/actions";
import { AltTextField } from "./AltTextField";
import { MediaField } from "./MediaField";
import { withCurrentAlt } from "./media-merge";
import { omit } from "./omit";
import type { DraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The fields of an experience's home-page card: the experience editor and the
// home editor (2.4.8) show the same fields. A card image upload or removal saves
// at once, as other files do; text waits for "Save draft".

/** The skills as the owner typed them: one per line, blank lines dropped on save. */
export function trimSkills(skills: string[]): string[] {
  return skills.map((s) => s.trim()).filter((s) => s !== "");
}

export interface CardFieldsProps<T extends ExperienceCardInput> {
  editor: DraftEditor<T>;
  /** Names the card image in the upload and remove texts, for example "the card image". */
  imageLabel: string;
  mediaPrefix: string;
  confirm: (question: string) => Promise<boolean>;
}

export function CardFields<T extends ExperienceCardInput>({ editor, imageLabel, mediaPrefix, confirm }: CardFieldsProps<T>) {
  const { value, update } = editor;
  return (
    <>
      <label className={styles.field}>
        <span>Title on the home page</span>
        <input
          className={styles.input}
          name="homeTitle"
          value={value.homeTitle}
          onChange={(e) => {
            const homeTitle = e.target.value;
            update((c) => ({ ...c, homeTitle }), "field:homeTitle");
          }}
        />
      </label>
      <MediaField
        label={imageLabel}
        kind="image"
        value={value.cardImage}
        mediaPrefix={mediaPrefix}
        confirm={confirm}
        beginUpload={editor.beginUpload}
        endUpload={editor.endUpload}
        onUploaded={(image) => {
          update((c) => ({ ...c, cardImage: withCurrentAlt(image, c.cardImage) }));
          void editor.save();
        }}
        onRemove={() => {
          // cardImage is optional in every card value, so the value without it is still a T.
          update((c) => omit(c, "cardImage") as T);
          void editor.save();
        }}
      />
      <AltTextField
        label="Card image alt text (what the image shows, for screen readers)"
        media={value.cardImage}
        onChange={(alt) => update((c) => (c.cardImage ? { ...c, cardImage: { ...c.cardImage, alt } } : c), "field:cardAlt")}
      />
      <label className={styles.field}>
        <span>Skills (one per line)</span>
        <textarea
          className={styles.textarea}
          name="skills"
          value={value.skills.join("\n")}
          onChange={(e) => {
            const skills = e.target.value.split("\n");
            update((c) => ({ ...c, skills }), "field:skills");
          }}
        />
      </label>
      <label className={styles.field}>
        <span>First paragraph (shown on the home page)</span>
        <textarea
          className={styles.textarea}
          name="homeText"
          value={value.homeText}
          onChange={(e) => {
            const homeText = e.target.value;
            update((c) => ({ ...c, homeText }), "field:homeText");
          }}
        />
      </label>
    </>
  );
}
