import { z } from "zod";
import { upgradeBlocks } from "./layout";

// The content document. Every save and every publish validates against this schema.
// Optional text may be empty: the visibility function hides what is empty (KTD7).

const nonBlank = (what: string) =>
  z.string().refine((value) => value.trim().length > 0, { message: `${what} must not be empty` });

const optionalHttpUrl = z.union([z.literal(""), z.httpUrl()]).optional();

export const MediaSchema = z.object({
  url: z.url({ protocol: /^https$/, hostname: z.regexes.domain }),
  pathname: z.string().min(1),
  contentType: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  // Alt text that the owner writes. Never generated (1.2.4).
  alt: z.string().optional(),
  // The original file name, used as the download name.
  fileName: z.string().optional(),
});

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const blockId = z.string().min(1).max(64);

export const HeadingBlockSchema = z.object({
  id: blockId,
  type: z.literal("heading"),
  text: z.string(),
  level: z.union([z.literal(2), z.literal(3)]),
});

export const TextBlockSchema = z.object({
  id: blockId,
  type: z.literal("text"),
  // A small Markdown subset: paragraphs and links only (KTD5).
  text: z.string(),
});

export const FactsBlockSchema = z.object({
  id: blockId,
  type: z.literal("facts"),
  items: z.array(z.object({ label: z.string(), value: z.string() })),
});

export const ImageItemSchema = z.object({
  image: MediaSchema.optional(),
});

export const ImagesBlockSchema = z.object({
  id: blockId,
  type: z.literal("images"),
  items: z.array(ImageItemSchema),
  caption: z.string().optional(),
  // A click on an image opens it larger. Absent means on; the editor stores only `false`.
  enlarge: z.boolean().optional(),
});

export const FileBlockSchema = z.object({
  id: blockId,
  type: z.literal("file"),
  label: z.string(),
  file: MediaSchema.optional(),
});

export const QuoteBlockSchema = z.object({
  id: blockId,
  type: z.literal("quote"),
  text: z.string(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  HeadingBlockSchema,
  TextBlockSchema,
  FactsBlockSchema,
  ImagesBlockSchema,
  FileBlockSchema,
  QuoteBlockSchema,
]);

/** A block that sits in a cell of a row: every block type except a heading. */
export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  FactsBlockSchema,
  ImagesBlockSchema,
  FileBlockSchema,
  QuoteBlockSchema,
]);

// Row presets (KTD1, 2.4.11). The number is the count of cells.
export const ROW_LAYOUTS = ["one", "halves", "third-two", "two-third"] as const;
export type RowLayout = (typeof ROW_LAYOUTS)[number];
export const ROW_COLUMNS: Record<RowLayout, number> = { one: 1, halves: 2, "third-two": 2, "two-third": 2 };

export const RowSchema = z.object({
  id: blockId,
  type: z.literal("row"),
  layout: z.enum(ROW_LAYOUTS),
  // One list of blocks per column, left to right.
  cells: z.array(z.array(ContentBlockSchema)),
});

export const SlideSchema = z.object({
  id: blockId,
  image: MediaSchema.optional(),
  // A small Markdown subset, as in a text block (KTD5).
  text: z.string(),
});

// Always a full row of its own (0.1.13).
export const CarouselSchema = z.object({
  id: blockId,
  type: z.literal("carousel"),
  slides: z.array(SlideSchema),
});

/** One entry of a page layout: a section heading, a row, or a carousel (KTD1). */
export const LayoutItemSchema = z.discriminatedUnion("type", [HeadingBlockSchema, RowSchema, CarouselSchema]);

const experienceFields = {
  slug: z.string().regex(SLUG_PATTERN, "slug must use only a-z, 0-9, and single hyphens"),
  // The "Selected Work" card label on the home page.
  homeTitle: nonBlank("homeTitle"),
  // The heading of the full page.
  pageTitle: nonBlank("pageTitle"),
  subtitle: z.string().optional(),
  cardImage: MediaSchema.optional(),
  skills: z.array(z.string()),
  // The owner's first paragraph, shown on the home page.
  homeText: z.string(),
};

