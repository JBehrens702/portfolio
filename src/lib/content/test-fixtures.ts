// Small valid documents for the content tests. Not used by the site itself.
import { upgradeBlocks } from "./layout";
import type { Block, Experience, HeadingBlock, Media, Site, SoftwareCard, TextBlock } from "./schema";

export function media(name = "photo.jpg", extra: Partial<Media> = {}): Media {
  return {
    url: `https://example.public.blob.vercel-storage.com/site/media/${name}`,
    pathname: `site/media/${name}`,
    contentType: name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    ...extra,
  };
}

/**
 * An experience. `blocks` is a short way to write a layout: the blocks are laid out
 * as the version-1 upgrade lays them out (KTD3).
 */
export function experience(slug: string, extra: Partial<Experience> & { blocks?: Block[] } = {}): Experience {
  const { blocks, ...rest } = extra;
  return {
    slug,
    homeTitle: `Home ${slug}`,
    pageTitle: `Page ${slug}`,
    skills: ["CAD"],
    homeText: `First paragraph of ${slug}.`,
    cardImage: media(`${slug}.jpg`),
    layout: blocks ? upgradeBlocks(blocks) : [],
    ...rest,
  };
}

export function software(id: string, extra: Partial<SoftwareCard> = {}): SoftwareCard {
  return { id, name: `Software ${id}`, overview: `Overview of ${id}.`, ...extra };
}

export function textBlock(id: string, text: string): TextBlock {
  return { id, type: "text", text };
}

export function headingBlock(id: string, text: string, level: 2 | 3 = 2): HeadingBlock {
  return { id, type: "heading", text, level };
}

export function makeSite(extra: Partial<Site> = {}): Site {
  return {
    schemaVersion: 2,
    profile: {
      name: "Jonathan Behrens",
      tagline: "Mechanical engineering student",
      introParagraphs: ["Intro one.", "Intro two."],
    },
    contact: {
      linkedin: "https://www.linkedin.com/in/example/",
      email: "owner@example.com",
      rise: "https://app.joinrise.co/professional/example",
    },
    labels: {
      selectedWork: { text: "Selected Work", approved: true },
      nextExperience: { text: "Next Experience", approved: true },
    },
    experiences: [experience("first"), experience("second"), experience("third")],
    software: [software("dashboard"), software("unquotable", { link: "https://unquotable.626house.casa" })],
    ...extra,
  };
}
