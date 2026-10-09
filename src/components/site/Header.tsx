"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import logoFull from "../../../public/brand/logo-full.png";
import logoMark from "../../../public/brand/logo-mark.png";
import styles from "./Header.module.css";

export interface NavLink {
  label: string;
  href: string;
}

export interface HeaderProps {
  /** Alt text of the logo, which is also the accessible name of the home link. */
  logoAlt: string;
  /** In-page or site links, in display order. */
  links: readonly NavLink[];
  /** The resume link. Leave it out while the owner has not supplied a resume (0.1.8). */
  resume?: NavLink;
  /** Accessible name of the menu button that holds the links below 640 px. */
  menuLabel: string;
  /** Accessible name of the navigation landmark. */
  navLabel?: string;
}

// The top bar of design A (docs/design/Reference1.png): a solid black bar, frozen
// to the top, with an angled left edge and three orange slashes (pure graphics,
// aria-hidden, no text). The logo is two images: the aperture ring
// (logo-mark.png), which turns on load and as the page scrolls, and the
// lettering of logo-full.png, shown without its own ring. The lettering image
// carries the alt text; the ring is decorative (alt="").

export function Header({ logoAlt, links, resume, menuLabel, navLabel }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const hasNav = links.length > 0 || resume !== undefined;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <svg className={styles.slashes} viewBox="0 0 100 64" aria-hidden="true" focusable="false">
          <path d="M26 9 44.5 55M43 9l18.5 46M60 9l18.5 46" />
        </svg>
        <Link href="/" className={styles.logoLink}>
          <span className={styles.markSpin}>
            <Image src={logoMark} alt="" className={styles.mark} sizes="48px" loading="eager" />
          </span>
          <span className={styles.word}>
            <Image src={logoFull} alt={logoAlt} className={styles.wordImage} sizes="200px" loading="eager" />
          </span>
        </Link>

        {hasNav && (
          <nav ref={navRef} className={styles.nav} aria-label={navLabel}>
            <button
              ref={buttonRef}
              type="button"
              className={styles.menuButton}
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="visually-hidden">{menuLabel}</span>
              <span className={styles.menuIcon} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>

            <ul id={listId} role="list" className={styles.list} data-open={open}>
              {links.map((link) => (
                <li key={`${link.href}|${link.label}`}>
                  <Link href={link.href} className={styles.link} onClick={close}>
                    <span className={styles.linkText}>{link.label}</span>
                  </Link>
                </li>
              ))}
              {resume && (
                <li>
                  <a href={resume.href} className={`${styles.link} ${styles.resume}`} onClick={close}>
                    {resume.label}
                    <svg className={styles.resumeIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M8 2v8m0 0 3.5-3.5M8 10 4.5 6.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
                    </svg>
                  </a>
                </li>
              )}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}

export default Header;
