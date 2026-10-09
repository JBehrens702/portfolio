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
import { sectionMark, type Sheet } from "./markings";
import { MotionObserver } from "./MotionObserver";
import { Readout, RulerNumbers, SheetZones } from "./Readout";
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

/** Header, page content, the contact footer, and the zone indices of the sheet border. */
export function SiteChrome({
  site,
  linkBase,
  onHome,
  sheet,
  children,
}: ViewProps & { onHome: boolean; sheet?: Sheet; children: ReactNode }) {
  return (
    <>
      <Header
        logoAlt={labelText(site, "logoAlt") ?? site.profile.name}
        menuLabel={labelText(site, "menu") ?? ""}
        links={navLinks(site, linkBase, onHome)}
        resume={resumeLink(site)}
      />
      <SheetZones />
      {children}
      <ContactLinks site={site} sheet={sheet} />
      <MotionObserver />
    </>
  );
}

/**
 * An orange section heading after design A: a small square with a cut corner,
 * the heading, and a rule with tick marks that fades out to the right. The
 * square and the rule are aria-hidden graphics; their only text is the section
 * number ("N°01", from the order of the headings) and the ruler numbers (see
 * markings.ts). Hidden without its label.
 */
function SectionHeading({ id, text, index }: { id: string; text: string | null; index: number }) {
  return text ? (
    <div className={styles.sectionHead} data-reveal="">
      <Readout text={sectionMark(index)} className={styles.sectionNo} />
      <span className={styles.sectionMark} aria-hidden="true" />
      <h2 id={id} className={styles.sectionHeading}>
        {text}
      </h2>
      <span className={styles.sectionRule} aria-hidden="true">
        <RulerNumbers className={styles.rulerNo} />
      </span>
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
  // Section numbers follow the headings that show, in page order.
  const shown = [
    site.experiences.length > 0 && workHeading,
    site.software.length > 0 && softwareHeading,
    intro.length > 0 && aboutHeading,
  ];
  const sectionIndex = (i: number) => shown.slice(0, i).filter(Boolean).length;

  return (
    <SiteChrome site={site} linkBase={linkBase} onHome sheet={{ index: 0, count: site.experiences.length + 1 }}>
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
              <SectionHeading id="work-heading" text={workHeading} index={sectionIndex(0)} />
              <div className={styles.summaries}>
                {site.experiences.map((experience, i) => (
                  <ExperienceSummary
                    key={experience.slug}
                    experience={experience}
                    linkBase={linkBase}
                    readMore={readMore}
                    featured={i === 0}
                    index={i}
                    count={site.experiences.length}
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
              <SectionHeading id="software-heading" text={softwareHeading} index={sectionIndex(1)} />
              <div className={styles.cards}>
                {site.software.map((card, i) => (
                  <SoftwareCard
                    key={card.id}
                    card={card}
                    linkBase={linkBase}
                    index={i}
                    count={site.software.length}
                  />
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
              <SectionHeading id="about-heading" text={aboutHeading} index={sectionIndex(2)} />
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
  const index = site.experiences.findIndex((e) => e.slug === experience.slug);
  const sheet = index >= 0 ? { index: index + 1, count: site.experiences.length + 1 } : undefined;
  return (
    <SiteChrome site={site} linkBase={linkBase} onHome={false} sheet={sheet}>
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
