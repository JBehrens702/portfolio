"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addExperience, moveExperience, removeExperience, type ActionResult } from "@/app/admin/actions";
import { useConfirm } from "./ConfirmDialog";
import { IssueList } from "./IssueList";
import { OrderButtons } from "./OrderButtons";
import { NETWORK_FAILURE } from "./useDraftEditor";
import { useHydrated } from "./useHydrated";
import styles from "./admin.module.css";

// The experiences on the admin home (2.4.4, 2.4.5): open, move, remove, and add.
// Each button saves the draft at once.

export interface ExperienceRow {
  slug: string;
  title: string;
}

type Message = { ok: boolean; text: string; issues?: string[] } | null;

export function ExperienceList({ experiences }: { experiences: ExperienceRow[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const [title, setTitle] = useState("");
  const hydrated = useHydrated();
  const busy = pending || !hydrated;

  function run(action: () => Promise<ActionResult | { ok: true; slug: string; savedAt: string }>, done?: (slug?: string) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setMessage({ ok: true, text: `Saved at ${new Date(result.savedAt).toLocaleTimeString()}.` });
          if (done) done("slug" in result ? result.slug : undefined);
          else router.refresh();
        } else {
          setMessage({ ok: false, text: result.message, issues: result.issues });
        }
      } catch {
        setMessage({ ok: false, text: NETWORK_FAILURE });
      }
    });
  }

  return (
    <div className={styles.stack}>
      <ol className={styles.list} aria-label="Experiences">
        {experiences.map((experience, index) => (
          <li key={experience.slug} className={styles.card} data-testid="experience-row">
            <div className={styles.cardHeader}>
              <a href={`/admin/experiences/${encodeURIComponent(experience.slug)}`}>{experience.title}</a>
              <span className={styles.row}>
                <a className={styles.muted} href={`/preview/experiences/${encodeURIComponent(experience.slug)}`}>
                  Preview
                </a>
                <OrderButtons
                  name={`"${experience.title}"`}
                  index={index}
                  count={experiences.length}
                  disabled={busy}
                  onMove={(direction) => run(() => moveExperience(experience.slug, direction))}
                />
                <button
                  type="button"
                  className={`${styles.button} ${styles.small} ${styles.danger}`}
                  disabled={busy}
                  onClick={async () => {
                    const question = `Remove the experience "${experience.title}" with its home block and full page?`;
                    if (await confirm(question)) run(() => removeExperience(experience.slug));
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>

      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          const name = title.trim();
          if (!name) return;
          run(
            () => addExperience(name),
            (slug) => {
              if (slug) router.push(`/admin/experiences/${encodeURIComponent(slug)}`);
            },
          );
        }}
      >
        <label className={styles.row}>
          <span className={styles.muted}>New experience title</span>
          <input className={styles.input} style={{ width: "auto" }} name="newExperience" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit" className={styles.button} disabled={busy}>
          Add experience
        </button>
      </form>

      {message ? (
        <div role={message.ok ? "status" : "alert"} className={message.ok ? undefined : styles.error}>
          {message.text}
          <IssueList issues={message.issues} />
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
