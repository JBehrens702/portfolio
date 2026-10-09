import type { Metadata } from "next";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { SoftwareEditor } from "@/components/admin/SoftwareEditor";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { readDraftState } from "../draft";

export const metadata: Metadata = { title: "Software cards" };

// Owner check and an uncached draft read on every request.
export const instant = false;

export default async function AdminSoftware() {
  await requireOwnerPage();
  const state = await readDraftState();
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-software">
      <p>
        <a href="/admin">Back to Admin</a>
      </p>
      <h1>Software cards</h1>
      {state.kind === "ok" ? (
        <SoftwareEditor initial={state.site.software} mediaPrefix={state.mediaPrefix} />
      ) : (
        <DraftProblem state={state} />
      )}
    </main>
  );
}
