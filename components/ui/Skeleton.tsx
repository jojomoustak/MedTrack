import type { ReactNode } from "react";

/**
 * Skeleton loading (owner's request, 2026-10-14: "skeleton loading, not
 * Φόρτωση"): grey shapes where the content will appear, so a screen keeps
 * its layout while its data loads and nothing jumps when it arrives.
 *
 * The shapes are decorative (`aria-hidden`); `SkeletonStatus` around them
 * still tells a screen reader "Φόρτωση…" once. The pulse is skipped for
 * people who ask the phone for less motion (`motion-safe:`).
 */
export function Skeleton({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const color = tone === "dark" ? "bg-white/10" : "bg-stone-200/80";
  return <span aria-hidden="true" className={`block ${color} motion-safe:animate-pulse ${className}`} />;
}

/** Wraps a screen's (or a section's) skeleton: one screen-reader announcement, nothing focusable. */
export function SkeletonStatus({ label = "Φόρτωση…", className = "", children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// Varied line lengths, so a list of placeholders reads as rows of text rather than a grid of bars.
const FIRST_LINE = ["w-3/5", "w-1/2", "w-2/3", "w-[45%]"];
const SECOND_LINE = ["w-2/5", "w-1/3", "w-1/2", "w-[30%]"];
const THIRD_LINE = ["w-1/3", "w-2/5", "w-1/4", "w-[35%]"];

export interface SkeletonCardRowProps {
  /** Size and shape of the leading tile (avatar, status tile), or null for none. */
  tile?: string | null;
  /** Size and shape of a trailing mark (Today's status circle), or null for none. */
  trailing?: string | null;
  lines?: 1 | 2 | 3;
  /** The real row's own spacing, so the placeholder occupies exactly its space. */
  className?: string;
  /** Position in a list: picks the line lengths. */
  index?: number;
}

/** One card row like the app's dose, medication and list rows: a tile and a few lines of text. */
export function SkeletonCardRow({ tile = "h-14 w-14 rounded-2xl", trailing = null, lines = 2, className = "flex items-center gap-3.5 py-3 pr-2 pl-3", index = 0 }: SkeletonCardRowProps) {
  const i = index % FIRST_LINE.length;
  return (
    <div className={`surface-card ${className}`}>
      {tile && <Skeleton className={`shrink-0 ${tile}`} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 py-1">
        <Skeleton className={`h-4 rounded-md ${FIRST_LINE[i]}`} />
        {lines > 1 && <Skeleton className={`h-3.5 rounded-md ${SECOND_LINE[i]}`} />}
        {lines > 2 && <Skeleton className={`h-3.5 rounded-md ${THIRD_LINE[i]}`} />}
      </div>
      {trailing && <Skeleton className={`shrink-0 ${trailing}`} />}
    </div>
  );
}

/** A column of `SkeletonCardRow`s, spaced like the real lists. */
export function SkeletonCardRows({ count = 3, ...row }: SkeletonCardRowProps & { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCardRow key={index} {...row} index={index} />
      ))}
    </div>
  );
}

/** A form field: its label, then the input box. */
export function SkeletonField({ labelWidth = "w-1/3" }: { labelWidth?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className={`h-4 rounded-md ${labelWidth}`} />
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}

/** `MedicationHeader`'s shape: the avatar beside the name and its subtitle. */
export function SkeletonMedicationHeader() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="h-15 w-15 shrink-0 rounded-2xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Skeleton className="h-5 w-1/2 rounded-md" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
      </div>
    </div>
  );
}
