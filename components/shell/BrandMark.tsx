/**
 * The one MedTracking mark, everywhere. Previously defined twice — once
 * inline in `today/page.tsx` as `BrandIcon`, and not at all in `AppBar`
 * (which showed the wordmark with no icon), a real "same brand, two
 * treatments" inconsistency the redesign audit flagged (CLAUDE.md rule:
 * one identity, never redrawn per-component). This is a solid cross,
 * matching the native Android app's actual shipped launcher/splash icon
 * exactly (`ic_launcher_foreground.png`/`splash.png` in the separate
 * Android repo) — not a fresh invention, and not a leaf/heart/shield/pill
 * glyph a generic template might suggest.
 */
export function BrandMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8.5 3h7v5.5H21v7h-5.5V21h-7v-5.5H3v-7h5.5Z" />
    </svg>
  );
}

/** Icon + wordmark, the pairing used in every header (`AppBar`, `TodayHero`). */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
      <BrandMark />
      MedTracking
    </span>
  );
}
