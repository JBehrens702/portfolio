"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveLabel, publishSite, type PublishActionResult } from "@/app/admin/actions";
import { useHydrated } from "./useHydrated";
import styles from "./admin.module.css";

// Preview and Publish (F2, 2.4.6, 2.4.7). Publish copies the saved draft to the
// live site. It is refused while a label is not approved (AE6); the panel then
// names each label, with a button to approve it as it is.

type State = { kind: "idle" } | { kind: "result"; result: PublishActionResult } | { kind: "failed" };

export function PublishPanel() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [approved, setApproved] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const publish = () =>
    startTransition(async () => {
      try {
        setState({ kind: "result", result: await publishSite() });
        setApproved([]);
      } catch {
        setState({ kind: "failed" });
      }
    });

  const approve = (key: string) =>
    startTransition(async () => {
      try {
        const result = await approveLabel(key);
        if (result.ok) {
          setApproved((list) => [...list, key]);
          router.refresh();
        }
      } catch {
        setState({ kind: "failed" });
      }
    });

  return (
    <section className={styles.card} aria-labelledby="publish-heading" data-testid="publish-panel">
      <h2 id="publish-heading" className={styles.cardTitle}>
        Publish
      </h2>
      <p className={styles.muted}>
        Saved changes stay in the draft until you publish. <a href="/preview">Preview the draft</a> first.
      </p>
      <div className={styles.row}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={publish} disabled={!hydrated || pending}>
          Publish
        </button>
        {pending ? <span className={styles.muted}>Working...</span> : null}
      </div>

      {state.kind === "failed" ? (
        <p role="alert" className={styles.error}>
          The connection failed. Nothing was published.{" "}
          <button type="button" className={`${styles.button} ${styles.small}`} onClick={publish}>
            Retry
          </button>
        </p>
      ) : null}

      {state.kind === "result" && state.result.ok ? (
        <div role="status" data-testid="publish-result">
          <p>Published at {new Date(state.result.publishedAt).toLocaleTimeString()}. Visitors now see this version.</p>
          {state.result.cleanup && "error" in state.result.cleanup ? (
            <p className={styles.muted}>{state.result.cleanup.error}</p>
          ) : null}
          {state.result.cleanup && "deleted" in state.result.cleanup && state.result.cleanup.deleted > 0 ? (
            <p className={styles.muted}>Deleted {state.result.cleanup.deleted} unused file(s).</p>
          ) : null}
        </div>
      ) : null}

      {state.kind === "result" && !state.result.ok ? (
        <div role="alert" className={styles.error} data-testid="publish-result">
          <p>{state.result.message}</p>
          {state.result.labels?.length ? (
            <ul className={styles.list}>
              {state.result.labels.map((label) => (
                <li key={label.key} className={styles.row} data-testid="unapproved-label">
                  <span>
                    {label.key}: &ldquo;{label.text}&rdquo;
                  </span>
                  {approved.includes(label.key) ? (
                    <span className={styles.muted}>Approved</span>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.button} ${styles.small}`}
                      aria-label={`Approve ${label.key}`}
                      onClick={() => approve(label.key)}
                      disabled={pending}
                    >
                      Approve
                    </button>
                  )}
                  <a href={`/admin/labels#label-${label.key}`}>Rewrite</a>
                </li>
              ))}
            </ul>
          ) : null}
          {state.result.issues?.length ? (
            <ul className={styles.issues}>
              {state.result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
