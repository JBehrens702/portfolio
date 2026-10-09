// A decorative six-blade aperture ring, after the logo mark. It is a pure
// graphic: aria-hidden, no text (1.2.4). Each blade is the part of the ring
// between two lines that touch the inner circle, like a camera iris.

const C = 100; // centre of the 200 x 200 view box
const R = 96; // outer radius
const r = 40; // inner radius (the opening)
const BLADES = 6;

function point(radius: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

function fmt([x, y]: [number, number]): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

/** The first blade; the others are the same path turned by 60 degrees each. */
const BLADE_PATH = (() => {
  const step = 360 / BLADES;
  const sweep = (Math.acos(r / R) * 180) / Math.PI; // angle from a touch point to where its line meets the rim
  const t0 = point(r, 0);
  const o0 = point(R, sweep);
  const t1 = point(r, step);
  const o1 = point(R, step + sweep);
  return `M${fmt(t0)} L${fmt(o0)} A${R},${R} 0 0,1 ${fmt(o1)} L${fmt(t1)} A${r},${r} 0 0,0 ${fmt(t0)} Z`;
})();

export interface ApertureProps {
  /** A unique id prefix for the gradients of this instance. */
  id: string;
  className?: string;
  /** "brand": lavender-to-purple blades for a dark background. "ghost": soft white blades for a purple panel. */
  tone?: "brand" | "ghost";
}

export function Aperture({ id, className, tone = "brand" }: ApertureProps) {
  const blade = `${id}-blade`;
  const rim = `${id}-rim`;
  const ghost = tone === "ghost";
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={blade} x1="0" y1="0" x2="1" y2="1">
          {ghost ? (
            <>
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.06" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#efc3fe" />
              <stop offset="0.45" stopColor="#b34ce0" />
              <stop offset="1" stopColor="#6a1898" />
            </>
          )}
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={ghost ? 0.4 : 0.55} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        {Array.from({ length: BLADES }, (_, i) => (
          <path
            key={i}
            d={BLADE_PATH}
            transform={`rotate(${(360 / BLADES) * i} ${C} ${C})`}
            fill={`url(#${blade})`}
            stroke={ghost ? "rgb(255 255 255 / 0.35)" : "#2a0a40"}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        ))}
      </g>
      <circle cx={C} cy={C} r={R} fill="none" stroke={`url(#${rim})`} strokeWidth="1.5" />
    </svg>
  );
}

export default Aperture;
