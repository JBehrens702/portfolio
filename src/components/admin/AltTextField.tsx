"use client";

import type { Media } from "@/lib/content/schema";
import styles from "./admin.module.css";

/** The alt text of an uploaded image, for screen readers. Shows only while the image exists. */
export function AltTextField({
  label,
  media,
  onChange,
}: {
  label: string;
  media: Media | undefined;
  onChange: (alt: string) => void;
}) {
  if (!media) return null;
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input className={styles.input} value={media.alt ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
