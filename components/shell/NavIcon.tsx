export type NavIconKind = "today" | "medications" | "calendar" | "lists" | "profile";

/**
 * Real drawn icons for the bottom nav (UX polish pass, 2026-09-22) — the
 * bar previously had no icons at all, just labels, which is a genuine
 * outlier against near-universal mobile bottom-nav convention (iOS/
 * Android both pair icon+label). One consistent stroke weight/cap,
 * matching `DoseStatusGlyph`/`ChevronIcon`'s existing hand-drawn
 * vocabulary rather than a borrowed icon-font set.
 */
export function NavIcon({ kind, active, className }: { kind: NavIconKind; active: boolean; className?: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: active ? 2 : 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };

  switch (kind) {
    case "today":
      // Distinct from the Calendar tab's grid on purpose — same-shaped
      // icons on adjacent, simultaneously-visible tabs would defeat the
      // point of having icons at all. A checklist reads as "what's due
      // right now," Calendar's grid as "browse dates."
      return (
        <svg {...common}>
          <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
          <path d="M8.5 9h7" />
          <path d="M8.5 13h4.5" />
          <path d="M8 17l1.5 1.5L12.5 15" />
        </svg>
      );
    case "medications":
      return (
        <svg {...common}>
          <g transform="rotate(-45 12 12)">
            <rect x="4" y="8" width="16" height="8" rx="4" />
            <path d="M12 8v8" />
          </g>
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
          <path d="M3.5 9.5h17" />
          <path d="M8 3v3M16 3v3" />
          <circle cx="8.5" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="14" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "lists":
      return (
        <svg {...common}>
          <path d="M8.5 6h11" />
          <path d="M8.5 12h11" />
          <path d="M8.5 18h11" />
          <circle cx="4.5" cy="6" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.2-3.8 4-5.5 7-5.5s5.8 1.7 7 5.5" />
        </svg>
      );
  }
}
