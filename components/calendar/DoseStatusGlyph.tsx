import type { DoseEventStatus } from "@/lib/domain/dose-event";

/** `"projected"` is not a real `DoseEventStatus` — it's ADR-014's ephemeral projection, deliberately kept out of `DoseEventStatus` itself so nothing can construct a fake terminal status for a projected instant. */
export type DoseMarkerKind = DoseEventStatus | "projected";

export const DOSE_MARKER_LABEL: Record<DoseMarkerKind, string> = {
  missed: "Χάθηκε",
  skipped: "Παράλειψη",
  taken_late: "Αργά",
  taken: "Ελήφθη",
  scheduled: "Προγρ.",
  reminded: "Προγρ.",
  snoozed: "Προγρ.",
  cancelled: "Ακυρ.",
  projected: "Προγραμματισμένο",
};

interface DoseStatusGlyphProps {
  kind: DoseMarkerKind;
  className?: string;
}

/**
 * The one shared marker vocabulary for a dose's status across Calendar's
 * month view, timeline view, and dose history detail (Phase 3 §2.6) —
 * always paired with `DOSE_MARKER_LABEL`'s visible text, never color
 * alone (Phase 3 §9). `"projected"` renders as a dashed outline square —
 * deliberately not a status shape at all, so it can never be mistaken for
 * a real, loggable dose (ADR-014).
 */
export function DoseStatusGlyph({ kind, className }: DoseStatusGlyphProps) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    className,
  };

  switch (kind) {
    case "missed":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 3 2 20h20L12 3Z" />
        </svg>
      );
    case "skipped":
      // "Prohibited"-sign style — stroke-only circle + stroke-only slash,
      // both `currentColor`, so it never needs a background-matching
      // cutout that would render wrong in dark mode.
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
        </svg>
      );
    case "taken_late":
      // Checkmark confined to the bottom-left, a small clock badge in the
      // top-right — non-overlapping, so (like `skipped` above) no cutout
      // is needed for either shape to read cleanly in any theme.
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 14l3 3 7-8" strokeWidth={2} />
          <circle cx="17" cy="7" r="6" strokeWidth={1.5} />
          <path d="M17 4v3l2 1.5" strokeWidth={1.5} />
        </svg>
      );
    case "taken":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "cancelled":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "projected":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 2">
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      );
    case "scheduled":
    case "reminded":
    case "snoozed":
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
