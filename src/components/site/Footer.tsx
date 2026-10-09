import type { CSSProperties } from "react";
import { Aperture } from "./Aperture";
import type { NavLink } from "./Header";
import { ExternalIcon, GlobeIcon, MailIcon, ProfileIcon } from "./icons";
import { sheetMark, type Sheet } from "./markings";
import { Readout } from "./Readout";
import styles from "./Footer.module.css";

export interface FooterProps {
  /** Contact links (LinkedIn, email, Rise profile), in display order. */
  links: readonly NavLink[];
  /** Optional heading above the links, for example the approved label "Get in touch:". */
  heading?: string;
  /** Optional element id, so a header link such as "#contact" can point here. */
  id?: string;
  /** The sheet number of the page, for the title block (a decorative marking). */
  sheet?: Sheet;
}

/** The decorative icon for a contact address. */
function LinkIcon({ href }: { href: string }) {
  if (href.startsWith("mailto:")) return <MailIcon className={styles.icon} />;
  if (/linkedin\.com/i.test(href)) return <ProfileIcon className={styles.icon} />;
  return <GlobeIcon className={styles.icon} />;
}

/**
 * The site footer (design A): a dark purple band with cut corners and the
 * contact links as rows with an orange edge. It renders nothing when no link
 * is supplied (0.1.8). Every decoration is aria-hidden. The title block in the
 * lower corner holds only drafting markings: the sheet number of the page
 * (from its order), the scale, and the revision (see markings.ts).
 */
export function Footer({ links, heading, id, sheet }: FooterProps) {
  if (links.length === 0) return null;
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <footer id={id} className={`container ${styles.footer}`} aria-labelledby={heading ? headingId : undefined}>
      <div className={styles.panel}>
        <div className={styles.markTurn} aria-hidden="true">
          <Aperture id="footer-aperture" tone="ghost" className={styles.mark} />
        </div>
        <span className={`corner-marks ${styles.ticks}`} aria-hidden="true" />
        {sheet && (
          <span className={styles.titleBlock} aria-hidden="true">
            <Readout text={sheetMark(sheet.index, sheet.count)} />
            <Readout text="SCALE 1:1" />
            <Readout text="REV A" />
          </span>
        )}
        <div className={styles.inner}>
          {heading && (
            <h2 id={headingId} className={styles.heading} data-reveal="">
              {heading}
            </h2>
          )}
          <ul role="list" className={styles.list}>
            {links.map((link, i) => (
              <li key={`${link.href}|${link.label}`} data-reveal="" style={{ "--i": i } as CSSProperties}>
                <a href={link.href} className={styles.link}>
                  <LinkIcon href={link.href} />
                  <span className={styles.linkText}>{link.label}</span>
                  <ExternalIcon className={styles.go} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
