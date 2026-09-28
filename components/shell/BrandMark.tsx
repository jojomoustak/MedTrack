import { useId } from "react";
import { LOGO_PALETTE, LeafArt, leafOutline, type LeafSpec } from "@/components/shell/leaf-art";

/**
 * The one MedTrack mark, everywhere: an outlined cross with a leaf across
 * its center (user decision, 2026-09-28 — replaces the leaf-only mark from
 * the 2026-09-27 rebrand). The leaf runs corner to corner through the
 * cross's middle and pokes out past two inner corners; wherever it meets
 * the cross, the cross's lines stop in a thin gap around the leaf instead
 * of running underneath it, so the two read as one interlocked mark. Kept
 * green: a red cross on white is a legally protected emblem.
 *
 * The native Android icon/splash (separate repo) is meant to follow this
 * mark (PRODUCT.md Brand Commitments).
 */
const CROSS_PATH =
  "M10.2 1H13.8A2.2 2.2 0 0 1 16 3.2V6.6A1.4 1.4 0 0 0 17.4 8H20.8A2.2 2.2 0 0 1 23 10.2V13.8A2.2 2.2 0 0 1 20.8 16H17.4A1.4 1.4 0 0 0 16 17.4V20.8A2.2 2.2 0 0 1 13.8 23H10.2A2.2 2.2 0 0 1 8 20.8V17.4A1.4 1.4 0 0 0 6.6 16H3.2A2.2 2.2 0 0 1 1 13.8V10.2A2.2 2.2 0 0 1 3.2 8H6.6A1.4 1.4 0 0 0 8 6.6V3.2A2.2 2.2 0 0 1 10.2 1Z";
const CROSS_STROKE = 1.6;
/** Clear space between the leaf and the cross's lines, on each side. */
const GAP = 1.1;

// Flat leaf for small sizes: the full-size leaf silhouette scaled into the
// cross's center, tip toward the upper-right inner corner.
const FLAT_LEAF = "M5 21.5C1.5 12.5 9.5 1.8 20.5 3C22.5 11.5 15 21 5 21.5Z";
const FLAT_VEIN = "M6.8 19.2Q9.6 13.8 14.8 9.2";
const FLAT_FIT = "translate(12 12) scale(0.64) translate(-12.6 -12.2)";

export function BrandMark({ size = 14, className }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <defs>
        <mask id={`${id}x`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" />
          <path d={FLAT_LEAF} transform={FLAT_FIT} fill="black" stroke="black" strokeWidth={(GAP * 2) / 0.64} strokeLinejoin="round" />
        </mask>
        {/* The vein is cut out rather than drawn: a same-color line over
            the leaf would be invisible, a hole shows what's behind it.
            No transform on these: a mask's content lives in the masked
            element's own (already transformed) coordinates, so the fit
            transform sits on a wrapper group instead of being applied twice. */}
        <mask id={`${id}v`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <path d={FLAT_LEAF} fill="white" />
          <path d={FLAT_VEIN} fill="none" stroke="black" strokeWidth="1.1" strokeLinecap="round" />
        </mask>
      </defs>
      <path d={CROSS_PATH} fill="none" stroke="currentColor" strokeWidth={CROSS_STROKE} mask={`url(#${id}x)`} />
      <g transform={FLAT_FIT}>
        <path d={FLAT_LEAF} fill="currentColor" mask={`url(#${id}v)`} />
      </g>
    </svg>
  );
}

/** Icon + wordmark, the pairing used in every compact header (`AppBar`, the splash screen). */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-accent-700 dark:text-accent-400 ${className}`}>
      <BrandMark />
      MedTrack
    </span>
  );
}

const DETAILED_LEAF: LeafSpec = { base: { x: 6.6, y: 17.6 }, tip: { x: 17.6, y: 6.3 }, width: 0.58, bend: -0.03, skew: 1.1 };
const DETAILED_STALK = 0.06;
const DETAILED_STEM_WIDTH = 0.35;

/**
 * The mark at display size, for the stacked lockup (Welcome, Login,
 * Register): the same cross, with the leaf carrying the reference logo's
 * surface detail (`LeafArt` — lit/shaded halves, a mint midrib that the
 * stalk flows into, a dark groove). Fixed greens rather than
 * `currentColor`: it only appears where the mark is green anyway. The flat
 * `BrandMark` stays for small sizes, where this detail can't be seen.
 */
export function BrandMarkDetailed({ size = 52, className }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const len = Math.hypot(DETAILED_LEAF.tip.x - DETAILED_LEAF.base.x, DETAILED_LEAF.tip.y - DETAILED_LEAF.base.y);
  const ux = (DETAILED_LEAF.tip.x - DETAILED_LEAF.base.x) / len;
  const uy = (DETAILED_LEAF.tip.y - DETAILED_LEAF.base.y) / len;
  const stalkEnd = { x: DETAILED_LEAF.base.x - ux * DETAILED_STALK * len, y: DETAILED_LEAF.base.y - uy * DETAILED_STALK * len };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <defs>
        <mask id={`${id}x`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" />
          <path d={leafOutline(DETAILED_LEAF)} fill="black" stroke="black" strokeWidth={GAP * 2} strokeLinejoin="round" />
          <path
            d={`M${DETAILED_LEAF.base.x} ${DETAILED_LEAF.base.y}L${stalkEnd.x} ${stalkEnd.y}`}
            stroke="black"
            strokeWidth={DETAILED_STEM_WIDTH + GAP * 2}
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <path d={CROSS_PATH} fill="none" stroke={LOGO_PALETTE.lit.far} strokeWidth={CROSS_STROKE} mask={`url(#${id}x)`} />
      <LeafArt
        spec={DETAILED_LEAF}
        palette={LOGO_PALETTE}
        id={`${id}logo`}
        ribEnd={0.78}
        ribWidth={0.05}
        veinCount={0}
        stalk={DETAILED_STALK}
        stemWidth={DETAILED_STEM_WIDTH}
      />
    </svg>
  );
}

/**
 * Bigger, stacked (icon above wordmark) lockup — the reference's "brand
 * moment" treatment on entry screens (Welcome, Login, Register), distinct
 * from the compact inline `BrandWordmark` used in interior-screen headers.
 */
export function BrandLockup({
  className = "",
  iconSize = 52,
  textClassName = "text-2xl",
}: {
  className?: string;
  iconSize?: number;
  textClassName?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-accent-700 dark:text-accent-400 ${className}`}>
      <BrandMarkDetailed size={iconSize} />
      <span className={`font-bold tracking-tight ${textClassName}`}>MedTrack</span>
    </div>
  );
}
