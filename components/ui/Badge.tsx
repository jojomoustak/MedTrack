import type { ReactNode } from "react";

export type BadgeTone = "accent" | "warn" | "danger" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  // `accent-300` doesn't exist in this app's custom accent scale (only
  // 50/100/400/500/600/700/800/900/950 are defined, unlike the built-in
  // amber/red scales below which have every shade) — a pre-existing bug
  // found during a later redesign audit, fixed here rather than left now
  // that it's spotted.
  accent: "bg-accent-50 text-accent-800 dark:bg-accent-950 dark:text-accent-400",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  neutral: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

/**
 * Small status label (Ενεργό / Χαμηλό απόθεμα / etc.). Never the sole
 * carrier of a status — pair with an icon or text a screen reader gets too
 * (this app's own accessibility rule: status is never color-alone).
 */
export function Badge({ tone = "neutral", icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {icon}
      {children}
    </span>
  );
}
