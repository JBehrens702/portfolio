import type { Site } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { resumeLink } from "./links";
import { MediaImage } from "./MediaImage";
import styles from "./Site.module.css";

/**
 * The top of the home page: heading, photo, and the resume button. The heading
 * is the owner's tagline when one exists (the Google Site heading "Hi, I'm
 * Jonathan Behrens"), else the owner's name. Pass a site from visibleSite().
 */
export function Hero({ site }: { site: Site }) {
  const { profile } = site;
  const resume = resumeLink(site);
  const heading = isBlank(profile.tagline) ? profile.name : profile.tagline;
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroText}>
          <h1 id="hero-heading" className={styles.heroName}>
            {heading}
          </h1>
          {resume && (
            <a href={resume.href} className={styles.button} data-resume="">
              {resume.label}
            </a>
          )}
        </div>
        {profile.heroPhoto && (
          <MediaImage
            media={profile.heroPhoto}
            sizes="(min-width: 800px) 40vw, 100vw"
            className={styles.heroPhoto}
            eager
          />
        )}
      </div>
    </section>
  );
}

export default Hero;
