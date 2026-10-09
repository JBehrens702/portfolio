import { EmptySiteView, NotFoundView } from "@/components/site/SiteView";
import { SITE_TITLE } from "@/components/site/site-title";
import { getPublishedSite } from "@/lib/content/public";
import { visibleSite } from "@/lib/content/visibility";

// The 404 page. Its texts are UI labels from the published document (1.2.4).
export default async function NotFound() {
  const published = await getPublishedSite();
  if (!published) return <EmptySiteView title={SITE_TITLE} />;
  return <NotFoundView site={visibleSite(published)} linkBase="/" />;
}
