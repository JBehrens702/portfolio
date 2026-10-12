"use client";

import { useCallback, type ReactNode } from "react";
import { saveExperienceCard, type ExperienceCardInput } from "@/app/admin/actions";
import type { Experience, Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import siteStyles from "@/components/site/Site.module.css";
import { AltTextField } from "./AltTextField";
import { useConfirm } from "./ConfirmDialog";
import { MediaField } from "./MediaField";
import { withCurrentAlt } from "./media-merge";
import { omit } from "./omit";
import { ContactFields, IntroField, NameFields, PhotoAndResumeFields, useProfileEditor } from "./ProfileEditor";
import { SaveBar } from "./SaveBar";
import { SoftwareEditor } from "./SoftwareEditor";
import { useDraftEditor } from "./useDraftEditor";
import styles from "./admin.module.css";

// The home page editor in preview style (2.4.8, KTD12): the home sections in
// their real order, under their real section headings, with each section's
// fields in its place. The order stays fixed. The profile fields save together
// (they are one save on the Profile page too), each experience card saves on its
// own, and the software cards save as on the Software page.

/** A home section under the site's section heading; a missing label shows a plain admin name. */
function HomeSection({ heading, fallback, children }: { heading: string | null; fallback: string; children: ReactNode }) {
  return (
    <section className={styles.homeSection} aria-label={heading ?? fallback}>
      <div className={siteStyles.sectionHead}>
        <span className={siteStyles.sectionMark} aria-hidden="true" />
        <h2 className={siteStyles.sectionHeading}>{heading ?? fallback}</h2>
      </div>
      {children}
    </section>
  );
}

function cardInput(experience: Experience): ExperienceCardInput {
  return {
    homeTitle: experience.homeTitle,
    homeText: experience.homeText,
    skills: experience.skills,
    ...(experience.cardImage ? { cardImage: experience.cardImage } : {}),
  };
}

function CardEditor({ experience, mediaPrefix }: { experience: Experience; mediaPrefix: string }) {
  const slug = experience.slug;
  const persist = useCallback(
    (card: ExperienceCardInput) =>
      saveExperienceCard(slug, { ...card, skills: card.skills.map((s) => s.trim()).filter((s) => s !== "") }),
    [slug],
  );
  const editor = useDraftEditor(cardInput(experience), persist);
  const { value, update } = editor;
  const { confirm, dialog } = useConfirm();
  return (
    <article className={styles.card} data-testid="home-card" aria-label={value.homeTitle || slug}>
      <label className={styles.field}>
        <span>Title on the home page</span>
        <input className={styles.input} value={value.homeTitle} onChange={(e) => {
          const homeTitle = e.target.value;
          update((c) => ({ ...c, homeTitle }), "field:homeTitle");
        }} />
      </label>
      <MediaField
        label={`the card image of ${value.homeTitle || slug}`}
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
          update((c) => omit(c, "cardImage"));
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
        <textarea className={styles.textarea} value={value.skills.join("\n")} onChange={(e) => {
          const skills = e.target.value.split("\n");
          update((c) => ({ ...c, skills }), "field:skills");
        }} />
      </label>
      <label className={styles.field}>
        <span>First paragraph</span>
        <textarea className={styles.textarea} value={value.homeText} onChange={(e) => {
          const homeText = e.target.value;
          update((c) => ({ ...c, homeText }), "field:homeText");
        }} />
      </label>
      <p className={styles.muted}>
        <a href={`/admin/experiences/${encodeURIComponent(slug)}`}>Edit the full page</a>
      </p>
      <SaveBar editor={editor} />
      {dialog}
    </article>
  );
}

export function HomeEditor({ site, mediaPrefix }: { site: Site; mediaPrefix: string }) {
  const profile = useProfileEditor(site, mediaPrefix);
  return (
    <div className={styles.stack} data-testid="home-editor">
      <section className={styles.homeSection} aria-label="Top of the home page">
        <div className={`${styles.card} ${styles.homeHero}`}>
          <NameFields profile={profile} />
          <PhotoAndResumeFields profile={profile} />
          <p className={styles.muted}>The skills strip under the top of the page comes from the skills of the experiences.</p>
        </div>
      </section>

      <HomeSection heading={labelText(site, "selectedWork")} fallback="Selected Work">
        <div className={styles.homeCards}>
          {site.experiences.map((experience) => (
            <CardEditor key={experience.slug} experience={experience} mediaPrefix={mediaPrefix} />
          ))}
        </div>
      </HomeSection>

      <HomeSection heading={labelText(site, "softwareHeading")} fallback="Software">
        <SoftwareEditor initial={site.software} mediaPrefix={mediaPrefix} />
      </HomeSection>

      <HomeSection heading={labelText(site, "aboutHeading")} fallback="About">
        <div className={styles.card}>
          <IntroField profile={profile} />
        </div>
      </HomeSection>

      <HomeSection heading={labelText(site, "contactHeading")} fallback="Contact">
        <div className={styles.card}>
          <ContactFields profile={profile} />
        </div>
        <SaveBar editor={profile.editor} />
      </HomeSection>
      {profile.dialog}
    </div>
  );
}
