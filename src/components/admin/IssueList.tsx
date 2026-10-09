import styles from "./admin.module.css";

/** The problems of a refused save or Publish, as a list. Nothing when there are none. */
export function IssueList({ issues }: { issues?: string[] }) {
  return issues?.length ? (
    <ul className={styles.issues}>
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  ) : null;
}
