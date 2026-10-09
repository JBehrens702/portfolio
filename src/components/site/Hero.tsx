import type { CSSProperties } from "react";
import type { Site } from "@/lib/content/schema";
import { isBlank, labelText } from "@/lib/content/visibility";
import { Aperture } from "./Aperture";
import { CoordReadout, PointerReadout } from "./GridReadouts";
import { resumeLink, sectionHref, SECTION_IDS } from "./links";
import { MediaImage } from "./MediaImage";
import styles from "./Site.module.css";

/** The words of a text, each with its index, and the spaces between them kept as text. */
function words(text: string) {
  return text.split(/(\s+)/).filter((part) => part !== "");
}

/**
 * The top of the home page (design A): a purple panel with cut corners, the
 * heading, the buttons, and the photo in a hexagon with orange corner marks,
 * over a turning aperture ring. An orange hazard stripe runs along the lower
 * edge. The heading is the owner's tagline when one exists (the Google Site
 * heading "Hi, I'm Jonathan Behrens"), else the owner's name. Every decoration
 * is aria-hidden; the only text in a decoration is a grid coordinate (the
 * photo corners, the panel extent, and the live pointer; see markings.ts).
 * Pass a site from visibleSite().
 */
export function Hero({ site, linkBase = "/" }: { site: Site; linkBase?: string }) {
  const { profile } = site;
  const resume = resumeLink(site);
  const heading = isBlank(profile.tagline) ? profile.name : profile.tagline;
  // A second way down to the work, with the approved "Work" label of the header.
  const workLabel = site.experiences.length > 0 ? labelText(site, "navWork") : null;
  let wordIndex = 0;
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className="container">
        <div className={styles.heroPanel} data-grid-origin="">
          <span className={styles.heroGrid} aria-hidden="true" />
          <PointerReadout className={styles.heroPointer} crosshairClassName={styles.heroCrosshair} />
          <span className={`corner-marks ${styles.heroTicks}`} aria-hidden="true" />
          <CoordReadout corner="end" className={styles.heroExtent} />
          <div className={styles.heroLayout}>
            <div className={styles.heroText}>
              <h1 id="hero-heading" className={styles.heroName}>
                {words(heading).map((part, i) =>
                  /^\s+$/.test(part) ? (
                    part
                  ) : (
                    <span key={i} className={styles.heroWord} style={{ "--i": wordIndex++ } as CSSProperties}>
                      {part}
                    </span>
                  ),
                )}
              </h1>
              {(resume || workLabel) && (
                <div className={styles.heroActions}>
                  {resume && (
                    <a href={resume.href} className={styles.buttonPrimary} data-resume="">
                      {resume.label}
                      <svg className={styles.buttonIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M8 2v8m0 0 3.5-3.5M8 10 4.5 6.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
                      </svg>
                    </a>
                  )}
                  {workLabel && (
                    <a
                      href={sectionHref(linkBase, SECTION_IDS.work, true)}
                      className={resume ? styles.buttonGhost : styles.buttonPrimary}
                    >
                      {workLabel}
                      <svg className={styles.buttonIconDown} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M8 3v10m0 0 4-4m-4 4-4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
            </div>
            {profile.heroPhoto && (
              <div className={styles.heroVisual}>
                <div className={styles.heroRingTurn} aria-hidden="true">
                  <Aperture id="hero-aperture" tone="ghost" className={styles.heroRing} />
                </div>
                <div className={styles.heroHex}>
                  <MediaImage
                    media={profile.heroPhoto}
                    sizes="(min-width: 1024px) 24rem, 70vw"
                    className={styles.heroPhoto}
                    eager
                  />
                </div>
                <span className={`corner-marks ${styles.heroMarks}`} aria-hidden="true" />
                <CoordReadout corner="start" className={styles.photoStart} />
                <CoordReadout corner="end" className={styles.photoEnd} />
              </div>
            )}
          </div>
          <span className="hazard" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

export default Hero;
