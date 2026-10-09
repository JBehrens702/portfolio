import type { CSSProperties } from "react";
import Image from "next/image";
import type { Media } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { imageHostsFromEnv, isOptimizableImage } from "./image-hosts";

// The size that next/image reserves when the document has no image size. The
// CSS sets height: auto, so the image keeps its own shape once it loads.
const FALLBACK_SIZE = { width: 1600, height: 1200 };

/** The width and height of an owner image, or the fallback size. */
export function mediaSize(media: Media): { width: number; height: number } {
  return { width: media.width ?? FALLBACK_SIZE.width, height: media.height ?? FALLBACK_SIZE.height };
}

export interface MediaImageProps {
  media: Media;
  sizes: string;
  className?: string;
  style?: CSSProperties;
  /** Load at once, for the first image on the page. */
  eager?: boolean;
  /**
   * A second, decorative copy of an image that the page already shows with its
   * own alt text (for example the card image beside the "Next" link): alt="".
   */
  decorative?: boolean;
}

/**
 * An owner image. The alt text is the owner's own, or empty: never a file name
 * or generated text (1.2.4). Images on an allowed Blob host go through the
 * Next.js optimizer; any other host loads as it is, so the optimizer never
 * fetches an address that is not on the allow-list.
 */
export function MediaImage({ media, sizes, className, style, eager, decorative }: MediaImageProps) {
  const optimize = isOptimizableImage(media.url, imageHostsFromEnv());
  const { width, height } = mediaSize(media);
  return (
    <Image
      src={media.url}
      alt={decorative || isBlank(media.alt) ? "" : media.alt!}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      style={style}
      unoptimized={!optimize}
      preload={eager}
    />
  );
}
