import { PreviewMarker } from "@/components/site/PreviewMarker";
import { EmptySiteView, HomeView } from "@/components/site/SiteView";
import { SITE_TITLE } from "@/components/site/site-title";
import { requireOwnerPage } from "@/lib/auth/owner";
import { createContentStoreFromEnv } from "@/lib/content/store";
import { visibleSite } from "@/lib/content/visibility";

// The preview of the home page: the DRAFT, through the same visibility function
// and views as the public page (KTD7), with links that stay in the preview.

// The page waits for the owner check and an uncached draft read on every
// request, so nothing of it is prerendered or cached.
export const instant = false;

export default async function PreviewHome() {
  await requireOwnerPage();
  const draft = (await createContentStoreFromEnv()?.readDraft()) ?? null;
  if (!draft) return <EmptySiteView title={SITE_TITLE} />;
  const site = visibleSite(draft);
  return (
    <>
      <PreviewMarker site={site} />
      <HomeView site={site} linkBase="/preview" />
    </>
  );
}
