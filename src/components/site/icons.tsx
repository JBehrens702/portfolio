// Small decorative icons. Each is aria-hidden and holds no text (1.2.4); the
// link or button around it carries the owner's words.

interface IconProps {
  className?: string;
}

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
  focusable: false,
};

/** An arrow to the right: a link to another page. */
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 12h15m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

/** An arrow up and to the right: a link that opens a new tab. */
export function ExternalIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M7 17 17 7m0 0H9m8 0v8" />
    </svg>
  );
}

/** A document with a down arrow: a file download. */
export function FileIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M14 3H5v18h14V8z" />
      <path d="M14 3v5h5M12 11v6m0 0 2.5-2.5M12 17l-2.5-2.5" />
    </svg>
  );
}

/** An envelope: an email link. */
export function MailIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="5" width="18" height="14" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

/** A profile card: a professional profile link. */
export function ProfileIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="4" width="18" height="16" />
      <circle cx="9" cy="11" r="2.5" />
      <path d="M5.5 17c.8-1.8 2-2.6 3.5-2.6s2.7.8 3.5 2.6M15 9.5h3M15 13h3" />
    </svg>
  );
}

/** A globe: any other web link. */
export function GlobeIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" />
    </svg>
  );
}

/** A large quotation mark, drawn as a shape (not a text character). */
export function QuoteMarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M0 40V24.6C0 10.8 6.3 2.6 18.9 0l2.4 5.4C14.6 7.5 11.2 11.6 11 18h9.6v22zm27.4 0V24.6C27.4 10.8 33.7 2.6 46.3 0l2.4 5.4c-6.7 2.1-10.1 6.2-10.3 12.6H48v22z"
      />
    </svg>
  );
}

/** A down arrow onto a line: a file download (the hero resume button). Drawn on a 16-unit grid. */
export function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2v8m0 0 3.5-3.5M8 10 4.5 6.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/** An arrow down: a link further down the same page (the hero work button). Drawn on a 16-unit grid. */
export function DownArrowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10m0 0 4-4m-4 4-4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
