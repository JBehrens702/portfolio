import Link from "next/link";
import type { CSSProperties } from "react";
import type { Experience, Site } from "@/lib/content/schema";
import { nextExperience } from "@/lib/content/order";
import { labelText } from "@/lib/content/visibility";
import { Aperture } from "./Aperture";
import { Block } from "./Block";
import { ArrowIcon } from "./icons";
import { experienceHref } from "./links";
import { refMark, sectionMark } from "./markings";
import { MediaImage } from "./MediaImage";
import { Readout } from "./Readout";
import { segmentBlocks, type BodyItem } from "./segments";
import styles from "./Experience.module.css";

export interface ExperiencePageProps {
  /** A site from visibleSite(). */
  site: Site;
  experience: Experience;
  linkBase: string;
}

function Item({ item, linkBase, downloadLabel }: { item: BodyItem; linkBase: string; downloadLabel: string | null }) {
  if (item.kind === "block") return <Block block={item.block} linkBase={linkBase} downloadLabel={downloadLabel} />;
  return (
    <div className={item.media ? styles.spread : styles.spreadAlone}>
      {item.media && (
        <div className={styles.spreadMedia}>
          <Block block={item.media} linkBase={linkBase} downloadLabel={downloadLabel} variant="spread" />
        </div>
      )}
      <div className={styles.panel} data-reveal="">
        {item.aside.map((block) => (
          <Block key={block.id} block={block} linkBase={linkBase} downloadLabel={downloadLabel} variant="logo" />
        ))}
      </div>
    </div>
  );
}

/**
 * The full page of one experience (design A): a purple title band with cut
 * corners, white crop marks, and an orange hazard stripe; the owner's blocks in
 * segments, then the next-experience link (0.1.2, 0.1.10). On wide screens each
 * heading sits in a sticky column beside its blocks; a fact list sits in
 * a light panel beside the image before it. The block order never changes.
 * Decorative markings (aria-hidden, see markings.ts): the reference number in
 * the band ("REF 03/05", from the order of the experiences) and a section
 * number beside each level-2 heading ("N°01", from the order of the sections).
 */
export function ExperiencePage({ site, experience, linkBase }: ExperiencePageProps) {
  const next = nextExperience(site, experience.slug);
  const nextLabel = labelText(site, "nextExperience");
  const downloadLabel = labelText(site, "downloadFile");
  const segments = segmentBlocks(experience.blocks);
  const index = site.experiences.findIndex((e) => e.slug === experience.slug);
  // The section number of each segment that starts with a level-2 heading, else null.
  let sections = 0;
  const sectionNumbers = segments.map((segment) => (segment.headings[0]?.level === 2 ? sections++ : null));
  return (
    <article className={styles.page}>
      <header className={`container ${styles.band}`}>
        <div className={styles.bandPanel}>
          <div className={styles.bandBackdrop} aria-hidden="true">
            <span className={styles.bandGrid} />
            <span className={styles.bandMarkTurn}>
              <Aperture id={`band-${experience.slug}`} tone="ghost" className={styles.bandMark} />
            </span>
          </div>
          <span className={`corner-marks ${styles.bandTicks}`} aria-hidden="true" />
          <div className={styles.bandInner}>
            <h1 className={styles.title}>{experience.pageTitle}</h1>
            {experience.subtitle && <p className={styles.subtitle}>{experience.subtitle}</p>}
            {experience.skills.length > 0 && (
              <ul role="list" className={styles.bandSkills}>
                {experience.skills.map((skill, i) => (
                  <li key={`${i}-${skill}`} style={{ "--i": i } as CSSProperties}>
                    {skill}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {index >= 0 && <Readout text={refMark(index, site.experiences.length)} className={styles.bandRef} />}
          <span className="hazard" aria-hidden="true" />
        </div>
      </header>

      <div className={`container ${styles.body}`}>
        {segments.map((segment, s) => (
          <div
            key={segment.headings[0]?.id ?? `lead-${s}`}
            className={segment.headings[0]?.level === 3 ? `${styles.segment} ${styles.subsegment}` : styles.segment}
          >
            {segment.headings.length > 0 && (
              <div className={styles.rail}>
                <div className={styles.railSticky} data-reveal="">
                  {sectionNumbers[s] !== null && (
                    <Readout text={sectionMark(sectionNumbers[s])} className={styles.railNo} />
                  )}
                  {segment.headings.map((heading) => (
                    <Block key={heading.id} block={heading} linkBase={linkBase} downloadLabel={downloadLabel} />
                  ))}
                </div>
              </div>
            )}
            <div className={styles.main}>
              {segment.items.map((item, i) => (
                <Item
                  key={item.kind === "block" ? item.block.id : `spread-${item.aside[0].id}-${i}`}
                  item={item}
                  linkBase={linkBase}
                  downloadLabel={downloadLabel}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {next && nextLabel && (
        <nav className={`container ${styles.next}`} aria-label={nextLabel}>
          <Link href={experienceHref(linkBase, next.slug)} className={styles.nextLink} data-reveal="">
            <span className="corner-marks" aria-hidden="true" />
            {next.cardImage && (
              <span className={styles.nextThumb}>
                <MediaImage media={next.cardImage} sizes="10rem" className={styles.nextImage} decorative />
              </span>
            )}
            <span className={styles.nextText}>
              <span className={styles.nextLabel}>{nextLabel}</span>{" "}
              <span className={styles.nextTitle}>{next.homeTitle}</span>
            </span>
            <span className={styles.nextGo} aria-hidden="true">
              <ArrowIcon className={styles.nextArrow} />
            </span>
          </Link>
        </nav>
      )}
    </article>
  );
}

export default ExperiencePage;
