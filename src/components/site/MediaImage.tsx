import Image from "next/image";
import type { Media } from "@/lib/content/schema";
import { isBlank } from "@/lib/content/visibility";
import { imageHostsFromEnv, isOptimizableImage } from "./image-hosts";

// The size that next/image reserves when the document has no image size. The
// CSS sets height: auto, so the image keeps its own shape once it loads.
const FALLBACK_SIZE = { width: 1600, height: 1200 };

export interface MediaImageProps {
  media: Media;
  sizes: string;
  className?: string;
  /** Load at once, for the first image on the page. */
  eager?: boolean;
}

/**
 * An owner image. The alt text is the owner's own, or empty: never a file name
 * or generated text (1.2.4). Images on an allowed Blob host go through the
 * Next.js optimizer; any other host loads as it is, so the optimizer never
 * fetches an address that is not on the allow-list.
 */
export function MediaImage({ media, sizes, className, eager }: MediaImageProps) {
  const optimize = isOptimizableImage(media.url, imageHostsFromEnv());
  return (
    <Image
      src={media.url}
      alt={isBlank(media.alt) ? "" : media.alt!}
      width={media.width ?? FALLBACK_SIZE.width}
      height={media.height ?? FALLBACK_SIZE.height}
      sizes={sizes}
      className={className}
      unoptimized={!optimize}
      preload={eager}
    />
  );
}

export default MediaImage;
