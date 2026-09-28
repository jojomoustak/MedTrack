import { useId } from "react";

/**
 * The one MedTrack mark, everywhere. Rebrand (2026-09-27, confirmed user
 * decision — PRODUCT.md Brand Commitments): replaces the previous solid
 * cross (which matched the native Android app's teal icon/splash at the
 * time) with a two-blade leaf, per a user-supplied reference identity.
 * The user has separately confirmed the native Android icon/splash (the
 * separate repo) gets regenerated to match this mark too, so the two
 * stay in sync on the new mark instead of the old one.
 */
export const LEAF_PATH = "M12 22C6 17 5 10 12 2C19 10 18 17 12 22Z";
/** The leaf's center vein, in the same pre-rotation local coordinates as `LEAF_PATH`. */
export const LEAF_VEIN_PATH = "M12 19V5";

export function BrandMark({ size = 14, className }: { size?: number; className?: string }) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {/* A previous version tried a `currentColor` vein at partial opacity
          over a `currentColor` fill of the same shade — invisible, since
          blending a color with a translucent copy of itself is still that
          same color. A `<mask>` punches a real hole instead, so the vein
          shows whatever's actually behind the mark (the page background
          in every real usage), which works regardless of which single
          color this mark renders in. */}
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <path d={LEAF_PATH} fill="white" transform="rotate(22 12 12)" />
        <path d={LEAF_VEIN_PATH} stroke="black" strokeWidth="1" strokeLinecap="round" transform="rotate(22 12 12)" />
      </mask>
      <path d={LEAF_PATH} fill="currentColor" transform="rotate(22 12 12)" mask={`url(#${maskId})`} />
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
 * Same mark, same green, just a different composition for a screen that
 * has room to give the brand more presence.
 */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 text-accent-700 dark:text-accent-400 ${className}`}>
      <BrandMark size={52} />
      <span className="text-2xl font-bold">MedTrack</span>
    </div>
  );
}
