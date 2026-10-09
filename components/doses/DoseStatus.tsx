import type { DoseEventRecord } from "@/lib/domain/dose-event";

/**
 * How a dose's status looks wherever doses are listed (Today, a
 * medication's History): a tinted tile holding a status mark. Shape AND
 * color carry the state, never color alone — the row's text states it too.
 */
export function formatDoseTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export type DoseVisual = "open" | "snoozed" | "done" | "skipped" | "missed" | "cancelled";

export function doseVisual(status: DoseEventRecord["status"]): DoseVisual {
  switch (status) {
    case "taken":
    case "taken_late":
      return "done";
    case "snoozed":
      return "snoozed";
    case "skipped":
      return "skipped";
    case "missed":
      return "missed";
    case "cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

export function doseStatusText(dose: DoseEventRecord): string | null {
  switch (dose.status) {
    case "taken":
      return `Ελήφθη ${formatDoseTime(dose.takenAt)}`;
    case "taken_late":
      return `Ελήφθη αργότερα, ${formatDoseTime(dose.takenAt)}`;
    case "snoozed":
      return `Αναβολή έως ${formatDoseTime(dose.reminderAt)}`;
    case "skipped":
      return "Παραλείφθηκε";
    case "missed":
      return "Χάθηκε";
    case "cancelled":
      return "Ακυρώθηκε";
    default:
      return null;
  }
}

export const DOSE_TILE_CLASSES: Record<DoseVisual, string> = {
  open: "bg-stone-100 dark:bg-stone-800",
  snoozed: "bg-amber-50 dark:bg-amber-950/60",
  done: "bg-accent-50 dark:bg-accent-950",
  skipped: "bg-stone-100 dark:bg-stone-800",
  missed: "bg-amber-50 dark:bg-amber-950/60",
  cancelled: "bg-stone-100 dark:bg-stone-800",
};

/** The status mark inside the tile. */
export function DoseStatusMark({ visual }: { visual: DoseVisual }) {
  const common = { viewBox: "0 0 32 32", width: 30, height: 30, "aria-hidden": true, focusable: false } as const;
  if (visual === "done") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="14" className="fill-accent-700 dark:fill-accent-500" />
        <path d="m10 16.5 4 4 8-9" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (visual === "missed") {
    // An X, matching Calendar's missed mark (2026-10-09).
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="13" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.4" />
        <path d="m11.5 11.5 9 9m0-9-9 9" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (visual === "skipped" || visual === "cancelled") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="13" fill="none" className="stroke-stone-400 dark:stroke-stone-500" strokeWidth="2.4" />
        <path d="M10.5 16h11" className="stroke-stone-400 dark:stroke-stone-500" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (visual === "snoozed") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="13" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.4" />
        <path d="M16 10v6.5l4 2.5" fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="13" fill="none" className="stroke-accent-800 dark:stroke-accent-400" strokeWidth="2.4" />
    </svg>
  );
}
