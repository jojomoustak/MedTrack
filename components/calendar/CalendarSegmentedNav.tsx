"use client";

import { useRouter } from "next/navigation";
import { playSound } from "@/lib/sound/client/play-sound";

export type CalendarView = "month" | "day" | "timeline";

const SEGMENTS: { key: CalendarView; label: string; href: string }[] = [
  { key: "month", label: "Μήνας", href: "/calendar/month" },
  { key: "day", label: "Ημέρα", href: "/calendar" },
  { key: "timeline", label: "Χρονολόγιο", href: "/calendar/timeline" },
];

/** One segmented control shared by all three Calendar views (Phase 3 §2.6) — switching segments carries the currently-selected date along via the `date` query param, so the user never loses their place. */
export function CalendarSegmentedNav({ active, dateParam }: { active: CalendarView; dateParam: string }) {
  const router = useRouter();

  return (
    <div role="tablist" aria-label="Προβολή ημερολογίου" className="flex gap-2">
      {SEGMENTS.map((segment) => (
        <button
          key={segment.key}
          type="button"
          role="tab"
          aria-selected={active === segment.key}
          onClick={() => {
            playSound("button");
            router.push(`${segment.href}?date=${dateParam}`);
          }}
          className={`min-h-12 flex-1 rounded-full border px-4 py-2 text-sm font-medium ${
            active === segment.key
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
