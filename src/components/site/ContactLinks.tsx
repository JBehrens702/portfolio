import type { Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import { Footer } from "./Footer";
import { contactLinks, SECTION_IDS } from "./links";

/** The footer with the contact links of the Google Site: LinkedIn, email, and Rise (0.1.7). */
export function ContactLinks({ site }: { site: Site }) {
  return (
    <Footer
      id={SECTION_IDS.contact}
      heading={labelText(site, "contactHeading") ?? undefined}
      links={contactLinks(site)}
    />
  );
}

export default ContactLinks;
