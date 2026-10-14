import type { CSSProperties } from "react";
import type { Block as BlockData, ImagesBlock } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { ArrowIcon, ExpandIcon, FileIcon, QuoteMarkIcon } from "./icons";
import { downloadHref } from "./links";
import { Markdown } from "./Markdown";
import { MediaImage, mediaSize } from "./MediaImage";
import { ZoomFigure } from "./ZoomFigure";
import styles from "./Experience.module.css";

/**
 * How an images block shows:
 *   flow    in the text column: one large image, or a row of images of equal height
 *   spread  the large image beside a fact panel
 *   logo    small images inside the fact panel, such as a client logo
 */
export type ImagesVariant = "flow" | "spread" | "logo";

/** The approved labels of the image enlarge view; null where images do not open larger. */
export interface ZoomLabels {
  enlarge: string;
  close: string;
}

export interface BlockProps {
  block: BlockData;
  /** "/" for the public site, "/preview" for the preview. */
  linkBase: string;
  /** The approved "Download" label shown on file links, or null. */
  downloadLabel: string | null;
  /** For an images block only. */
  variant?: ImagesVariant;
  /** For an images block only: the enlarge labels, or null (the editor, a missing label). */
  zoom?: ZoomLabels | null;
}

function Images({ block, variant, zoom }: { block: ImagesBlock; variant: ImagesVariant; zoom: ZoomLabels | null }) {
  const items = block.items.filter((item) => item.image);
  const single = items.length === 1;
  const galleryClass = [
    styles.gallery,
    variant === "spread" ? styles.gallerySpread : "",
    variant === "logo" ? styles.galleryLogo : "",
    variant === "flow" && single ? styles.gallerySingle : "",
  ].join(" ");
  const sizes =
    variant === "logo"
      ? "16rem"
      : single
        ? "(min-width: 1024px) 52rem, 100vw"
        : `(min-width: 1024px) ${Math.round(56 / items.length)}rem, (min-width: 640px) ${Math.round(100 / items.length)}vw, 100vw`;
  // Photos open with a diagonal wipe and a scan line, under orange crop marks;
  // logos only fade in. The marks and the line are aria-hidden graphics without text.
  const reveal = variant === "logo" ? "fade" : "wipe";
  const marked = variant !== "logo";
  // The whole image is the button; its small tag names the action. On a logo
  // tile the tag would cover the logo, so there it is for screen readers only.
  const enlarge = zoom && block.enlarge !== false ? zoom : null;
  const gallery = (
    <div className={galleryClass}>
      {items.map((item, i) => {
        const { width, height } = mediaSize(item.image!);
        const style = { "--ar": width / height, "--w": width, "--i": i } as CSSProperties;
        const content = (
          <>
            <MediaImage media={item.image!} sizes={sizes} className={styles.image} />
            {marked && <span className={styles.scan} aria-hidden="true" />}
            {marked && <span className="corner-marks" aria-hidden="true" />}
          </>
        );
        return enlarge ? (
          <button
            key={i}
            type="button"
            className={`${styles.galleryItem} ${styles.zoomable}`}
            style={style}
            data-reveal={reveal}
            data-zoom={i}
          >
            {content}
            <span className={marked ? styles.zoomHint : "visually-hidden"}>
              {marked && <ExpandIcon className={styles.zoomHintIcon} />}
              {enlarge.enlarge}
            </span>
          </button>
        ) : (
          <div key={i} className={styles.galleryItem} style={style} data-reveal={reveal}>
            {content}
          </div>
        );
      })}
    </div>
  );
  const caption = block.caption && <figcaption className={styles.caption}>{block.caption}</figcaption>;
  if (!enlarge) {
    return (
      <figure className={styles.figure}>
        {gallery}
        {caption}
      </figure>
    );
  }
  const large = items.map((item, i) => (
    <MediaImage key={i} media={item.image!} sizes="100vw" className={styles.zoomImage} />
  ));
  return (
    <ZoomFigure className={styles.figure} closeLabel={enlarge.close} large={large}>
      {gallery}
      {caption}
    </ZoomFigure>
  );
}

/**
 * One block of an experience page (KTD6). Pass blocks from visibleSite(): it has
 * already removed the empty ones (KTD7).
 */
export function Block({ block, linkBase, downloadLabel, variant = "flow", zoom = null }: BlockProps) {
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
        <blockquote className={styles.quote} data-reveal="">
          <QuoteMarkIcon className={styles.quoteMark} />
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
      return <Images block={block} variant={variant} zoom={zoom} />;
    case "file": {
      if (!block.file) return null;
      // The owner's label, else the owner's file name. Never a generated text (1.2.4).
      const text = !isBlank(block.label) ? block.label : block.file.fileName;
      if (isBlank(text)) return null;
      return (
        <p className={styles.file} data-reveal="">
          <a href={downloadHref(block.file)} className={styles.fileLink}>
            <span className={styles.fileIconWrap}>
              <FileIcon className={styles.fileIcon} />
            </span>
            <span className={styles.fileText}>
              {downloadLabel && <span className={styles.fileAction}>{`${downloadLabel} `}</span>}
              <span className={styles.fileName}>{text}</span>
            </span>
            <ArrowIcon className={styles.fileArrow} />
          </a>
        </p>
      );
    }
  }
}
