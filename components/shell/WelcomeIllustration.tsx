/**
 * Welcome's centerpiece illustration (rebrand direction contract) — a
 * cluster of the same leaf silhouette `BrandMark` uses, at different
 * sizes/rotations/shades, on a soft circular backdrop. Deliberately reuses
 * BrandMark's own vector language rather than a separate illustration
 * style: crisp geometric shapes, not a sketch/photo-style scene (craft
 * floor: "real illustration or none" — geometry is the "or none" that's
 * still first-class here).
 */
export function WelcomeIllustration() {
  const leaf = "M12 3q7 5 7 10.5Q19 20 12 21.5Q5 20 5 13.5 5 8 12 3Z";
  const stem = "M12 21.7v1.8";

  return (
    <svg viewBox="0 0 200 200" width="220" height="220" aria-hidden="true" className="mx-auto">
      <circle cx="100" cy="100" r="92" className="fill-accent-100 dark:fill-accent-900/30" />
      {/* `accent-300` doesn't exist in this theme (only 50/100/400/500/600/700/800/900/950 are defined) — an earlier version used it here, which Tailwind silently drops, leaving SVG's own default black fill. */}
      <g transform="translate(70 58) rotate(-18) scale(3.4)" className="fill-accent-400 dark:fill-accent-700">
        <path d={leaf} />
        <path d={stem} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </g>
      <g transform="translate(108 82) rotate(14) scale(4.2)" className="fill-accent-600 dark:fill-accent-500">
        <path d={leaf} />
        <path d={stem} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </g>
      <g transform="translate(78 118) rotate(35) scale(2.6)" className="fill-accent-800 dark:fill-accent-400">
        <path d={leaf} />
        <path d={stem} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
