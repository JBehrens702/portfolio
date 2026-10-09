import { DraftProblem } from "@/components/admin/DraftProblem";
import { ExperienceList } from "@/components/admin/ExperienceList";
import { PublishPanel } from "@/components/admin/PublishPanel";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { unapprovedLabels } from "@/lib/content/schema";
import { readDraftState } from "./draft";

// The admin home (U5, U6): Publish and the preview link, the experiences with
// their order, and the ways to the profile, software, and label editors. Every
// change goes to the DRAFT; visitors see it only after Publish (2.4.6).

// The owner check and an uncached draft read run on every request.
export const instant = false;

export default async function AdminHome() {
  await requireOwnerPage();
  const state = await readDraftState();

  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-home">
      <h1>Admin</h1>

      {state.kind !== "ok" ? (
        <DraftProblem state={state} />
      ) : (
        <>
          <PublishPanel />

          <section className={styles.section} aria-labelledby="experiences-heading">
            <h2 id="experiences-heading">Experiences</h2>
            <ExperienceList experiences={state.site.experiences.map((e) => ({ slug: e.slug, title: e.homeTitle }))} />
          </section>

          <section className={styles.section} aria-labelledby="more-heading">
            <h2 id="more-heading">More to edit</h2>
            <ul>
              <li>
                <a href="/admin/profile">Profile and contact links</a> (name, intro, photo, resume)
              </li>
              <li>
                <a href="/admin/software">Software cards</a>:{" "}
                {state.site.software.map((card) => card.name).join(", ") || "none yet"}
              </li>
              <li>
                <a href="/admin/labels">Labels</a>
                {(() => {
                  const count = unapprovedLabels(state.site).length;
                  return count > 0 ? ` (${count} not approved)` : " (all approved)";
                })()}
              </li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
