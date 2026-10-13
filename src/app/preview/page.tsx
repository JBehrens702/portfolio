import { PageBar } from "@/components/admin/PageBar";
import { barPages, HOME_ID } from "@/components/admin/page-bar-model";
import { PreviewMarker } from "@/components/site/PreviewMarker";
import { EmptySiteView, HomeView } from "@/components/site/SiteView";
import { SITE_TITLE } from "@/components/site/site-title";
import { readDraftOrNull } from "@/app/admin/draft";
import { requireOwnerPage } from "@/lib/auth/owner";
import { visibleSite } from "@/lib/content/visibility";
import { isFramedRequest } from "./framed";

// The preview of the home page: the DRAFT, through the same visibility function
// and views as the public page (KTD7), with links that stay in the preview.

// The page waits for the owner check and an uncached draft read on every
// request, so nothing of it is prerendered or cached.
export const instant = false;

export default async function PreviewHome() {
  await requireOwnerPage();
  const draft = await readDraftOrNull();
  if (!draft) return <EmptySiteView title={SITE_TITLE} />;
  const site = visibleSite(draft);
  return (
    <>
      <PageBar pages={barPages(site)} current={HOME_ID} mode="preview" framed={await isFramedRequest()} />
      <PreviewMarker site={site} />
      <HomeView site={site} linkBase="/preview" />
    </>
  );
}
