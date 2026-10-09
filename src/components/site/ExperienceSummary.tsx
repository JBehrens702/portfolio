import Link from "next/link";
import type { Experience } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { experienceHref } from "./links";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import styles from "./Site.module.css";

export interface ExperienceSummaryProps {
  experience: Experience;
  linkBase: string;
  /** The approved "Read more" label; the link is hidden without it (0.1.8). */
  readMore: string | null;
}

/** One home page block: key image, title, skills, first paragraph, and a link to the full page (0.1.1). */
export function ExperienceSummary({ experience, linkBase, readMore }: ExperienceSummaryProps) {
  const titleId = `work-${experience.slug}`;
  return (
    <article className={styles.summary}>
      {experience.cardImage && (
        <MediaImage
          media={experience.cardImage}
          sizes="(min-width: 800px) 40vw, 100vw"
          className={styles.summaryImage}
        />
      )}
      <div className={styles.summaryBody}>
        <h3 id={titleId}>{experience.homeTitle}</h3>
        {experience.skills.length > 0 && (
          <ul role="list" className={styles.skills}>
            {experience.skills.map((skill, i) => (
              <li key={`${i}-${skill}`}>{skill}</li>
            ))}
          </ul>
        )}
        {!isBlank(experience.homeText) && (
          <Markdown text={experience.homeText} className={styles.prose} linkBase={linkBase} />
        )}
        {readMore && (
          <Link
            href={experienceHref(linkBase, experience.slug)}
            className={styles.textLink}
            aria-describedby={titleId}
          >
            {readMore}
          </Link>
        )}
      </div>
    </article>
  );
}

export default ExperienceSummary;
