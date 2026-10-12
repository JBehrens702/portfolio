"use client";

import { useCallback } from "react";
import { saveProfile, type ProfileInput } from "@/app/admin/actions";
import type { Stamps } from "@/lib/content/parts";
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

/**
 * The profile editor's state and its save, shared by the Profile page and the
 * home editor (KTD12). `stamps` holds the stamp of the part `profile` (KTD1).
 */
export function useProfileEditor(site: Site, mediaPrefix: string, stamps: Stamps) {
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
  const persist = useCallback((state: ProfileState, base: Stamps) => saveProfile(toInput(state), base), []);
  const editor = useDraftEditor(initial, persist, { stamps });
  const { value, update } = editor;
  const { confirm, dialog } = useConfirm();

  const text = (key: "name" | "tagline" | "intro" | "linkedin" | "email" | "rise") => ({
    value: value[key],
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      update((s) => ({ ...s, [key]: v }), `field:${key}`);
    },
  });
  /** A file change, applied to the latest state and saved at once. */
  const setFile = (key: "heroPhoto" | "resumeFile", file: (current: Media | undefined) => Media | undefined) => {
    update((s) => ({ ...s, [key]: file(s[key]) }));
    void editor.save();
  };
  return { editor, value, update, text, setFile, confirm, dialog, mediaPrefix };
}

export type ProfileEditorState = ReturnType<typeof useProfileEditor>;

export function NameFields({ profile }: { profile: ProfileEditorState }) {
  return (
    <>
      <label className={styles.field}>
        <span>Name</span>
        <input className={styles.input} name="name" {...profile.text("name")} />
      </label>
      <label className={styles.field}>
        <span>Heading (tagline)</span>
        <input className={styles.input} name="tagline" {...profile.text("tagline")} />
      </label>
    </>
  );
}

export function IntroField({ profile }: { profile: ProfileEditorState }) {
  return (
    <label className={styles.field}>
      <span>Intro (a blank line starts a new paragraph; links: [text](https://...))</span>
      <textarea className={styles.textarea} name="intro" {...profile.text("intro")} />
    </label>
  );
}

export function PhotoAndResumeFields({ profile }: { profile: ProfileEditorState }) {
  const { editor, value, update, setFile, confirm, mediaPrefix } = profile;
  return (
    <>
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
        onChange={(alt) => update((s) => (s.heroPhoto ? { ...s, heroPhoto: { ...s.heroPhoto, alt } } : s), "field:photoAlt")}
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
    </>
  );
}

export function ContactFields({ profile }: { profile: ProfileEditorState }) {
  return (
    <>
      <label className={styles.field}>
        <span>LinkedIn address (https://...)</span>
        <input className={styles.input} name="linkedin" inputMode="url" {...profile.text("linkedin")} />
      </label>
      <label className={styles.field}>
        <span>Email</span>
        <input className={styles.input} name="email" inputMode="email" {...profile.text("email")} />
      </label>
      <label className={styles.field}>
        <span>Rise profile address (https://...)</span>
        <input className={styles.input} name="rise" inputMode="url" {...profile.text("rise")} />
      </label>
    </>
  );
}

export function ProfileEditor({ site, mediaPrefix, stamps }: { site: Site; mediaPrefix: string; stamps: Stamps }) {
  const profile = useProfileEditor(site, mediaPrefix, stamps);
  return (
    <div className={styles.stack}>
      <section className={styles.card} aria-labelledby="profile">
        <h2 id="profile" className={styles.cardTitle}>
          Profile
        </h2>
        <NameFields profile={profile} />
        <IntroField profile={profile} />
        <PhotoAndResumeFields profile={profile} />
      </section>

      <section className={styles.card} aria-labelledby="contact">
        <h2 id="contact" className={styles.cardTitle}>
          Contact links
        </h2>
        <ContactFields profile={profile} />
      </section>

      <SaveBar editor={profile.editor} />
      {profile.dialog}
    </div>
  );
}
