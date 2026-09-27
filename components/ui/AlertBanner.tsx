import type { ReactNode } from "react";

export type AlertTone = "warn" | "danger";

const TONE_CLASSES: Record<AlertTone, string> = {
  warn: "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200",
  danger: "border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300",
};

/**
 * Inline banner for a persistent-but-not-blocking condition (low stock,
 * sync failure). Icon is required, never color-alone. `onDismiss` is
 * optional — when present this renders a real dismiss control instead of
 * being a fixture the user sees identically every single day (the exact
 * "feels like nagging, not assistance" pattern flagged in the adherence-UX
 * research this redesign is based on).
 */
export function AlertBanner({
  tone,
  icon,
  children,
  onDismiss,
  dismissLabel,
}: {
  tone: AlertTone;
  icon: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${TONE_CLASSES[tone]}`}>
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? "Απόκρυψη"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
