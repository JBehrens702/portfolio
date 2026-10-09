import type { Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import styles from "./PreviewMarker.module.css";

/**
 * The marker on the owner's preview pages (2.4.7). Its text is the label
 * "previewMarker" from the draft; without that label, no marker shows (1.2.4).
 */
export function PreviewMarker({ site }: { site: Site | null }) {
  const text = site ? labelText(site, "previewMarker") : null;
  if (!text) return null;
  return (
    <div className={styles.marker} data-testid="preview-marker" role="status">
      {text}
    </div>
  );
}
