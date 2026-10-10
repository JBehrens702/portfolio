"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useId, useRef, useState } from "react";
import type { Media } from "@/lib/content/schema";
import {
  ALLOWED_CONTENT_TYPES,
  IMAGE_CONTENT_TYPES,
  IMAGE_REFUSED_MESSAGE,
  MAX_UPLOAD_BYTES,
  UPLOAD_REFUSED_MESSAGE,
  checkUpload,
  safeFileName,
  type UploadClaim,
} from "@/lib/content/upload-rules";
import { ImageReadError, prepareUpload } from "./image-reencode";
import { useHydrated } from "./useHydrated";
import styles from "./admin.module.css";

// One file of the content: show it, upload a new one, replace it, or remove it
// (2.4.3). The browser uploads straight to Blob with a presigned URL from
// /api/admin/upload; the parent editor then saves the returned file
// information into the draft. A failed upload leaves the draft unchanged.
// The parent applies the result to its LATEST state (see media-merge.ts): the
// owner can type alt text or move items while the upload runs.

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "refused"; message: string }
  | { kind: "failed"; file: File };

export interface MediaFieldProps {
  /** The field's name, shown to the owner and used in the confirmation question. */
  label: string;
  kind: "image" | "file";
  value: Media | undefined;
  mediaPrefix: string;
  /**
   * Called with the uploaded file, which has no alt text. The parent saves it
   * into the draft, with the alt text that the replaced image has at that time
   * (withCurrentAlt inside its update).
   */
  onUploaded: (media: Media) => void;
  /** Called after the owner confirmed the removal. Omit it where a file cannot be removed alone. */
  onRemove?: () => void;
  confirm: (question: string) => Promise<boolean>;
  beginUpload: () => void;
  endUpload: () => void;
  /** The text of the upload button when there is no file yet. */
  addText?: string;
}

export function MediaField(props: MediaFieldProps) {
  const { label, kind, value, mediaPrefix, onUploaded, onRemove, confirm, beginUpload, endUpload } = props;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const uploading = state.kind === "uploading";
  const hydrated = useHydrated();

  async function send(file: File) {
    const check = checkUpload({ name: file.name, type: file.type, size: file.size }, kind === "image");
    if (!check.ok) {
      setState({ kind: "refused", message: check.message });
      return;
    }
    beginUpload();
    setState({ kind: "uploading", percent: 0 });
    try {
      const prepared = await prepareUpload(file, check.contentType);
      // The re-encoded image can be larger than the original.
      if (prepared.body.size > MAX_UPLOAD_BYTES) {
        setState({ kind: "refused", message: kind === "image" ? IMAGE_REFUSED_MESSAGE : UPLOAD_REFUSED_MESSAGE });
        return;
      }
      const claim: UploadClaim = { contentType: prepared.contentType, size: prepared.body.size };
      const result = await uploadPresigned(`${mediaPrefix}${safeFileName(file.name, prepared.contentType)}`, prepared.body, {
        access: "public",
        handleUploadUrl: "/api/admin/upload",
        contentType: prepared.contentType,
        clientPayload: JSON.stringify(claim),
        multipart: false,
        onUploadProgress: ({ percentage }) => setState({ kind: "uploading", percent: Math.round(percentage) }),
      });
      const media: Media = {
        url: result.url,
        pathname: result.pathname,
        contentType: prepared.contentType,
        fileName: file.name,
      };
      if (prepared.width && prepared.height) {
        media.width = prepared.width;
        media.height = prepared.height;
      }
      setState({ kind: "idle" });
      onUploaded(media);
    } catch (error) {
      if (error instanceof ImageReadError) setState({ kind: "refused", message: error.message });
      else setState({ kind: "failed", file });
    } finally {
      endUpload();
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!onRemove || !value) return;
    const name = value.fileName ? `"${value.fileName}"` : "this file";
    if (await confirm(`Remove ${name} from ${label}? The live site keeps it until you publish.`)) onRemove();
  }

  const accept = (kind === "image" ? IMAGE_CONTENT_TYPES : ALLOWED_CONTENT_TYPES).join(",");

  return (
    <div className={styles.field} data-testid="media-field">
      <span>{label}</span>
      {value ? (
        <div className={styles.row}>
          {value.contentType.startsWith("image/") ? (
            // The admin shows the stored file as it is; next/image is for the public pages.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.thumb} src={value.url} alt={value.alt ?? ""} />
          ) : null}
          <a href={value.url} target="_blank" rel="noopener noreferrer">
            {value.fileName ?? value.pathname.split("/").pop()}
          </a>
        </div>
      ) : (
        <span className={styles.muted}>No file.</span>
      )}
      <div className={styles.row}>
        <label htmlFor={inputId} className={styles.muted}>
          {value ? "Replace with" : (props.addText ?? "Upload")}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          aria-label={`${value ? "Replace" : "Upload"} ${label}`}
          disabled={!hydrated || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        {value && onRemove ? (
          <button type="button" className={`${styles.button} ${styles.small} ${styles.danger}`} onClick={() => void remove()} disabled={uploading}>
            Remove file
          </button>
        ) : null}
      </div>
      {state.kind === "uploading" ? (
        <span role="status" className={styles.row}>
          Uploading... {state.percent}%
          <progress className={styles.progress} max={100} value={state.percent} />
        </span>
      ) : null}
      {state.kind === "refused" ? (
        <span role="alert" className={styles.error} data-testid="upload-error">
          {state.message}
        </span>
      ) : null}
      {state.kind === "failed" ? (
        <span role="alert" className={styles.error} data-testid="upload-error">
          Upload failed. The draft is unchanged.{" "}
          <button type="button" className={`${styles.button} ${styles.small}`} onClick={() => void send(state.file)}>
            Retry
          </button>
        </span>
      ) : null}
    </div>
  );
}
