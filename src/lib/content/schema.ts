import { z } from "zod";

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

export const ExperienceSchema = z
  .object({
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
    blocks: z.array(BlockSchema),
  })
  .superRefine((experience, ctx) => {
    const seen = new Set<string>();
    experience.blocks.forEach((block, index) => {
      if (seen.has(block.id)) {
        ctx.addIssue({ code: "custom", path: ["blocks", index, "id"], message: `duplicate block id "${block.id}"` });
      }
      seen.add(block.id);
    });
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

export const SiteSchema = z
  .object({
    schemaVersion: z.literal(1),
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
    experiences: z.array(ExperienceSchema),
    software: z.array(SoftwareCardSchema),
  })
  .superRefine((site, ctx) => {
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
    const ids = new Set<string>();
    site.software.forEach((card, index) => {
      if (ids.has(card.id)) {
        ctx.addIssue({ code: "custom", path: ["software", index, "id"], message: `duplicate software id "${card.id}"` });
      }
      ids.add(card.id);
    });
  });

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
export type Experience = z.infer<typeof ExperienceSchema>;
export type SoftwareCard = z.infer<typeof SoftwareCardSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type Site = z.infer<typeof SiteSchema>;

export type ParseResult = { ok: true; site: Site } | { ok: false; issues: string[] };

/** Validates an unknown value as a content document. Each issue reads "path: message". */
export function parseSite(input: unknown): ParseResult {
  const result = SiteSchema.safeParse(input);
  if (result.success) return { ok: true, site: result.data };
  const issues = result.error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, issues };
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
