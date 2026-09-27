"use client";

import { useRouter } from "next/navigation";
import { SegmentedControl, type Segment } from "@/components/ui/SegmentedControl";
import { playSound } from "@/lib/sound/client/play-sound";

export type CalendarView = "month" | "day";

const HREF_BY_VIEW: Record<CalendarView, string> = { day: "/calendar", month: "/calendar/month" };

const SEGMENTS: Segment<CalendarView>[] = [
  { value: "day", label: "Ημέρα" },
  { value: "month", label: "Μήνας" },
];

/**
 * One segmented control shared by both Calendar views (Phase 3 §2.6) —
 * switching segments carries the currently-selected date along via the
 * `date` query param, so the user never loses their place.
 *
 * Design pass (2026-09-27): dropped from three segments to two. The third,
 * "Χρονολόγιο"/Timeline, showed real doses plus far-future projected ones
 * in the same chronological list Day now shows directly — the two views
 * looked near-identical and read as an unexplained duplicate tab rather
 * than a distinct one; Day absorbed Timeline's behavior instead.
 *
 * Built on the shared `SegmentedControl` (design-system normalization
 * pass) rather than its own hand-rolled copy of the same tablist markup —
 * this component's only real difference from a value/onChange segmented
 * control is that "selecting" a segment navigates instead of setting state.
 */
export function CalendarSegmentedNav({ active, dateParam }: { active: CalendarView; dateParam: string }) {
  const router = useRouter();

  return (
    <SegmentedControl
      segments={SEGMENTS}
      value={active}
      label="Προβολή ημερολογίου"
      onChange={(next) => {
        playSound("button");
        router.push(`${HREF_BY_VIEW[next]}?date=${dateParam}`);
      }}
    />
  );
}
