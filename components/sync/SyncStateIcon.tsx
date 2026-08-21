import type { ChipIconShape } from "@/components/sync/sync-state-config";

interface SyncStateIconProps {
  shape: ChipIconShape;
  /** Static (non-animated) rendering of the syncing icon — Phase 3 §5/§9's reduced-motion requirement: "no critical status is ever conveyed by motion alone." */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * Small, dependency-free inline SVGs — deliberately simple/geometric
 * (this is a foundation primitive, not final visual design). Always
 * `aria-hidden`: the accessible name comes from the chip's own
 * `aria-label`/visible text (Phase 3 §9 — "every icon-only affordance
 * also carries an accessible text label," never conveyed by the glyph
 * alone).
 */
export function SyncStateIcon({ shape, reducedMotion, className }: SyncStateIconProps) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };

  switch (shape) {
    case "device":
      return (
        <svg {...common}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      );
    case "clock-upload":
      return (
        <svg {...common}>
          <circle cx="11" cy="12" r="8" />
          <path d="M11 8v4l3 2" />
          <path d="M19 4v6m0-6-2.5 2.5M19 4l2.5 2.5" />
        </svg>
      );
    case "sync-arrows":
      return (
        <svg {...common} className={[className, reducedMotion ? undefined : "animate-spin"].filter(Boolean).join(" ")}>
          <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
          <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
          <path d="M3 16v4h4" />
          <path d="M21 8V4h-4" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "warning-triangle":
      return (
        <svg {...common}>
          <path d="M12 3 2 20h20L12 3Z" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "warning-circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M6 7l1 13h10l1-13" />
        </svg>
      );
    default:
      return null;
  }
}
