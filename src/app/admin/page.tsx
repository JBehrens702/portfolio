import { DraftProblem } from "@/components/admin/DraftProblem";
import { PublishPanel } from "@/components/admin/PublishPanel";
import { SiteMap, type OutsideLine } from "@/components/admin/SiteMap";
import styles from "@/components/admin/admin.module.css";
import { linkLines, mapRows } from "@/components/admin/site-map-model";
import { requireOwnerPage } from "@/lib/auth/owner";
import { pageChanges, type PageChanges } from "@/lib/content/page-changes";
import { unapprovedLabels, type Site } from "@/lib/content/schema";
import { HOME_PAGE, siteLinks } from "@/lib/content/site-links";
import { createContentStoreFromEnv } from "@/lib/content/store";
import { readDraftState } from "./draft";

// The admin home (U5, U6 of the first plan; U6 of the map plan): Publish, the
// ways to the home, profile, software, and label editors, and the map of the
// site (2.4.18 to 2.4.30). Every change goes to the DRAFT; visitors see it
// only after Publish (2.4.6).

// The owner check and an uncached draft read run on every request.
export const instant = false;

/**
 * The change marks (KTD8), or null when the published document cannot be read:
 * the map then shows no marks, and the page says why.
 */
async function readChanges(draft: Site): Promise<PageChanges | null> {
  const store = createContentStoreFromEnv();
  if (!store) return null;
  try {
    return pageChanges(draft, await store.readPublished());
  } catch (error) {
    console.error("The admin map could not read the published document:", error);
    return null;
  }
}

export default async function AdminHome() {
  await requireOwnerPage();
  const state = await readDraftState();
  if (state.kind !== "ok") {
    return (
      <main id="main" className={`container ${styles.page}`} data-testid="admin-home">
        <h1>Admin</h1>
        <DraftProblem state={state} />
      </main>
    );
  }

  const site = state.site;
  const unapproved = unapprovedLabels(site).length;
  const changes = await readChanges(site);
  const rows = mapRows({
    homePage: HOME_PAGE,
    experiences: site.experiences.map((e) => ({ slug: e.slug, title: e.homeTitle })),
    changes,
  });
  const links = siteLinks(site);
  const titles = new Map(rows.map((row) => [row.page, row.title]));
  const outside: OutsideLine[] = links.outside.map(({ href, kind, page }) => ({
    href,
    kind,
    pageTitle: titles.get(page) ?? page,
  }));

  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-home">
      <h1>Admin</h1>

      <PublishPanel />

      <nav className={styles.section} aria-labelledby="more-heading">
        <h2 id="more-heading">More to edit</h2>
        <ul>
          <li>
            <a href="/admin/home">Home page</a> (each home section in its place: profile, cards, software, about)
          </li>
          <li>
            <a href="/admin/profile">Profile and contact links</a> (name, intro, photo, resume)
          </li>
          <li>
            <a href="/admin/software">Software cards</a>: {site.software.map((card) => card.name).join(", ") || "none yet"}
          </li>
          <li>
            <a href="/admin/labels">Labels</a>
            {unapproved > 0 ? ` (${unapproved} not approved)` : " (all approved)"}
          </li>
        </ul>
      </nav>

      {changes === null ? (
        <p className={styles.muted} data-testid="marks-unavailable">
          The published site could not be read, so the map shows no change marks.
        </p>
      ) : null}

      <SiteMap rows={rows} links={linkLines(links, rows)} outside={outside} />
    </main>
  );
}
