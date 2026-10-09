"use client";

import styles from "./admin.module.css";

/** Up and down buttons for one item of an ordered list (2.4.5, U6 step 7). */
export function OrderButtons({
  name,
  index,
  count,
  onMove,
  disabled = false,
}: {
  /** The item's name, for the button labels. */
  name: string;
  index: number;
  count: number;
  onMove: (direction: "up" | "down") => void;
  disabled?: boolean;
}) {
  return (
    <span className={styles.row}>
      <button
        type="button"
        className={`${styles.button} ${styles.small}`}
        aria-label={`Move ${name} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove("up")}
      >
        Up
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.small}`}
        aria-label={`Move ${name} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove("down")}
      >
        Down
      </button>
    </span>
  );
}

/** The list with the item at `index` moved one place. */
export function moved<T>(list: T[], index: number, direction: "up" | "down"): T[] {
  const other = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || other < 0 || index >= list.length || other >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[other]] = [copy[other], copy[index]];
  return copy;
}
