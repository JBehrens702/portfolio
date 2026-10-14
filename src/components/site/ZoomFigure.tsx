"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import styles from "./Experience.module.css";

export interface ZoomFigureProps {
  className: string;
  /** The approved "Close" label. */
  closeLabel: string;
  /** The large copy of each image, by the `data-zoom` index of its button. */
  large: ReactNode[];
  children: ReactNode;
}

/**
 * The figure of an images block whose images open larger. The buttons inside
 * (rendered on the server) carry `data-zoom`; a click on one shows its large
 * copy in a modal dialog. The dialog closes with Escape, the close button, or a
 * click beside the image, and the browser then returns focus to the button.
 */
export function ZoomFigure({ className, closeLabel, large, children }: ZoomFigureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  const open = (event: MouseEvent<HTMLElement>) => {
    const trigger = (event.target as Element).closest<HTMLElement>("[data-zoom]");
    if (!trigger || !event.currentTarget.contains(trigger)) return;
    setShown(Number(trigger.dataset.zoom));
    dialog.current?.showModal();
  };

  return (
    <figure className={className} onClick={open}>
      {children}
      <dialog
        ref={dialog}
        className={styles.zoom}
        onClose={() => setShown(null)}
        onClick={(event) => {
          event.stopPropagation();
          // The dialog itself is the space around the image (and the backdrop).
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button type="button" className={styles.zoomClose} onClick={() => dialog.current?.close()}>
          <CloseIcon className={styles.zoomCloseIcon} />
          {closeLabel}
        </button>
        {shown !== null && large[shown]}
      </dialog>
    </figure>
  );
}
