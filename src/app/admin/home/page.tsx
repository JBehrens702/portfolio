import type { Metadata } from "next";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { HomeEditor, type HomeStamps } from "@/components/admin/HomeEditor";
import { StaleProvider } from "@/components/admin/StaleProvider";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { cardKey, stampParts } from "@/lib/content/parts";
import type { Site } from "@/lib/content/schema";
import { readDraftState } from "../draft";

export const metadata: Metadata = { title: "Home page" };

// Owner check and an uncached draft read on every request.
export const instant = false;

/** The stamps of the parts that each editor on the home page edits (KTD1): the profile, each card, the software cards. */
function homeStamps(site: Site): HomeStamps {
  return {
    profile: stampParts(site, ["profile"]),
    cards: Object.fromEntries(site.experiences.map((e) => [e.slug, stampParts(site, [cardKey(e.slug)])])),
    software: stampParts(site, ["software"]),
  };
}

export default async function AdminHomePage() {
  await requireOwnerPage();
  const state = await readDraftState();
  const titles = state.kind === "ok" ? Object.fromEntries(state.site.experiences.map((e) => [e.slug, e.homeTitle || e.pageTitle])) : {};
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-home-page">
      {/* The return check of this page (KTD5); the server makes the stamps (KTD1). */}
      <StaleProvider titles={titles}>
        <p>
          <a href="/admin">Back to Admin</a>
        </p>
        <h1>Home page</h1>
        {state.kind === "ok" ? (
          <HomeEditor site={state.site} mediaPrefix={state.mediaPrefix} stamps={homeStamps(state.site)} />
        ) : (
          <DraftProblem state={state} />
        )}
      </StaleProvider>
    </main>
  );
}
