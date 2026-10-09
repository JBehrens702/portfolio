import Link from "next/link";
import type { Experience } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { ArrowIcon } from "./icons";
import { experienceHref } from "./links";
import { refMark } from "./markings";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import { Readout } from "./Readout";
import styles from "./Site.module.css";

export interface ExperienceSummaryProps {
  experience: Experience;
  linkBase: string;
  /** The approved "Read more" label; the link is hidden without it (0.1.1, 0.1.8). */
  readMore: string | null;
  /** The first experience: a full-width purple card, the highest emphasis on the page. */
  featured?: boolean;
  /** The position of the card and the number of cards, for the reference number. */
  index: number;
  count: number;
}

/**
 * One home page card: key image, title, skills, first paragraph, and a link to
 * the full page (0.1.1). A charcoal card with cut corners; the featured card is
 * purple and spans the full width. The orange corner marks and the scan line
 * over the image are aria-hidden graphics without text; the reference number
 * ("REF 01/05", from the order and the count) is an aria-hidden marking.
 */
export function ExperienceSummary({ experience, linkBase, readMore, featured, index, count }: ExperienceSummaryProps) {
  const titleId = `work-${experience.slug}`;
  const classes = [styles.summary, featured ? styles.featured : "", experience.cardImage ? "" : styles.noMedia].join(" ");
  return (
    <article className={classes} data-reveal="">
      {experience.cardImage && (
        <div className={styles.summaryMedia}>
          <div className={styles.summaryFrame} data-reveal="wipe">
            <MediaImage
              media={experience.cardImage}
              sizes={featured ? "(min-width: 900px) 40rem, 100vw" : "(min-width: 900px) 38rem, 100vw"}
              className={styles.summaryImage}
            />
            <span className={styles.scan} aria-hidden="true" />
          </div>
          <span className="corner-marks" aria-hidden="true" />
        </div>
      )}
      <div className={styles.summaryBody}>
        <Readout text={refMark(index, count)} className={styles.cardRef} />
        <h3 id={titleId} className={styles.summaryTitle}>
          {experience.homeTitle}
        </h3>
        {experience.skills.length > 0 && (
          <ul role="list" className={styles.skills}>
            {experience.skills.map((skill, i) => (
              <li key={`${i}-${skill}`}>{skill}</li>
            ))}
          </ul>
        )}
        {!isBlank(experience.homeText) && (
          <Markdown text={experience.homeText} className={styles.summaryText} linkBase={linkBase} />
        )}
        {readMore && (
          <Link
            href={experienceHref(linkBase, experience.slug)}
            className={featured ? styles.buttonLight : styles.arrowLink}
            aria-describedby={titleId}
          >
            {readMore}
            <ArrowIcon className={styles.arrow} />
          </Link>
        )}
      </div>
    </article>
  );
}

export default ExperienceSummary;
