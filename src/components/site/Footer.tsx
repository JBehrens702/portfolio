import type { NavLink } from "./Header";
import styles from "./Footer.module.css";

export interface FooterProps {
  /** Contact links (LinkedIn, email, Rise profile), in display order. */
  links: readonly NavLink[];
  /** Optional heading above the links, for example the approved label "Get in touch:". */
  heading?: string;
  /** Optional element id, so a header link such as "#contact" can point here. */
  id?: string;
}

/** The site footer with the contact links. It renders nothing when no link is supplied (0.1.8). */
export function Footer({ links, heading, id }: FooterProps) {
  if (links.length === 0) return null;
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <footer id={id} className={styles.footer} aria-labelledby={heading ? headingId : undefined}>
      <div className={`container ${styles.inner}`}>
        {heading && (
          <h2 id={headingId} className={styles.heading}>
            {heading}
          </h2>
        )}
        <ul role="list" className={styles.list}>
          {links.map((link) => (
            <li key={`${link.href}|${link.label}`}>
              <a href={link.href} className={styles.link}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

export default Footer;
