import type { ImagesBlock, Media } from "@/lib/content/schema";

// An upload ends later than it starts. While it runs, the owner can type alt
// text, move items, or remove them. These helpers apply the result to the
// editor's LATEST state, never to a copy from the start of the upload.

/**
 * The uploaded file with the alt text that the replaced image has now. Call it
 * inside the editor's update, with the current image of the field.
 */
export function withCurrentAlt(uploaded: Media, current: Media | undefined): Media {
  return current?.alt ? { ...uploaded, alt: current.alt } : uploaded;
}

type ImageItem = ImagesBlock["items"][number];

/**
 * Puts an uploaded image on the item that the upload started on: the same item
 * object, or else the item that still holds the same file. When no item
 * matches (the owner removed it), the list comes back unchanged, and the
 * uploaded file stays unattached until the media cleanup deletes it.
 */
export function placeUploadedImage(list: ImageItem[], start: ImageItem, uploaded: Media): ImageItem[] {
  let index = list.indexOf(start);
  const pathname = start.image?.pathname;
  if (index < 0 && pathname !== undefined) index = list.findIndex((item) => item.image?.pathname === pathname);
  if (index < 0) return list;
  return list.map((item, i) => (i === index ? { image: withCurrentAlt(uploaded, item.image) } : item));
}
