import type { Site } from "@/lib/content/schema";
import { labelText } from "@/lib/content/visibility";
import { Footer } from "./Footer";
import { contactLinks, SECTION_IDS } from "./links";
import type { Sheet } from "./markings";

/** The footer with the contact links of the Google Site: LinkedIn, email, and Rise (0.1.7). */
export function ContactLinks({ site, sheet }: { site: Site; sheet?: Sheet }) {
  return (
    <Footer
      id={SECTION_IDS.contact}
      heading={labelText(site, "contactHeading") ?? undefined}
      links={contactLinks(site)}
      sheet={sheet}
    />
  );
}

export default ContactLinks;
