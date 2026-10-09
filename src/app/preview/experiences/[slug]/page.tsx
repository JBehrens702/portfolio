import { notFound } from "next/navigation";
import { PreviewMarker } from "@/components/site/PreviewMarker";
import { ExperienceView } from "@/components/site/SiteView";
import { requireOwnerPage } from "@/lib/auth/owner";
import { createContentStoreFromEnv } from "@/lib/content/store";
import { visibleSite } from "@/lib/content/visibility";

interface Props {
  params: Promise<{ slug: string }>;
}

// The preview of one experience page, from the DRAFT. An unknown slug gives 404.

// Owner check and an uncached draft read on every request; never prerendered.
export const instant = false;

export default async function PreviewExperience({ params }: Props) {
  await requireOwnerPage();
  const { slug } = await params;
  const draft = (await createContentStoreFromEnv()?.readDraft()) ?? null;
  const site = draft ? visibleSite(draft) : null;
  const experience = site?.experiences.find((e) => e.slug === slug);
  if (!site || !experience) notFound();
  return (
    <>
      <PreviewMarker site={site} />
      <ExperienceView site={site} experience={experience} linkBase="/preview" />
    </>
  );
}