function checkUnique(ids: { id: string; path: (string | number)[] }[], what: string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const { id, path } of ids) {
    if (seen.has(id)) ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate ${what} id "${id}"` });
    seen.add(id);
  }
}

export const ExperienceSchema = z.object({ ...experienceFields, layout: z.array(LayoutItemSchema) }).superRefine((experience, ctx) => {
  checkUnique(
    experience.layout.map((item, i) => ({ id: item.id, path: ["layout", i] })),
    "layout item",
    ctx,
  );
  const blocks: { id: string; path: (string | number)[] }[] = [];
  experience.layout.forEach((item, i) => {
    if (item.type === "row") {
      const columns = ROW_COLUMNS[item.layout];
      if (item.cells.length !== columns) {
        ctx.addIssue({
          code: "custom",
          path: ["layout", i, "cells"],
          message: `a "${item.layout}" row has ${columns} cell(s), not ${item.cells.length}`,
        });
      }
      item.cells.forEach((cell, c) => cell.forEach((block, b) => blocks.push({ id: block.id, path: ["layout", i, "cells", c, b] })));
    }
    if (item.type === "carousel") {
      checkUnique(
        item.slides.map((slide, s) => ({ id: slide.id, path: ["layout", i, "slides", s] })),
        "slide",
        ctx,
      );
    }
  });
  checkUnique(blocks, "block", ctx);
});

// Version 1 (until 2026-10): a flat list of blocks per experience. Read only, and
// upgraded at once to version 2 (KTD2).
const ExperienceV1Schema = z.object({ ...experienceFields, blocks: z.array(BlockSchema) }).superRefine((experience, ctx) => {
  checkUnique(
    experience.blocks.map((block, i) => ({ id: block.id, path: ["blocks", i] })),
    "block",
    ctx,
  );
});

export const SoftwareCardSchema = z.object({
  id: z.string().regex(SLUG_PATTERN, "id must use only a-z, 0-9, and single hyphens"),
  name: nonBlank("name"),
  overview: z.string().optional(),
  screenshot: MediaSchema.optional(),
  link: optionalHttpUrl,
});

export const LabelSchema = z.object({
  text: z.string(),
  approved: z.boolean(),
});

export const LABEL_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

const siteFields = {
  profile: z.object({
    name: nonBlank("name"),
    tagline: z.string(),
    heroPhoto: MediaSchema.optional(),
    introParagraphs: z.array(z.string()),
    resumeFile: MediaSchema.optional(),
  }),
  // The contact heading is the label "contactHeading" in `labels` (KTD9).
  contact: z.object({
    linkedin: optionalHttpUrl,
    email: z.union([z.literal(""), z.email()]).optional(),
    rise: optionalHttpUrl,
  }),
  labels: z.record(z.string().regex(LABEL_KEY_PATTERN, "label key must be a short identifier"), LabelSchema),
  software: z.array(SoftwareCardSchema),
};

function checkSite(site: { experiences: { slug: string }[]; software: { id: string }[] }, ctx: z.RefinementCtx): void {
  const slugs = new Set<string>();
  site.experiences.forEach((experience, index) => {
    if (slugs.has(experience.slug)) {
      ctx.addIssue({
        code: "custom",
        path: ["experiences", index, "slug"],
        message: `duplicate experience slug "${experience.slug}"`,
      });
    }
    slugs.add(experience.slug);
  });
  checkUnique(
    site.software.map((card, index) => ({ id: card.id, path: ["software", index] })),
    "software",
    ctx,
  );
}

export const SiteSchema = z
  .object({ schemaVersion: z.literal(2), ...siteFields, experiences: z.array(ExperienceSchema) })
  .superRefine(checkSite);

const SiteV1Schema = z
  .object({ schemaVersion: z.literal(1), ...siteFields, experiences: z.array(ExperienceV1Schema) })
  .superRefine(checkSite);

export type Media = z.infer<typeof MediaSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type FactsBlock = z.infer<typeof FactsBlockSchema>;
export type ImageItem = z.infer<typeof ImageItemSchema>;
export type ImagesBlock = z.infer<typeof ImagesBlockSchema>;
export type FileBlock = z.infer<typeof FileBlockSchema>;
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block["type"];
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type ContentBlockType = ContentBlock["type"];
export type Row = z.infer<typeof RowSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Carousel = z.infer<typeof CarouselSchema>;
export type LayoutItem = z.infer<typeof LayoutItemSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type SoftwareCard = z.infer<typeof SoftwareCardSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type Site = z.infer<typeof SiteSchema>;

export type ParseResult = { ok: true; site: Site } | { ok: false; issues: string[] };

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function isVersion1(input: unknown): boolean {
  return typeof input === "object" && input !== null && (input as { schemaVersion?: unknown }).schemaVersion === 1;
}

/**
 * Validates an unknown value as a content document. Each issue reads "path: message".
 * A valid version-1 document is upgraded to version 2 (KTD2), so every reader and
 * every write sees version 2 only.
 */
export function parseSite(input: unknown): ParseResult {
  if (isVersion1(input)) {
    const old = SiteV1Schema.safeParse(input);
    if (!old.success) return { ok: false, issues: issuesOf(old.error) };
    const { experiences, ...rest } = old.data;
    input = {
      ...rest,
      schemaVersion: 2,
      experiences: experiences.map(({ blocks, ...fields }) => ({ ...fields, layout: upgradeBlocks(blocks) })),
    };
  }
  const result = SiteSchema.safeParse(input);
  return result.success ? { ok: true, site: result.data } : { ok: false, issues: issuesOf(result.error) };
}

/** Thrown when a document fails validation on save, read, or publish. */
export class ContentValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[], what = "content document") {
    super(`Invalid ${what}:\n${issues.join("\n")}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

/** Validates or throws ContentValidationError. */
export function assertSite(input: unknown, what?: string): Site {
  const result = parseSite(input);
  if (!result.ok) throw new ContentValidationError(result.issues, what);
  return result.site;
}

/** The keys of the labels that are not approved, sorted (KTD9). */
export function unapprovedLabels(site: Site): string[] {
  return Object.entries(site.labels)
    .filter(([, label]) => !label.approved)
    .map(([key]) => key)
    .sort();
}
