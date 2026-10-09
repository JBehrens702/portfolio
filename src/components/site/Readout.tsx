import type { CSSProperties } from "react";
import { pad, ZONE_LETTERS } from "./markings";

// Server-safe marking elements. See markings.ts for the rules: derived values
// only, aria-hidden, data-marking, and not selectable (.readout in globals.css).

/** One decorative technical marking, such as "REF 01/05" or "N°02". */
export function Readout({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className ? `readout ${className}` : "readout"} aria-hidden="true" data-marking="">
      {text}
    </span>
  );
}

/** The numbers of a ruler: one every five ticks of the 24 px grid ("00", "05", "10", ...). */
const RULER_NUMBERS = Array.from({ length: 12 }, (_, i) => i * 5);

/** The numbers inside an aria-hidden ruler; each sits at a coarse grid line (--n). */
export function RulerNumbers({ className }: { className?: string }) {
  return (
    <>
      {RULER_NUMBERS.map((n, i) => (
        <span key={n} className={className ? `readout ${className}` : "readout"} style={{ "--n": i } as CSSProperties} data-marking="">
          {pad(n)}
        </span>
      ))}
    </>
  );
}

const ROWS = Array.from({ length: 24 }, (_, i) => i + 1);

/**
 * The zone indices of a drawing sheet border on wide screens: letters across
 * the top of the page and numbers down both sides, one per coarse cell of the
 * graph paper. The rows are fixed and drift with the paper. Pure decoration.
 */
export function SheetZones() {
  return (
    <>
      <span className="sheet-cols" aria-hidden="true">
        {ZONE_LETTERS.map((letter, i) => (
          <span key={letter} className="readout" style={{ "--n": i } as CSSProperties} data-marking="">
            {letter}
          </span>
        ))}
      </span>
      <span className="sheet-rows" aria-hidden="true">
        {ROWS.map((row) => (
          <span key={`l${row}`} className="readout" style={{ "--n": row } as CSSProperties} data-marking="">
            {pad(row)}
          </span>
        ))}
        {ROWS.map((row) => (
          <span
            key={`r${row}`}
            className="readout sheet-rows-end"
            style={{ "--n": row } as CSSProperties}
            data-marking=""
          >
            {pad(row)}
          </span>
        ))}
      </span>
    </>
  );
}
