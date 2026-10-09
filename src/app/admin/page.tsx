import { requireOwnerPage } from "@/lib/auth/owner";
import { ContentValidationError, type Site } from "@/lib/content/schema";
import { createContentStoreFromEnv } from "@/lib/content/store";

// The admin home (U5): the experiences and software cards of the DRAFT by
// title, and the way to the preview. U6 adds the editors, uploads, and Publish.

// The owner check and an uncached draft read run on every request.
export const instant = false;

type DraftState = { site: Site | null } | { issues: string[] };

async function readDraftState(): Promise<DraftState> {
  const store = createContentStoreFromEnv();
  if (!store) return { site: null };
  try {
    return { site: await store.readDraft() };
  } catch (error) {
    if (error instanceof ContentValidationError) return { issues: error.issues };
    throw error;
  }
}

export default async function AdminHome() {
  await requireOwnerPage();
  const state = await readDraftState();

  return (
    <main id="main" className="container" data-testid="admin-home" style={{ paddingBlock: "var(--space-8)" }}>
      <h1>Admin</h1>
      <p>
        <a href="/preview">Preview the draft</a>
      </p>

      {"issues" in state ? (
        <section>
          <h2>The draft is not valid</h2>
          <ul>
            {state.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      ) : !state.site ? (
        <p>No draft yet.</p>
      ) : (
        <>
          <section>
            <h2>Experiences</h2>
            <ol>
              {state.site.experiences.map((experience) => (
                <li key={experience.slug}>
                  {experience.homeTitle}{" "}
                  <a href={`/preview/experiences/${encodeURIComponent(experience.slug)}`}>Preview</a>
                  {/* U6: edit, move, and remove this experience. */}
                </li>
              ))}
            </ol>
            {/* U6: add an experience. */}
          </section>

          <section>
            <h2>Software cards</h2>
            <ol>
              {state.site.software.map((card) => (
                <li key={card.id}>
                  {card.name}
                  {/* U6: edit, move, and remove this card. */}
                </li>
              ))}
            </ol>
          </section>

          {/* U6: profile and contact editor, labels with their approve control, uploads, and Publish. */}
        </>
      )}
    </main>
  );
}
