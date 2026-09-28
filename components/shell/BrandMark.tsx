import { useId } from "react";

/**
 * The one MedTrack mark, everywhere. Rebrand (2026-09-27, confirmed user
 * decision — PRODUCT.md Brand Commitments): replaces the previous solid
 * cross (which matched the native Android app's teal icon/splash at the
 * time) with a leaf, per a user-supplied reference identity. The user has
 * separately confirmed the native Android icon/splash (the separate repo)
 * gets regenerated to match this mark too.
 *
 * Shape traced from a zoomed crop of the reference (2026-09-28): drawn
 * already tilted (~40° off vertical) rather than rotating a symmetric
 * leaf — pointed base at lower-left, sharp tip at upper-right, a fuller
 * belly on the upper-left edge than the lower-right one, and a thin
 * curved vein only through the lower two-thirds.
 */
const LEAF_PATH = "M5 21.5C1.5 12.5 9.5 1.8 20.5 3C22.5 11.5 15 21 5 21.5Z";
const LEAF_VEIN_PATH = "M6.8 19.2Q9.6 13.8 14.8 9.2";

export function BrandMark({ size = 14, className }: { size?: number; className?: string }) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {/* A same-color vein at partial opacity is invisible (blending a
          color with a translucent copy of itself changes nothing). A mask
          punches a real hole, so the vein shows whatever is behind the
          mark, whichever single color the mark renders in. */}
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <path d={LEAF_PATH} fill="white" />
        <path d={LEAF_VEIN_PATH} fill="none" stroke="black" strokeWidth="0.8" strokeLinecap="round" />
      </mask>
      <path d={LEAF_PATH} fill="currentColor" mask={`url(#${maskId})`} />
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
      <BrandMark size={iconSize} />
      <span className={`font-bold tracking-tight ${textClassName}`}>MedTrack</span>
    </div>
  );
}
