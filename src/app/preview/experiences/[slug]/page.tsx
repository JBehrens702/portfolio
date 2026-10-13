import { notFound } from "next/navigation";
import { PageBar } from "@/components/admin/PageBar";
import { barPages } from "@/components/admin/page-bar-model";
import { PreviewMarker } from "@/components/site/PreviewMarker";
import { ExperienceView } from "@/components/site/SiteView";
import { readDraftOrNull } from "@/app/admin/draft";
import { requireOwnerPage } from "@/lib/auth/owner";
import { visibleSite } from "@/lib/content/visibility";
import { isFramedRequest } from "../../framed";

interface Props {
  params: Promise<{ slug: string }>;
}

// The preview of one experience page, from the DRAFT. An unknown slug gives 404.

// Owner check and an uncached draft read on every request; never prerendered.
export const instant = false;

export default async function PreviewExperience({ params }: Props) {
  await requireOwnerPage();
  const { slug } = await params;
  const draft = await readDraftOrNull();
  const site = draft ? visibleSite(draft) : null;
  const experience = site?.experiences.find((e) => e.slug === slug);
  if (!site || !experience) notFound();
  return (
    <>
      <PageBar pages={barPages(site)} current={slug} mode="preview" framed={await isFramedRequest()} />
      <PreviewMarker site={site} />
      <ExperienceView site={site} experience={experience} linkBase="/preview" />
    </>
  );
}
