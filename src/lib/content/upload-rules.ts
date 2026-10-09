// The upload rules (U6, 2.4.3). One module, so the browser check, the upload
// route, and the save check agree. Only these file types are allowed; SVG and
// everything else is refused, because an SVG file can carry a script.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Each allowed content type and its file name extensions. */
export const UPLOAD_TYPES: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "application/pdf": ["pdf"],
  [DOCX_TYPE]: ["docx"],
};

export const ALLOWED_CONTENT_TYPES = Object.keys(UPLOAD_TYPES);
export const IMAGE_CONTENT_TYPES = ALLOWED_CONTENT_TYPES.filter((type) => type.startsWith("image/"));

/** The message for a refused file. It names the allowed types and the limit. */
export const UPLOAD_REFUSED_MESSAGE =
  "File refused. Allowed types: JPEG, PNG, WebP, GIF, PDF, and DOCX, up to 25 MB.";
export const IMAGE_REFUSED_MESSAGE = "File refused. Allowed image types: JPEG, PNG, WebP, and GIF, up to 25 MB.";

export function isImageType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.includes(contentType);
}

/** JPEG, PNG, and WebP are drawn again through a canvas before upload, which drops EXIF and GPS data. */
export function isReencodedType(contentType: string): boolean {
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp";
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The allowed content type for a file name, from its extension, or null. */
export function contentTypeForName(name: string): string | null {
  const extension = extensionOf(name);
  for (const [type, extensions] of Object.entries(UPLOAD_TYPES)) {
    if (extensions.includes(extension)) return type;
  }
  return null;
}

/** The main extension of an allowed content type ("jpg" for JPEG). */
export function extensionForType(contentType: string): string | null {
  return UPLOAD_TYPES[contentType]?.[0] ?? null;
}

const SAFE_NAME = /^[a-z0-9][a-z0-9_-]{0,79}\.[a-z0-9]{2,5}$/;

/**
 * A safe Blob file name from the owner's file name: lower case, a-z, 0-9, "_",
 * and "-", and the extension of the content type. The upload route adds a
 * random suffix, so two files with the same name never share a pathname.
 */
export function safeFileName(name: string, contentType: string): string {
  const extension = extensionForType(contentType) ?? "bin";
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 60)
    .replace(/[-_]+$/g, "");
  return `${base || "file"}.${extension}`;
}

export type UploadCheck = { ok: true; contentType: string } | { ok: false; message: string };

export interface UploadFacts {
  name: string;
  /** The type that the browser reports. Empty when unknown: the extension then decides. */
  type: string;
  size: number;
}

/** The browser-side check of a chosen file. `imagesOnly` is for image fields. */
export function checkUpload(file: UploadFacts, imagesOnly = false): UploadCheck {
  const refused = { ok: false as const, message: imagesOnly ? IMAGE_REFUSED_MESSAGE : UPLOAD_REFUSED_MESSAGE };
  const byName = contentTypeForName(file.name);
  const type = file.type.trim().toLowerCase() || byName;
  if (!type || !ALLOWED_CONTENT_TYPES.includes(type) || byName !== type) return refused;
  if (imagesOnly && !isImageType(type)) return refused;
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return refused;
  return { ok: true, contentType: type };
}

/** What the browser sends with a token request (the upload's clientPayload). */
export interface UploadClaim {
  contentType: string;
  size: number;
}

/**
 * The server-side check of a token request: the pathname must be one safe file
 * name directly under the content root's media prefix, with an allowed
 * extension, and the claimed type and size must fit the rules. Blob enforces
 * the type and the size again at upload time, from the token.
 */
export function checkTokenRequest(pathname: string, clientPayload: string | null, mediaPrefix: string): UploadCheck {
  const refused = { ok: false as const, message: UPLOAD_REFUSED_MESSAGE };
  if (!pathname.startsWith(mediaPrefix)) return refused;
  const name = pathname.slice(mediaPrefix.length);
  if (!SAFE_NAME.test(name)) return refused;
  const byName = contentTypeForName(name);
  if (!byName) return refused;
  let claim: unknown;
  try {
    claim = clientPayload === null ? null : JSON.parse(clientPayload);
  } catch {
    return refused;
  }
  if (!claim || typeof claim !== "object") return refused;
  const { contentType, size } = claim as Partial<UploadClaim>;
  if (contentType !== byName) return refused;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) return refused;
  return { ok: true, contentType: byName };
}
