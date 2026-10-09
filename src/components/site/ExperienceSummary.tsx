import Link from "next/link";
import type { Experience } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { ArrowIcon } from "./icons";
import { experienceHref } from "./links";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import styles from "./Site.module.css";

export interface ExperienceSummaryProps {
  experience: Experience;
  linkBase: string;
  /** The approved "Read more" label; the link is hidden without it (0.1.1, 0.1.8). */
  readMore: string | null;
  /** The first experience: a purple panel, the highest emphasis on the page. */
  featured?: boolean;
  /** Image on the right instead of the left, for the zig-zag rows. */
  reverse?: boolean;
}

/** One home page block: key image, title, skills, first paragraph, and a link to the full page (0.1.1). */
export function ExperienceSummary({ experience, linkBase, readMore, featured, reverse }: ExperienceSummaryProps) {
  const titleId = `work-${experience.slug}`;
  const classes = [styles.summary, featured ? styles.featured : "", reverse ? styles.reverse : ""].join(" ");
  return (
    <article className={classes} data-reveal="">
      {experience.cardImage && (
        <div className={styles.summaryMedia}>
          <span className={styles.summaryShape} aria-hidden="true" />
          <div className={styles.summaryFrame} data-reveal="iris">
            <MediaImage
              media={experience.cardImage}
              sizes="(min-width: 1024px) 34rem, (min-width: 640px) 80vw, 100vw"
              className={styles.summaryImage}
            />
          </div>
        </div>
      )}
      <div className={styles.summaryBody}>
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
