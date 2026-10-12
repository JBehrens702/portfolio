"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type ReactNode } from "react";
import { layoutIds } from "@/lib/content/layout";
import {
  addBlockToCell,
  dropBeside,
  dropBetween,
  findBox,
  mapBlock,
  moveBox,
  moveBoxStep,
  moveItem,
  removeBoxAt,
  removeItem,
  setRowLayout,
  type BoxRef,
} from "@/lib/content/layout-edit";
import { move, newBlock } from "@/lib/content/order";
import { ROW_LAYOUTS, type Block, type ContentBlock, type ContentBlockType, type LayoutItem, type Row, type RowLayout } from "@/lib/content/schema";
import { cellFrameProps, cellKind, rowClassName } from "@/components/site/LayoutRow";
import { sectionItems } from "@/components/site/segments";
import siteStyles from "@/components/site/Experience.module.css";
import { BLOCK_TYPES, BlockFields, blockHoldsContent, blockName, blockTypeName } from "./BlockEditor";
import { CarouselEditor, type LayoutEdit } from "./CarouselEditor";
import { OrderButtons } from "./OrderButtons";
import styles from "./admin.module.css";

// The layout of an experience page in its real structure and style (2.4.9,
// KTD6): sections with the heading column at the left and rows at the right,
// each row with the columns the owner chose (2.4.11), and each block's fields
// inside its box. Rows, headings, carousels, and boxes move by drag (2.4.10,
// KTD7) or by the Up and Down buttons, which a phone uses (2.4.16).

export const ROW_LAYOUT_NAMES: Record<RowLayout, string> = {
  one: "One column",
  halves: "Halves",
  "third-two": "One third + two thirds",
  "two-third": "Two thirds + one third",
};

const CONTENT_TYPES = BLOCK_TYPES.filter((t) => t.type !== "heading") as { type: ContentBlockType; name: string }[];

export interface LayoutEditorProps {
  layout: LayoutItem[];
  /** A change that marks the page unsaved. */
  edit: LayoutEdit;
  /** A file change: saved into the draft at once. */
  editAndSave: LayoutEdit;
  mediaPrefix: string;
  confirm: (question: string) => Promise<boolean>;
  beginUpload: () => void;
  endUpload: () => void;
}

type Kind = "item" | "box";
const kindOf = (id: unknown): string => String(id).split(":")[0];
const restOf = (id: unknown): string => String(id).slice(String(id).indexOf(":") + 1);

/** While a box moves, the most specific target under the pointer wins; otherwise the nearest. */
const PRIORITY = ["beside", "between", "box", "cell", "item"];
const collision: CollisionDetection = (args) => {
  const dragging = kindOf(args.active.id);
  const allowed = dragging === "item" ? ["item", "between"] : ["box", "cell", "beside", "between"];
  const droppableContainers = args.droppableContainers.filter(
    (c) => allowed.includes(kindOf(c.id)) && c.id !== args.active.id,
  );
  const within = pointerWithin({ ...args, droppableContainers });
  if (within.length > 0) return [...within].sort((a, b) => PRIORITY.indexOf(kindOf(a.id)) - PRIORITY.indexOf(kindOf(b.id)));
  return closestCenter({ ...args, droppableContainers });
};

