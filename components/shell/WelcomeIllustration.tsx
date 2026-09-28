import { useId } from "react";
import { ILLUSTRATION_PALETTE, LeafArt, leafOutline, type LeafSpec } from "@/components/shell/leaf-art";

/**
 * Welcome's centerpiece illustration, drawn from coordinates and colors
 * measured on the reference (2026-09-28): the reference screen was cropped
 * bezel-free, scaled to a 390-wide canvas, gridded, and pixel-sampled, so
 * every number below is in that 390-wide space.
 *
 * Two stacked SVGs: the backdrop (domes, lower hills, cream ground mound)
 * stretches to the full-bleed box with `preserveAspectRatio="none"` so it
 * always runs off both screen edges, while the leaves keep their true
 * proportions (`xMidYMax meet`, anchored to the ground line). The leaves
 * layer uses a tighter band so they fill most of the illustration's
 * height on a real phone; both layers share the bottom edge, so the root
 * stays inside the ground mound. Leaf surface detail lives in `LeafArt`.
 */
const BACKDROP_VIEWBOX = "0 60 390 365";
const LEAVES_VIEWBOX = "0 150 390 275";
const ROOT = { x: 178, y: 408 };
const STEM_WIDTH = 3.4;

const LEAVES: LeafSpec[] = [
  { base: { x: 170, y: 392 }, tip: { x: 52, y: 256 }, width: 0.47, bend: 0.03, skew: 0.9 },
  { base: { x: 190, y: 347 }, tip: { x: 315, y: 168 }, width: 0.46, bend: -0.04, skew: 1.08 },
  { base: { x: 203, y: 383 }, tip: { x: 295, y: 342 }, width: 0.44, bend: -0.05, skew: 0.92 },
];

const STEMS = [
  `M${ROOT.x} ${ROOT.y} Q181 378 190 347`,
  `M${ROOT.x} ${ROOT.y} Q172 402 170 392`,
  `M180 398 Q188 388 203 383`,
];

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
}

export function WelcomeIllustration({ className = "" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

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
        {/* Halos first, then stems, then leaves: a halo drawn after the
            stems would cut a light gap across each stem at the leaf base. */}
        {LEAVES.map((spec, i) => (
          <path key={i} d={leafOutline(spec)} strokeWidth="5" strokeLinejoin="round" className="fill-none stroke-[#FCFBF7] dark:stroke-stone-950" />
        ))}
        {STEMS.map((d) => (
          <path key={d} d={d} fill="none" stroke="#174F3B" strokeWidth={STEM_WIDTH} strokeLinecap="round" />
        ))}
        {LEAVES.map((spec, i) => (
          <LeafArt key={i} spec={spec} palette={ILLUSTRATION_PALETTE} id={`${uid}l${i}`} stemWidth={STEM_WIDTH} />
        ))}
      </svg>
    </div>
  );
}
