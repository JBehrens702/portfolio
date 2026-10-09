import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DraftProblem } from "@/components/admin/DraftProblem";
import { ExperienceEditor } from "@/components/admin/ExperienceEditor";
import styles from "@/components/admin/admin.module.css";
import { requireOwnerPage } from "@/lib/auth/owner";
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
      <p>
        <a href="/admin">Back to Admin</a>
      </p>
      <h1>{experience.pageTitle}</h1>
      <ExperienceEditor initial={experience} mediaPrefix={state.mediaPrefix} />
    </main>
  );
}
