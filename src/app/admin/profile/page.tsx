import type { Metadata } from "next";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { ProfileEditor } from "@/components/admin/ProfileEditor";
import { StaleProvider } from "@/components/admin/StaleProvider";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { stampParts } from "@/lib/content/parts";
import { readDraftState } from "../draft";

export const metadata: Metadata = { title: "Profile" };

// Owner check and an uncached draft read on every request.
export const instant = false;

export default async function AdminProfile() {
  await requireOwnerPage();
  const state = await readDraftState();
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-profile">
      {/* The return check of this page (KTD5); the server makes the stamps (KTD1). */}
      <StaleProvider>
        <p>
          <a href="/admin">Back to Admin</a>
        </p>
        <h1>Profile and contact</h1>
        {state.kind === "ok" ? (
          <ProfileEditor site={state.site} mediaPrefix={state.mediaPrefix} stamps={stampParts(state.site, ["profile"])} />
        ) : (
          <DraftProblem state={state} />
        )}
      </StaleProvider>
    </main>
  );
}
