"use client";

import { useCallback, type ReactNode } from "react";
import { saveExperienceCard, type ExperienceCardInput } from "@/app/admin/actions";
import type { Stamps } from "@/lib/content/parts";
import type { Experience, Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import siteStyles from "@/components/site/Site.module.css";
import { CardFields, trimSkills } from "./CardFields";
import { useConfirm } from "./ConfirmDialog";
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

function CardEditor({ experience, mediaPrefix, stamps }: { experience: Experience; mediaPrefix: string; stamps: Stamps }) {
  const slug = experience.slug;
  const persist = useCallback(
    (card: ExperienceCardInput, base: Stamps) => saveExperienceCard(slug, { ...card, skills: trimSkills(card.skills) }, base),
    [slug],
  );
  const editor = useDraftEditor(cardInput(experience), persist, { stamps });
  const { value } = editor;
  const { confirm, dialog } = useConfirm();
  return (
    <article className={styles.card} data-testid="home-card" aria-label={value.homeTitle || slug}>
      <CardFields editor={editor} imageLabel={`the card image of ${value.homeTitle || slug}`} mediaPrefix={mediaPrefix} confirm={confirm} />
      <p className={styles.muted}>
        <a href={`/admin/experiences/${encodeURIComponent(slug)}`}>Edit the full page</a>
      </p>
      <SaveBar editor={editor} />
      {dialog}
    </article>
  );
}

/** The stamps of the parts that the home editor edits, one set for each of its editors (KTD1). */
export interface HomeStamps {
  profile: Stamps;
  /** By experience slug: the stamp of that experience's card part. */
  cards: Record<string, Stamps>;
  software: Stamps;
}

export function HomeEditor({ site, mediaPrefix, stamps }: { site: Site; mediaPrefix: string; stamps: HomeStamps }) {
  const profile = useProfileEditor(site, mediaPrefix, stamps.profile);
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
            <CardEditor
              key={experience.slug}
              experience={experience}
              mediaPrefix={mediaPrefix}
              stamps={stamps.cards[experience.slug] ?? {}}
            />
          ))}
        </div>
      </HomeSection>

      <HomeSection heading={labelText(site, "softwareHeading")} fallback="Software">
        <SoftwareEditor initial={site.software} mediaPrefix={mediaPrefix} stamps={stamps.software} />
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
