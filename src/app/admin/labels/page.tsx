import type { Metadata } from "next";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { LabelsEditor } from "@/components/admin/LabelsEditor";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { readDraftState } from "../draft";

export const metadata: Metadata = { title: "Labels" };

// Owner check and an uncached draft read on every request.
export const instant = false;

export default async function AdminLabels() {
  await requireOwnerPage();
  const state = await readDraftState();
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-labels">
      <p>
        <a href="/admin">Back to Admin</a>
      </p>
      <h1>Labels</h1>
      <p className={styles.muted}>
        The short texts of the layout, such as buttons and section headings. The site publishes only when every label is
        approved. A label that you rewrite counts as approved.
      </p>
      {state.kind === "ok" ? <LabelsEditor initial={state.site.labels} /> : <DraftProblem state={state} />}
    </main>
  );
}
