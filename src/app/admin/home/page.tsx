import type { Metadata } from "next";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { HomeEditor } from "@/components/admin/HomeEditor";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { readDraftState } from "../draft";

export const metadata: Metadata = { title: "Home page" };

// Owner check and an uncached draft read on every request.
export const instant = false;

export default async function AdminHomePage() {
  await requireOwnerPage();
  const state = await readDraftState();
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-home-page">
      <p>
        <a href="/admin">Back to Admin</a>
      </p>
      <h1>Home page</h1>
      {state.kind === "ok" ? <HomeEditor site={state.site} mediaPrefix={state.mediaPrefix} /> : <DraftProblem state={state} />}
    </main>
  );
}
