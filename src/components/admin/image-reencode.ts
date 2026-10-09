"use client";

import { isImageType, isReencodedType } from "@/lib/content/upload-rules";

// Before an upload, the browser draws each JPEG, PNG, and WebP image again
// through a canvas (U6 step 3). The canvas output carries only pixels, so EXIF
// data, GPS positions, and other metadata never reach Blob. The orientation
// from EXIF is applied first, so the new image is upright without it.

export interface PreparedUpload {
  body: Blob;
  contentType: string;
  width?: number;
  height?: number;
}

export class ImageReadError extends Error {
  constructor() {
    super("This image could not be read. Use another file.");
    this.name = "ImageReadError";
  }
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageReadError();
  }
}

export async function prepareUpload(file: File, contentType: string): Promise<PreparedUpload> {
  if (!isImageType(contentType)) return { body: file, contentType };

  const bitmap = await decode(file);
  const width = bitmap.width;
  const height = bitmap.height;
  if (!isReencodedType(contentType)) {
    // GIF: kept as it is, so an animation stays animated; only its size is read.
    bitmap.close();
    return { body: file, contentType, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageReadError();
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const body = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, contentType, 0.92));
  if (!body) throw new ImageReadError();
  // A browser that cannot write WebP writes PNG instead; the blob's type says which.
  return { body, contentType: body.type || contentType, width, height };
}
