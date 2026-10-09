import type { CSSProperties } from "react";
import type { SoftwareCard as SoftwareCardData } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { ExternalIcon } from "./icons";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import styles from "./Site.module.css";

export interface SoftwareCardProps {
  card: SoftwareCardData;
  /** "/" for the public site, "/preview" for the preview. */
  linkBase: string;
  /** The position in the strip, for the stagger of the reveal. */
  index?: number;
}

/**
 * A small software card with cut corners: screenshot, name, and overview (0.1.4). The name links
 * to the project in a new tab when a link exists. A card never links to a full
 * page (0.1.5).
 */
export function SoftwareCard({ card, linkBase, index = 0 }: SoftwareCardProps) {
  return (
    <article className={styles.card} data-reveal="" style={{ "--i": index } as CSSProperties}>
      {card.screenshot && (
        <div className={styles.cardMedia}>
          <div className={styles.cardFrame} data-reveal="wipe">
            <MediaImage
              media={card.screenshot}
              sizes="(min-width: 800px) 36rem, 100vw"
              className={styles.cardImage}
            />
            <span className={styles.scan} aria-hidden="true" />
          </div>
          <span className="corner-marks" aria-hidden="true" />
        </div>
      )}
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>
          {card.link ? (
            <a href={card.link} target="_blank" rel="noopener noreferrer" className={styles.cardLink}>
              {card.name}
              <ExternalIcon className={styles.cardLinkIcon} />
            </a>
          ) : (
            card.name
          )}
        </h3>
        {!isBlank(card.overview) && (
          <Markdown text={card.overview!} className={styles.prose} linkBase={linkBase} />
        )}
      </div>
    </article>
  );
}

export default SoftwareCard;
