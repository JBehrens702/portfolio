import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { ExperienceEditor } from "@/components/admin/ExperienceEditor";
import { PageBar } from "@/components/admin/PageBar";
import { barPages } from "@/components/admin/page-bar-model";
import { StaleProvider } from "@/components/admin/StaleProvider";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
import { experienceKeys, stampParts } from "@/lib/content/parts";
import { readDraftState } from "../../draft";

interface Props {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = { title: "Edit experience" };

// Owner check and an uncached draft read on every request. An unknown slug gives 404.
export const instant = false;

export default async function AdminExperience({ params }: Props) {
  await requireOwnerPage();
  const { slug } = await params;
  const state = await readDraftState();
  if (state.kind !== "ok") {
    return (
      <main id="main" className={`container ${styles.page}`}>
        <DraftProblem state={state} />
      </main>
    );
  }
  const experience = state.site.experiences.find((e) => e.slug === slug);
  if (!experience) notFound();
  return (
    <main id="main" className={`container ${styles.page}`} data-testid="admin-experience">
      {/* The return check of this page (KTD5); the server makes the stamps (KTD1). */}
      <PageBar pages={barPages(state.site)} current={slug} mode="edit" />
      <StaleProvider titles={{ [slug]: experience.pageTitle || experience.homeTitle }}>
        <p>
          <a href="/admin">Back to Admin</a>
        </p>
        <h1>{experience.pageTitle}</h1>
        <ExperienceEditor
          initial={experience}
          site={state.site}
          mediaPrefix={state.mediaPrefix}
          stamps={stampParts(state.site, experienceKeys(slug))}
        />
      </StaleProvider>
    </main>
  );
}
