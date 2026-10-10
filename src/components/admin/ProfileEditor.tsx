"use client";

import { useCallback } from "react";
import { saveProfile, type ProfileInput } from "@/app/admin/actions";
import type { Media, Site } from "@/lib/content/schema";
import { AltTextField } from "./AltTextField";
import { useConfirm } from "./ConfirmDialog";
import { MediaField } from "./MediaField";
import { withCurrentAlt } from "./media-merge";
import { SaveBar } from "./SaveBar";
import { useDraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The profile and contact editor (2.4.2, 2.4.3): name, tagline, intro, hero
// photo with its alt text, resume file, and the contact links.

interface ProfileState {
  name: string;
  tagline: string;
  /** The intro paragraphs as one text: a blank line starts a new paragraph. */
  intro: string;
  heroPhoto?: Media;
  resumeFile?: Media;
  linkedin: string;
  email: string;
  rise: string;
}

function toInput(state: ProfileState): ProfileInput {
  return {
    name: state.name,
    tagline: state.tagline,
    introParagraphs: state.intro
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p !== ""),
    heroPhoto: state.heroPhoto,
    resumeFile: state.resumeFile,
    contact: { linkedin: state.linkedin.trim(), email: state.email.trim(), rise: state.rise.trim() },
  };
}

export function ProfileEditor({ site, mediaPrefix }: { site: Site; mediaPrefix: string }) {
  const initial: ProfileState = {
    name: site.profile.name,
    tagline: site.profile.tagline,
    intro: site.profile.introParagraphs.join("\n\n"),
    heroPhoto: site.profile.heroPhoto,
    resumeFile: site.profile.resumeFile,
    linkedin: site.contact.linkedin ?? "",
    email: site.contact.email ?? "",
    rise: site.contact.rise ?? "",
  };
  const persist = useCallback((state: ProfileState) => saveProfile(toInput(state)), []);
  const editor = useDraftEditor(initial, persist);
  const { value, update } = editor;
  const { confirm, dialog } = useConfirm();

  const text = (key: "name" | "tagline" | "intro" | "linkedin" | "email" | "rise") => ({
    value: value[key],
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      update((s) => ({ ...s, [key]: v }));
    },
  });
  /** A file change, applied to the latest state and saved at once. */
  const setFile = (key: "heroPhoto" | "resumeFile", file: (current: Media | undefined) => Media | undefined) => {
    update((s) => ({ ...s, [key]: file(s[key]) }));
    void editor.save();
  };

  return (
    <div className={styles.stack}>
      <section className={styles.card} aria-labelledby="profile">
        <h2 id="profile" className={styles.cardTitle}>
          Profile
        </h2>
        <label className={styles.field}>
          <span>Name</span>
          <input className={styles.input} name="name" {...text("name")} />
        </label>
        <label className={styles.field}>
          <span>Heading (tagline)</span>
          <input className={styles.input} name="tagline" {...text("tagline")} />
        </label>
        <label className={styles.field}>
          <span>Intro (a blank line starts a new paragraph; links: [text](https://...))</span>
          <textarea className={styles.textarea} name="intro" {...text("intro")} />
        </label>
        <MediaField
          label="the photo"
          kind="image"
          value={value.heroPhoto}
          mediaPrefix={mediaPrefix}
          confirm={confirm}
          beginUpload={editor.beginUpload}
          endUpload={editor.endUpload}
          onUploaded={(media) => setFile("heroPhoto", (current) => withCurrentAlt(media, current))}
          onRemove={() => setFile("heroPhoto", () => undefined)}
        />
        <AltTextField
          label="Photo alt text (what the photo shows, for screen readers)"
          media={value.heroPhoto}
          onChange={(alt) => update((s) => (s.heroPhoto ? { ...s, heroPhoto: { ...s.heroPhoto, alt } } : s))}
        />
        <MediaField
          label="the resume"
          kind="file"
          value={value.resumeFile}
          mediaPrefix={mediaPrefix}
          confirm={confirm}
          beginUpload={editor.beginUpload}
          endUpload={editor.endUpload}
          onUploaded={(media) => setFile("resumeFile", (current) => withCurrentAlt(media, current))}
          onRemove={() => setFile("resumeFile", () => undefined)}
        />
      </section>

      <section className={styles.card} aria-labelledby="contact">
        <h2 id="contact" className={styles.cardTitle}>
          Contact links
        </h2>
        <label className={styles.field}>
          <span>LinkedIn address (https://...)</span>
          <input className={styles.input} name="linkedin" inputMode="url" {...text("linkedin")} />
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input className={styles.input} name="email" inputMode="email" {...text("email")} />
        </label>
        <label className={styles.field}>
          <span>Rise profile address (https://...)</span>
          <input className={styles.input} name="rise" inputMode="url" {...text("rise")} />
        </label>
      </section>

      <SaveBar editor={editor} />
      {dialog}
    </div>
  );
}