export function LayoutEditor(props: LayoutEditorProps) {
  const { layout, edit } = props;
  const [dragging, setDragging] = useState<Kind | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Keyboard moves (2.4.17, MAY): Space to lift, arrows to move, Space to drop.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const index = new Map(layout.map((item, i) => [item.id, i]));
  const ids = layoutIds(layout);
  // The boxes in reading order, for the Up and Down buttons.
  const boxOrder = layout.flatMap((item) => (item.type === "row" ? item.cells.flat().map((b) => b.id) : []));

  const onDragStart = (event: DragStartEvent) => setDragging(kindOf(event.active.id) === "item" ? "item" : "box");
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const target = kindOf(over.id);
    if (kindOf(active.id) === "item") {
      const from = index.get(restOf(active.id));
      if (from === undefined) return;
      if (target === "item") {
        const to = index.get(restOf(over.id));
        if (to !== undefined) edit((items) => moveItem(items, from, to));
      } else if (target === "between") {
        const at = Number(restOf(over.id));
        edit((items) => moveItem(items, from, at > from ? at - 1 : at));
      }
      return;
    }
    const blockId = restOf(active.id);
    edit((items) => {
      const from = findBox(items, blockId);
      if (!from) return items;
      if (target === "box") {
        const to = findBox(items, restOf(over.id));
        if (!to) return items;
        const sameCell = to.row === from.row && to.cell === from.cell;
        return moveBox(items, from, { ...to, index: sameCell && from.index < to.index ? to.index + 1 : to.index });
      }
      if (target === "cell") {
        const rest = restOf(over.id);
        const row = rest.slice(0, rest.lastIndexOf(":"));
        const cell = Number(rest.slice(rest.lastIndexOf(":") + 1));
        const size = (items.find((item) => item.id === row) as Row | undefined)?.cells[cell]?.length ?? 0;
        return moveBox(items, from, { row, cell, index: size });
      }
      if (target === "beside") return dropBeside(items, from, restOf(over.id));
      if (target === "between") return dropBetween(items, from, Number(restOf(over.id)), layoutIds(items));
      return items;
    });
  };

  const names = itemNames(layout);
  const frame = (item: LayoutItem, children: ReactNode, tools?: ReactNode) => (
    <ItemFrame
      key={item.id}
      item={item}
      name={names.get(item.id)!}
      index={index.get(item.id)!}
      count={layout.length}
      onMove={(d) => edit((items) => move(items, items.findIndex((i) => i.id === item.id), d))}
      onRemove={async () => {
        const holds = item.type === "heading" ? blockHoldsContent(item) : item.type === "row" ? item.cells.flat().length > 0 : item.slides.length > 0;
        if (!holds || (await props.confirm(`Remove the ${names.get(item.id)}?`))) edit((items) => removeItem(items, item.id));
      }}
      tools={tools}
    >
      {children}
    </ItemFrame>
  );

  const boxProps = (row: Row): Omit<BoxEditorProps, "block" | "box"> => ({
    ...props,
    row,
    position: (id) => boxOrder.indexOf(id),
    total: boxOrder.length,
  });

  const sections = sectionItems(layout);
  const zone = (at: number) => <BetweenZone key={`between-${at}`} at={at} active={dragging !== null} />;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <SortableContext items={layout.map((item) => `item:${item.id}`)} strategy={verticalListSortingStrategy}>
        <div className={`${siteStyles.body} ${styles.layoutCanvas}`} data-testid="layout-editor" data-dragging={dragging ?? undefined}>
          {sections.length === 0 && <p className={styles.muted}>This page has no content yet. Add a block below.</p>}
          {sections.map((section, s) => {
            const first = section.headings.length > 0 ? index.get(section.headings[section.headings.length - 1].id)! + 1 : 0;
            const end = section.items.length > 0 ? index.get(section.items[section.items.length - 1].id)! + 1 : first;
            return (
              <div key={section.headings[0]?.id ?? `lead-${s}`} className={siteStyles.segment}>
                {section.headings.length > 0 && (
                  <div className={siteStyles.rail}>
                    <div className={styles.railEdit}>
                      {section.headings.map((heading) =>
                        frame(
                          heading,
                          <BlockFields
                            block={heading}
                            onChange={(f) => edit((items) => mapBlock(items, heading.id, f), `block:${heading.id}`)}
                            onFileChange={(f) => props.editAndSave((items) => mapBlock(items, heading.id, f))}
                            mediaPrefix={props.mediaPrefix}
                            confirm={props.confirm}
                            beginUpload={props.beginUpload}
                            endUpload={props.endUpload}
                          />,
                        ),
                      )}
                    </div>
                  </div>
                )}
                <div className={siteStyles.main}>
                  {zone(first)}
                  {section.items.map((item) => (
                    <div key={item.id} className={styles.stackTight}>
                      {item.type === "row"
                        ? frame(item, <RowEditor dragging={dragging} {...boxProps(item)} />, <RowLayoutPicker row={item} edit={edit} name={names.get(item.id)!} />)
                        : frame(item, <CarouselEditor carousel={item} takenIds={ids} {...props} />)}
                      {zone(index.get(item.id)! + 1)}
                    </div>
                  ))}
                  {section.items.length === 0 && end !== first && zone(end)}
                </div>
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** Owner-facing names: a heading by its text, rows and carousels by their number on the page. */
function itemNames(layout: LayoutItem[]): Map<string, string> {
  const names = new Map<string, string>();
  let rows = 0;
  let carousels = 0;
  for (const item of layout) {
    if (item.type === "heading") names.set(item.id, blockName(item));
    else if (item.type === "row") names.set(item.id, `row ${++rows}`);
    else names.set(item.id, `carousel ${++carousels}`);
  }
  return names;
}

type Sortable = ReturnType<typeof useSortable>;

/** The values of useSortable that a frame renders. Taking them one by one keeps the hook's refs out of render. */
function useSortableFrame(id: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return {
    handle: { activator: setActivatorNodeRef, attributes, listeners },
    frame: {
      ref: setNodeRef,
      style: { transform: CSS.Translate.toString(transform), transition },
      "data-lifted": isDragging ? "" : undefined,
    },
  };
}

function DragHandle({
  label,
  activator,
  attributes,
  listeners,
}: {
  label: string;
  activator: Sortable["setActivatorNodeRef"];
  attributes: Sortable["attributes"];
  listeners: Sortable["listeners"];
}) {
  return (
    <button type="button" ref={activator} className={styles.dragHandle} aria-label={label} {...attributes} {...listeners}>
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

function ItemFrame(props: {
  item: LayoutItem;
  name: string;
  index: number;
  count: number;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const { handle, frame } = useSortableFrame(`item:${props.item.id}`);
  const label = props.name.charAt(0).toUpperCase() + props.name.slice(1);
  return (
    <div {...frame} className={styles.itemFrame} data-testid="layout-item" data-item-type={props.item.type}>
      <div className={styles.itemBar}>
        <DragHandle label={`Drag the ${props.name}`} {...handle} />
        <span className={styles.itemName}>{label}</span>
        {props.tools}
        <OrderButtons name={`the ${props.name}`} index={props.index} count={props.count} onMove={props.onMove} />
        <button
          type="button"
          className={`${styles.button} ${styles.small} ${styles.danger}`}
          aria-label={`Remove the ${props.name}`}
          onClick={props.onRemove}
        >
          Remove
        </button>
      </div>
      {props.children}
    </div>
  );
}

function RowLayoutPicker({ row, edit, name }: { row: Row; edit: LayoutEdit; name: string }) {
  return (
    <label className={styles.row}>
      <span className={styles.muted}>Columns</span>
      <select
        className={styles.select}
        aria-label={`Columns of the ${name}`}
        value={row.layout}
        onChange={(e) => {
          const layout = e.target.value as RowLayout;
          edit((items) => setRowLayout(items, row.id, layout));
        }}
      >
        {ROW_LAYOUTS.map((layout) => (
          <option key={layout} value={layout}>
            {ROW_LAYOUT_NAMES[layout]}
          </option>
        ))}
      </select>
    </label>
  );
}

function BetweenZone({ at, active }: { at: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `between:${at}` });
  return <div ref={setNodeRef} className={styles.betweenZone} data-active={active ? "" : undefined} data-over={isOver ? "" : undefined} aria-hidden="true" />;
}

interface BoxEditorProps extends Omit<LayoutEditorProps, "layout"> {
  row: Row;
  block: ContentBlock;
  box: BoxRef;
  /** The box's place among all boxes in reading order, for the Up and Down buttons. */
  position: (id: string) => number;
  total: number;
}

function RowEditor(props: Omit<BoxEditorProps, "block" | "box"> & { dragging: Kind | null }) {
  const { row, dragging } = props;
  return (
    <div className={`${rowClassName(row)} ${styles.rowEdit}`} data-testid="row" data-row-layout={row.layout}>
      {row.cells.map((cell, c) => (
        <CellEditor key={c} {...props} cell={cell} cellIndex={c} />
      ))}
      {row.layout === "one" && dragging === "box" && <BesideZone rowId={row.id} />}
    </div>
  );
}

function BesideZone({ rowId }: { rowId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `beside:${rowId}` });
  return (
    <div ref={setNodeRef} className={styles.besideZone} data-over={isOver ? "" : undefined} data-testid="drop-beside">
      <span>Drop beside</span>
    </div>
  );
}

function CellEditor(props: Omit<BoxEditorProps, "block" | "box"> & { cell: ContentBlock[]; cellIndex: number }) {
  const { row, cell, cellIndex, edit } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${row.id}:${cellIndex}` });
  const [type, setType] = useState<ContentBlockType>("text");
  // The cell keeps the site's frame (panel, image column, or flow), without the scroll reveal.
  const { className } = cellFrameProps(cellKind(row, cell));
  const where = row.cells.length > 1 ? `${cellIndex === 0 ? "left" : "right"} cell` : "row";
  return (
    <div ref={setNodeRef} className={`${className} ${styles.cellEdit}`} data-over={isOver ? "" : undefined} data-testid="cell">
      <SortableContext items={cell.map((b) => `box:${b.id}`)} strategy={verticalListSortingStrategy}>
        {cell.map((block, i) => (
          <BoxEditor key={block.id} {...props} block={block} box={{ row: row.id, cell: cellIndex, index: i }} />
        ))}
      </SortableContext>
      {cell.length === 0 && <p className={styles.cellEmpty}>Empty cell: drop a block here, or add one.</p>}
      <div className={styles.cellAdd}>
        <select className={styles.select} aria-label={`Block type for this ${where}`} value={type} onChange={(e) => setType(e.target.value as ContentBlockType)}>
          {CONTENT_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${styles.button} ${styles.small}`}
          onClick={() => edit((items) => addBlockToCell(items, row.id, cellIndex, newBlock(type, layoutIds(items))))}
        >
          Add to {where}
        </button>
      </div>
    </div>
  );
}

function BoxEditor(props: BoxEditorProps) {
  const { block, box, edit, confirm } = props;
  const { handle, frame } = useSortableFrame(`box:${block.id}`);
  const name = blockName(block);
  const change = (save: boolean) => (f: (b: Block) => Block) =>
    (save ? props.editAndSave : edit)((items) => mapBlock(items, block.id, f), save ? undefined : `block:${block.id}`);
  return (
    <div {...frame} className={styles.box} data-testid="block" data-block-type={block.type}>
      <div className={styles.itemBar}>
        <DragHandle label={`Drag the ${name}`} {...handle} />
        <span className={styles.itemName}>{blockTypeName(block.type)}</span>
        <OrderButtons
          name={`the ${name}`}
          index={props.position(block.id)}
          count={props.total}
          onMove={(d) => edit((items) => moveBoxStep(items, findBox(items, block.id) ?? box, d))}
        />
        <button
          type="button"
          className={`${styles.button} ${styles.small} ${styles.danger}`}
          aria-label={`Remove the ${name}`}
          onClick={async () => {
            if (!blockHoldsContent(block) || (await confirm(`Remove the ${name}?`))) {
              edit((items) => {
                const at = findBox(items, block.id);
                return at ? removeBoxAt(items, at) : items;
              });
            }
          }}
        >
          Remove block
        </button>
      </div>
      <BlockFields
        block={block}
        onChange={change(false)}
        onFileChange={change(true)}
        mediaPrefix={props.mediaPrefix}
        confirm={confirm}
        beginUpload={props.beginUpload}
        endUpload={props.endUpload}
      />
    </div>
  );
}
