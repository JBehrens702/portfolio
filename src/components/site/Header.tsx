"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import logoFull from "../../../public/brand/logo-full.png";
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
      <div className={`container ${styles.bar}`}>
        <Link href="/" className={styles.logoLink}>
          <Image
            src={logoFull}
            alt={logoAlt}
            className={styles.logo}
            sizes="(min-width: 640px) 180px, 160px"
            loading="eager"
          />
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
                    {link.label}
                  </Link>
                </li>
              ))}
              {resume && (
                <li>
                  <a href={resume.href} className={`${styles.link} ${styles.resume}`} onClick={close}>
                    {resume.label}
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
