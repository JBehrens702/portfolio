import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperienceView } from "@/components/site/SiteView";
import { getPublishedSite } from "@/lib/content/public";
import { visibleSite } from "@/lib/content/visibility";

interface Props {
  params: Promise<{ slug: string }>;
}

// With Cache Components, generateStaticParams must return at least one value.
// This placeholder is never a valid slug (slugs use only a-z, 0-9, and "-"), so
// it renders the 404 page.
const NO_EXPERIENCE = "__none__";

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const site = await getPublishedSite();
  const slugs = site?.experiences.map((experience) => ({ slug: experience.slug })) ?? [];
  return slugs.length > 0 ? slugs : [{ slug: NO_EXPERIENCE }];
}

async function findExperience(slug: string) {
  const published = await getPublishedSite();
  if (!published) return null;
  const site = visibleSite(published);
  const experience = site.experiences.find((e) => e.slug === slug);
  return experience ? { site, experience } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findExperience((await params).slug);
  return found ? { title: found.experience.pageTitle } : {};
}

// This route may block: an unknown slug must return a real 404 status, which
// needs notFound() before streaming starts. Known slugs are prerendered by
// generateStaticParams, so their navigations are still served from the cache.
export const instant = false;

// The slug is awaited outside any Suspense boundary, so an unknown slug calls
// notFound() before streaming starts and the response status is 404.
export default async function ExperienceRoute({ params }: Props) {
  const found = await findExperience((await params).slug);
  if (!found) notFound();
  return <ExperienceView site={found.site} experience={found.experience} linkBase="/" />;
}
