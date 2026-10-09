import type { SoftwareCard as SoftwareCardData } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import styles from "./Site.module.css";

export interface SoftwareCardProps {
  card: SoftwareCardData;
  /** "/" for the public site, "/preview" for the preview. */
  linkBase: string;
}

/**
 * A small software card: screenshot, name, and overview (0.1.4). The name links
 * to the project in a new tab when a link exists. A card never links to a full
 * page (0.1.5).
 */
export function SoftwareCard({ card, linkBase }: SoftwareCardProps) {
  return (
    <article className={styles.card}>
      {card.screenshot && (
        <MediaImage
          media={card.screenshot}
          sizes="(min-width: 800px) 30vw, 100vw"
          className={styles.cardImage}
        />
      )}
      <div className={styles.cardBody}>
        <h3>
          {card.link ? (
            <a href={card.link} target="_blank" rel="noopener noreferrer">
              {card.name}
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
