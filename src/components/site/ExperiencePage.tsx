import Link from "next/link";
import type { Experience, Site } from "@/lib/content/schema";
import { nextExperience } from "@/lib/content/order";
import { labelText } from "@/lib/content/visibility";
import { Block } from "./Block";
import { experienceHref } from "./links";
import styles from "./Experience.module.css";

export interface ExperiencePageProps {
  /** A site from visibleSite(). */
  site: Site;
  experience: Experience;
  linkBase: string;
}

/** The full page of one experience: title, subtitle, blocks, then the next-experience link (0.1.2, 0.1.10). */
export function ExperiencePage({ site, experience, linkBase }: ExperiencePageProps) {
  const next = nextExperience(site, experience.slug);
  const nextLabel = labelText(site, "nextExperience");
  const downloadLabel = labelText(site, "downloadFile");
  return (
    <article className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <h1 className={styles.title}>{experience.pageTitle}</h1>
        {experience.subtitle && <p className={styles.subtitle}>{experience.subtitle}</p>}
      </header>

      <div className={styles.blocks}>
        {experience.blocks.map((block) => (
          <Block key={block.id} block={block} linkBase={linkBase} downloadLabel={downloadLabel} />
        ))}
      </div>

      {next && nextLabel && (
        <nav className={styles.next} aria-label={nextLabel}>
          <Link href={experienceHref(linkBase, next.slug)} className={styles.nextLink}>
            <span className={styles.nextLabel}>{nextLabel}</span>{" "}
            <span className={styles.nextTitle}>{next.homeTitle}</span>
          </Link>
        </nav>
      )}
    </article>
  );
}

export default ExperiencePage;
