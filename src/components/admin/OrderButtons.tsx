"use client";

import type { Direction } from "@/lib/content/order";
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
  onMove: (direction: Direction) => void;
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
