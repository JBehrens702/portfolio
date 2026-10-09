import type { Block as BlockData } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { downloadHref } from "./links";
import { Markdown } from "./Markdown";
import { MediaImage } from "./MediaImage";
import styles from "./Experience.module.css";

export interface BlockProps {
  block: BlockData;
  /** "/" for the public site, "/preview" for the preview. */
  linkBase: string;
  /** The approved "Download" label shown on file links, or null. */
  downloadLabel: string | null;
}

/**
 * One block of an experience page (KTD6). Pass blocks from visibleSite(): it has
 * already removed the empty ones (KTD7).
 */
export function Block({ block, linkBase, downloadLabel }: BlockProps) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 className={styles.heading}>{block.text}</h2>
      ) : (
        <h3 className={styles.subheading}>{block.text}</h3>
      );
    case "text":
      return <Markdown text={block.text} className={styles.prose} linkBase={linkBase} />;
    case "quote":
      return (
        <blockquote className={styles.quote}>
          <Markdown text={block.text} linkBase={linkBase} />
        </blockquote>
      );
    case "facts":
      return (
        <dl className={styles.facts}>
          {block.items.map((item, i) => (
            <div key={i} className={styles.fact}>
              {!isBlank(item.label) && <dt>{item.label}</dt>}
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "images":
      return (
        <figure className={styles.figure}>
          <div className={block.items.length > 1 ? styles.imageGrid : undefined}>
            {block.items.map((item, i) =>
              item.image ? (
                <MediaImage
                  key={i}
                  media={item.image}
                  sizes={block.items.length > 1 ? "(min-width: 800px) 36rem, 100vw" : "(min-width: 800px) 48rem, 100vw"}
                  className={styles.image}
                />
              ) : null,
            )}
          </div>
          {block.caption && <figcaption className={styles.caption}>{block.caption}</figcaption>}
        </figure>
      );
    case "file": {
      if (!block.file) return null;
      // The owner's label, else the owner's file name. Never a generated text (1.2.4).
      const text = !isBlank(block.label) ? block.label : block.file.fileName;
      if (isBlank(text)) return null;
      return (
        <p className={styles.file}>
          <a href={downloadHref(block.file)} className={styles.fileLink}>
            {downloadLabel && <span className={styles.fileAction}>{`${downloadLabel} `}</span>}
            {text}
          </a>
        </p>
      );
    }
  }
}

export default Block;
