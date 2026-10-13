import type { Metadata } from "next";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { SoftwareEditor } from "@/components/admin/SoftwareEditor";
import { PageBar } from "@/components/admin/PageBar";
import { barPages, HOME_ID } from "@/components/admin/page-bar-model";
import { StaleProvider } from "@/components/admin/StaleProvider";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { stampParts } from "@/lib/content/parts";
import { readDraftState } from "../draft";

export const metadata: Metadata = { title: "Software cards" };

// Owner check and an uncached draft read on every request.
export const instant = false;

export default async function AdminSoftware() {
  await requireOwnerPage();
  const state = await readDraftState();
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-software">
      {/* The return check of this page (KTD5); the server makes the stamps (KTD1). */}
      {state.kind === "ok" ? <PageBar pages={barPages(state.site)} current={HOME_ID} mode="edit" /> : null}
      <StaleProvider>
        <p>
          <a href="/admin">Back to Admin</a>
        </p>
        <h1>Software cards</h1>
        {state.kind === "ok" ? (
          <SoftwareEditor initial={state.site.software} mediaPrefix={state.mediaPrefix} stamps={stampParts(state.site, ["software"])} />
        ) : (
          <DraftProblem state={state} />
        )}
      </StaleProvider>
    </main>
  );
}
