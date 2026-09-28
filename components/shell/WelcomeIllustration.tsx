import { useId } from "react";

/**
 * Welcome's centerpiece illustration, drawn from coordinates and colors
 * measured on the reference (2026-09-28): the reference screen was cropped
 * bezel-free, scaled to a 390-wide canvas, gridded, and pixel-sampled, so
 * every number below is in that 390-wide space (y 60..425 of the
 * illustration band).
 *
 * Two stacked SVGs: the backdrop (domes, lower hills, cream ground mound)
 * stretches to the full-bleed box with `preserveAspectRatio="none"` so it
 * always runs off both screen edges, while the leaves keep their true
 * proportions (`xMidYMax meet`, anchored to the ground line). The leaves
 * layer uses a tighter band (from just above the tallest tip) so on a
 * real phone — shorter than the reference's canvas — the leaves still
 * fill most of the illustration's height; both layers share the same
 * bottom edge, so the root stays inside the ground mound.
 */
const BACKDROP_VIEWBOX = "0 60 390 365";
const LEAVES_VIEWBOX = "0 150 390 275";
const ROOT = { x: 178, y: 408 };

const LEAVES = [
  { base: [170, 392], tip: [52, 256], ratio: 0.47 },
  { base: [190, 347], tip: [315, 168], ratio: 0.46 },
  { base: [203, 383], tip: [295, 342], ratio: 0.44 },
] as const;

const STEMS = [
  `M${ROOT.x} ${ROOT.y} Q181 378 190 347`,
  `M${ROOT.x} ${ROOT.y} Q172 402 170 392`,
  `M180 398 Q188 388 203 383`,
];

const f = (n: number) => n.toFixed(1);

/** Broad pointed leaf from `base` to `tip`, widest ~40% up, full width = ratio × length. */
function leafPath([bx, by]: readonly number[], [tx, ty]: readonly number[], ratio: number): string {
  const len = Math.hypot(tx - bx, ty - by);
  const ux = (tx - bx) / len;
  const uy = (ty - by) / len;
  const nx = -uy;
  const ny = ux;
  const h = (ratio * len) / 2;
  const p = (along: number, off: number) => `${f(bx + ux * along * len + nx * off * h)},${f(by + uy * along * len + ny * off * h)}`;
  return `M${bx},${by} C${p(0.15, 1.45)} ${p(0.75, 1.2)} ${tx},${ty} C${p(0.75, -1.2)} ${p(0.15, -1.45)} ${bx},${by} Z`;
}

/** Slightly curved midrib, inset from both ends. */
function veinPath([bx, by]: readonly number[], [tx, ty]: readonly number[]): string {
  const len = Math.hypot(tx - bx, ty - by);
  const ux = (tx - bx) / len;
  const uy = (ty - by) / len;
  const at = (a: number, off: number) => `${f(bx + ux * a * len - uy * off)},${f(by + uy * a * len + ux * off)}`;
  return `M${at(0.06, 0)} Q${at(0.5, len * 0.05)} ${at(0.9, 0)}`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
}

export function WelcomeIllustration({ className = "" }: { className?: string }) {
  const gradientId = useId();

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox={BACKDROP_VIEWBOX} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* Two domes as one even-odd path: where they overlap the page
            background shows through, the light seam the reference has. */}
        <path
          d={`${ellipsePath(330, 400, 242, 322)} ${ellipsePath(100, 420, 122, 277)}`}
          fillRule="evenodd"
          className="fill-[#E6EBE0] dark:fill-[#18231e]"
        />
        <ellipse cx="-20" cy="470" rx="130" ry="180" className="fill-[#E0E8DB] dark:fill-[#1b2a23]" />
        <ellipse cx="380" cy="460" rx="170" ry="185" className="fill-[#C5D8C7] dark:fill-[#1f3329]" />
        <path d="M0 398 Q195 358 390 398 L390 430 L0 430 Z" className="fill-[#FCFBF7] dark:fill-stone-950" />
      </svg>

      <svg viewBox={LEAVES_VIEWBOX} preserveAspectRatio="xMidYMax meet" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2B7159" />
            <stop offset="1" stopColor="#174F3B" />
          </linearGradient>
        </defs>
        {STEMS.map((d) => (
          <path key={d} d={d} fill="none" stroke="#1B5A44" strokeWidth="3.5" strokeLinecap="round" />
        ))}
        {LEAVES.map(({ base, tip, ratio }) => (
          <g key={`${base}`}>
            <path
              d={leafPath(base, tip, ratio)}
              fill={`url(#${gradientId})`}
              strokeWidth="5"
              paintOrder="stroke"
              strokeLinejoin="round"
              className="stroke-[#FCFBF7] dark:stroke-stone-950"
            />
            <path d={veinPath(base, tip)} fill="none" stroke="#A9CDBB" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}
