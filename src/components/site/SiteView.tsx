import type { ReactNode } from "react";
import type { Experience, Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import { ContactLinks } from "./ContactLinks";
import { ExperiencePage } from "./ExperiencePage";
import { ExperienceSummary } from "./ExperienceSummary";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { homeHref, navLinks, resumeLink, SECTION_IDS } from "./links";
import { Markdown } from "./Markdown";
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
    </>
  );
}

function SectionHeading({ id, text }: { id: string; text: string | null }) {
  return text ? (
    <h2 id={id} className={styles.sectionHeading}>
      {text}
    </h2>
  ) : null;
}

/** The home page in the order of the approved sketch: hero, experiences, software, intro. */
export function HomeView({ site, linkBase }: ViewProps) {
  const workHeading = labelText(site, "selectedWork");
  const softwareHeading = labelText(site, "softwareHeading");
  const aboutHeading = labelText(site, "aboutHeading");
  const readMore = labelText(site, "readMore");
  const intro = site.profile.introParagraphs;

  return (
    <SiteChrome site={site} linkBase={linkBase} onHome>
      <main id="main">
        <Hero site={site} />

        {site.experiences.length > 0 && (
          <section
            id={SECTION_IDS.work}
            className={styles.section}
            aria-labelledby={workHeading ? "work-heading" : undefined}
          >
            <div className="container">
              <SectionHeading id="work-heading" text={workHeading} />
              <div className={styles.summaries}>
                {site.experiences.map((experience) => (
                  <ExperienceSummary
                    key={experience.slug}
                    experience={experience}
                    linkBase={linkBase}
                    readMore={readMore}
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
                {site.software.map((card) => (
                  <SoftwareCard key={card.id} card={card} linkBase={linkBase} />
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
              <div className={styles.about}>
                <SectionHeading id="about-heading" text={aboutHeading} />
                {intro.map((paragraph, i) => (
                  <Markdown key={i} text={paragraph} className={styles.prose} linkBase={linkBase} />
                ))}
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
        {heading && <h1>{heading}</h1>}
        {backHome && (
          <p>
            <a href={homeHref(linkBase)} className={styles.textLink}>
              {backHome}
            </a>
          </p>
        )}
      </main>
    </SiteChrome>
  );
}

/** Shown when no content is published or configured: the site title only (KTD12). */
export function EmptySiteView({ title }: { title: string }) {
  return (
    <main id="main" className={`container ${styles.notFound}`}>
      <h1>{title}</h1>
    </main>
  );
}
