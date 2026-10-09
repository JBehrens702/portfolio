import type { ReactNode } from "react";
import type { Experience, Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import { Aperture } from "./Aperture";
import { ContactLinks } from "./ContactLinks";
import { ExperiencePage } from "./ExperiencePage";
import { ExperienceSummary } from "./ExperienceSummary";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { ArrowIcon } from "./icons";
import { homeHref, navLinks, resumeLink, SECTION_IDS } from "./links";
import { Markdown } from "./Markdown";
import { MotionObserver } from "./MotionObserver";
import { SkillsMarquee } from "./SkillsMarquee";
import { SoftwareCard } from "./SoftwareCard";
import styles from "./Site.module.css";

// The page views. Each takes a site that has passed through visibleSite() and a
// link base: "/" for the public pages, "/preview" for the owner's preview (U5).
// Every visible UI text comes from site.labels; a missing label hides its element.

export interface ViewProps {
  site: Site;
  linkBase: string;
}

/** Header, page content, and the contact footer. */
export function SiteChrome({ site, linkBase, onHome, children }: ViewProps & { onHome: boolean; children: ReactNode }) {
  return (
    <>
      <Header
        logoAlt={labelText(site, "logoAlt") ?? site.profile.name}
        menuLabel={labelText(site, "menu") ?? ""}
        links={navLinks(site, linkBase, onHome)}
        resume={resumeLink(site)}
      />
      {children}
      <ContactLinks site={site} />
      <MotionObserver />
    </>
  );
}

/**
 * An orange section heading after design A: a small square with a cut corner,
 * the heading, and a rule with tick marks that fades out to the right. The
 * square and the rule are aria-hidden graphics without text. Hidden without its label.
 */
function SectionHeading({ id, text }: { id: string; text: string | null }) {
  return text ? (
    <div className={styles.sectionHead} data-reveal="">
      <span className={styles.sectionMark} aria-hidden="true" />
      <h2 id={id} className={styles.sectionHeading}>
        {text}
      </h2>
      <span className={styles.sectionRule} aria-hidden="true" />
    </div>
  ) : null;
}

/**
 * The home page in the order of sketch A: hero, skills, the work grid (the first
 * experience as a full-width purple card, the others in pairs), software, intro.
 */
export function HomeView({ site, linkBase }: ViewProps) {
  const workHeading = labelText(site, "selectedWork");
  const softwareHeading = labelText(site, "softwareHeading");
  const aboutHeading = labelText(site, "aboutHeading");
  const readMore = labelText(site, "readMore");
  const intro = site.profile.introParagraphs;

  return (
    <SiteChrome site={site} linkBase={linkBase} onHome>
      <main id="main">
        <Hero site={site} linkBase={linkBase} />
        <SkillsMarquee experiences={site.experiences} />

        {site.experiences.length > 0 && (
          <section
            id={SECTION_IDS.work}
            className={styles.section}
            aria-labelledby={workHeading ? "work-heading" : undefined}
          >
            <div className="container">
              <SectionHeading id="work-heading" text={workHeading} />
              <div className={styles.summaries}>
                {site.experiences.map((experience, i) => (
                  <ExperienceSummary
                    key={experience.slug}
                    experience={experience}
                    linkBase={linkBase}
                    readMore={readMore}
                    featured={i === 0}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {site.software.length > 0 && (
          <section
            id="software"
            className={styles.section}
            aria-labelledby={softwareHeading ? "software-heading" : undefined}
          >
            <div className="container">
              <SectionHeading id="software-heading" text={softwareHeading} />
              <div className={styles.cards}>
                {site.software.map((card, i) => (
                  <SoftwareCard key={card.id} card={card} linkBase={linkBase} index={i} />
                ))}
              </div>
            </div>
          </section>
        )}

        {intro.length > 0 && (
          <section
            id={SECTION_IDS.about}
            className={styles.section}
            aria-labelledby={aboutHeading ? "about-heading" : undefined}
          >
            <div className="container">
              <SectionHeading id="about-heading" text={aboutHeading} />
              <div className={styles.about} data-reveal="">
                <div className={styles.aboutAside} aria-hidden="true">
                  <div className={styles.aboutMarkTurn}>
                    <Aperture id="about-aperture" className={styles.aboutMark} />
                  </div>
                  <span className="corner-marks" />
                </div>
                <div className={styles.aboutText}>
                  {intro.map((paragraph, i) => (
                    <Markdown
                      key={i}
                      text={paragraph}
                      className={i === 0 ? `${styles.prose} ${styles.lead}` : styles.prose}
                      linkBase={linkBase}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </SiteChrome>
  );
}

/** One full experience page. */
export function ExperienceView({ site, linkBase, experience }: ViewProps & { experience: Experience }) {
  return (
    <SiteChrome site={site} linkBase={linkBase} onHome={false}>
      <main id="main">
        <ExperiencePage site={site} experience={experience} linkBase={linkBase} />
      </main>
    </SiteChrome>
  );
}

/** The 404 page, with the site header and footer. */
export function NotFoundView({ site, linkBase }: ViewProps) {
  const heading = labelText(site, "notFoundTitle");
  const backHome = labelText(site, "backHome");
  return (
    <SiteChrome site={site} linkBase={linkBase} onHome={false}>
      <main id="main" className={`container ${styles.notFound}`}>
        <div className={styles.notFoundPanel}>
          <div className={styles.notFoundMarkTurn} aria-hidden="true">
            <Aperture id="not-found-aperture" tone="ghost" className={styles.notFoundMark} />
          </div>
          <span className={`corner-marks ${styles.panelTicks}`} aria-hidden="true" />
          <div className={styles.notFoundBody}>
            {heading && <h1 className={styles.notFoundTitle}>{heading}</h1>}
            {backHome && (
              <p>
                <a href={homeHref(linkBase)} className={styles.buttonPrimary}>
                  {backHome}
                  <ArrowIcon className={styles.arrow} />
                </a>
              </p>
            )}
          </div>
          <span className="hazard" aria-hidden="true" />
        </div>
      </main>
    </SiteChrome>
  );
}

/** Shown when no content is published or configured: the site title only (KTD12). */
export function EmptySiteView({ title }: { title: string }) {
  return (
    <main id="main" className={`container ${styles.notFound}`}>
      <div className={styles.notFoundPanel}>
        <div className={styles.notFoundMarkTurn} aria-hidden="true">
          <Aperture id="empty-aperture" tone="ghost" className={styles.notFoundMark} />
        </div>
        <span className={`corner-marks ${styles.panelTicks}`} aria-hidden="true" />
        <div className={styles.notFoundBody}>
          <h1 className={styles.notFoundTitle}>{title}</h1>
        </div>
        <span className="hazard" aria-hidden="true" />
      </div>
    </main>
  );
}
