import type { ReactNode } from "react";
import type { ContentBlock, Row, RowLayout } from "@/lib/content/schema";
import { Block, type ImagesVariant, type ZoomLabels } from "./Block";
import styles from "./Experience.module.css";

// The parts of a page layout that the site and the editor share (KTD6). The
// style of a cell follows its content, as the automatic layout did before rows
// (KTD4): a cell with a fact list is the light fact panel, and its images are
// small logos; images in a cell of a two-column row fill that cell; everything
// else flows as in a single column.

export type CellKind = "panel" | "media" | "flow";

const ROW_CLASS: Record<RowLayout, string> = {
  one: styles.rowOne,
  halves: styles.rowHalves,
  "third-two": styles.rowThirdTwo,
  "two-third": styles.rowTwoThird,
};

/** The class of a row's grid for its preset. */
export function rowClassName(row: Row): string {
  return `${styles.row} ${ROW_CLASS[row.layout]}`;
}

export function cellKind(row: Row, cell: ContentBlock[]): CellKind {
  if (cell.some((block) => block.type === "facts")) return "panel";
  if (row.cells.length > 1 && cell.length > 0 && cell.every((block) => block.type === "images")) return "media";
  return "flow";
}

const CELL_CLASS: Record<CellKind, string> = { panel: styles.panel, media: styles.spreadMedia, flow: styles.cell };

/** The class of a cell's frame; a panel also reveals itself on scroll. */
export function cellFrameProps(kind: CellKind): { className: string; "data-reveal"?: string } {
  return kind === "panel" ? { className: CELL_CLASS.panel, "data-reveal": "" } : { className: CELL_CLASS[kind] };
}

export function imagesVariant(kind: CellKind): ImagesVariant {
  return kind === "panel" ? "logo" : kind === "media" ? "spread" : "flow";
}

interface RowProps {
  /** A row from visibleSite(): hidden blocks are gone, empty cells stay (KTD5). */
  row: Row;
  linkBase: string;
  downloadLabel: string | null;
  /** The image enlarge labels, or null (the editor, or a label that is missing). */
  zoom?: ZoomLabels | null;
}

function Blocks({ blocks, kind, linkBase, downloadLabel, zoom }: { blocks: ContentBlock[]; kind: CellKind } & Omit<RowProps, "row">) {
  return blocks.map((block) => (
    <Block
      key={block.id}
      block={block}
      linkBase={linkBase}
      downloadLabel={downloadLabel}
      variant={imagesVariant(kind)}
      zoom={zoom}
    />
  ));
}

/**
 * One row of an experience page. A one-column row of flowing blocks adds no
 * wrapper, so its blocks sit in the page column exactly as single blocks did.
 */
export function LayoutRow({ row, linkBase, downloadLabel, zoom = null }: RowProps): ReactNode {
  if (row.layout === "one") {
    const [cell] = row.cells;
    const kind = cellKind(row, cell);
    if (kind === "flow") {
      return <Blocks blocks={cell} kind={kind} linkBase={linkBase} downloadLabel={downloadLabel} zoom={zoom} />;
    }
    return (
      <div className={rowClassName(row)}>
        <div {...cellFrameProps(kind)}>
          <Blocks blocks={cell} kind={kind} linkBase={linkBase} downloadLabel={downloadLabel} zoom={zoom} />
        </div>
      </div>
    );
  }
  return (
    <div className={rowClassName(row)}>
      {row.cells.map((cell, i) => {
        const kind = cellKind(row, cell);
        return (
          <div key={i} {...cellFrameProps(kind)} data-empty={cell.length === 0 ? "" : undefined}>
            <Blocks blocks={cell} kind={kind} linkBase={linkBase} downloadLabel={downloadLabel} zoom={zoom} />
          </div>
        );
      })}
    </div>
  );
}
