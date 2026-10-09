import type { DraftState } from "@/app/admin/draft";

/** What the admin shows when it has no valid draft to edit. */
export function DraftProblem({ state }: { state: Exclude<DraftState, { kind: "ok" }> }) {
  switch (state.kind) {
    case "no-store":
      return <p>No content store is configured. Set CONTENT_ROOT, CONTENT_PATH_SECRET, and the Blob store variables.</p>;
    case "no-draft":
      return <p>No draft yet. Run the seed script (npm run seed) to create one.</p>;
    case "invalid":
      return (
        <section>
          <h2>The draft is not valid</h2>
          <ul>
            {state.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      );
  }
}
