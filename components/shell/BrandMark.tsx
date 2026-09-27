/**
 * The one MedTrack mark, everywhere. Rebrand (2026-09-27, confirmed user
 * decision — PRODUCT.md Brand Commitments): replaces the previous solid
 * cross (which matched the native Android app's teal icon/splash at the
 * time) with a two-blade leaf, per a user-supplied reference identity.
 * The user has separately confirmed the native Android icon/splash (the
 * separate repo) gets regenerated to match this mark too, so the two
 * stay in sync on the new mark instead of the old one.
 */
export function BrandMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {/* Tilted (not symmetric) so the silhouette alone reads as a leaf
          rather than a drop — a `currentColor` vein at partial opacity
          drawn over a `currentColor` fill of the same shade was tried
          first and was invisible (same hue, no real contrast); the stem
          below does the "this is a leaf, not a drop" work instead, since
          it sits outside the filled silhouette and is always visible
          regardless of which single color this mark renders in (dark
          green on the light Welcome page, white on the dark green
          header/hero). */}
      <path
        d="M12 3q7 5 7 10.5Q19 20 12 21.5Q5 20 5 13.5 5 8 12 3Z"
        fill="currentColor"
        transform="rotate(22 12 12)"
      />
      <path d="M12 21.7v1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" transform="rotate(22 12 12)" />
    </svg>
  );
}

/** Icon + wordmark, the pairing used in every header (`AppBar`, `TodayHero`). */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
      <BrandMark />
      MedTrack
    </span>
  );
}
