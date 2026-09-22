/**
 * Real drawn icon for the prev/next month-or-day controls, replacing the
 * "‹"/"›" text glyphs (UX polish pass, 2026-09-18) — a Unicode character
 * standing in for an icon renders at a font-dependent weight/size that
 * never quite matches the rest of the app's hand-drawn icon vocabulary
 * (`DoseStatusGlyph`), and looks visibly "off" at the sizes these buttons
 * use. One consistent stroke width/cap here matches that vocabulary.
 */
export function ChevronIcon({ direction, className }: { direction: "left" | "right"; className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={direction === "left" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
