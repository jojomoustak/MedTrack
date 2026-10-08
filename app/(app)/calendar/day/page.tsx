"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { useDoseEventsForRange } from "@/components/calendar/use-dose-events-for-range";
import { ChevronIcon } from "@/components/calendar/ChevronIcon";
import { DoseStatusGlyph } from "@/components/calendar/DoseStatusGlyph";
import { DoseStatusMark, doseStatusText, doseVisual, formatDoseTime } from "@/components/doses/DoseStatus";
import { SproutIllustration } from "@/components/shell/SproutIllustration";
import { dateToParam, paramToDate } from "@/components/calendar/date-param";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { isDoseTaken, type DoseEventRecord } from "@/lib/domain/dose-event";
import { playSound } from "@/lib/sound/client/play-sound";

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** A not-yet-recorded dose: "Εκκρεμεί" once its time has passed, "Προσεχώς" before. */
function timelineStatus(dose: DoseEventRecord, now: string): string {
  return doseStatusText(dose) ?? ((dose.scheduledAt ?? "") <= now ? "Εκκρεμεί" : "Προσεχώς");
}

/**
 * One day as a timeline (reference mockup, screen 16) — reached from the
 * Calendar's day heading. Each real dose opens its own screen; doses
 * beyond the generation horizon (ADR-014's projection) show dashed and
 * aren't links. Today also gets the quiet "X of Y" encouragement card —
 * a factual restatement, never a score or streak.
 */
export default function CalendarDayPage() {
  const profileId = useProfileId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = paramToDate(searchParams.get("date"));
  const { medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);
  const { status, doses, projected } = useDoseEventsForRange(profileId, startOfLocalDay(date), endOfLocalDay(date));
  const now = useMemo(() => new Date().toISOString(), []);

  const items = useMemo(() => {
    const real = doses.filter((d) => d.scheduledAt !== null).map((dose) => ({ kind: "real" as const, scheduledAt: dose.scheduledAt!, dose }));
    const proj = projected.map((instant) => ({ kind: "projected" as const, scheduledAt: instant.scheduledAt, instant }));
    return [...real, ...proj].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [doses, projected]);

  const isToday = isSameLocalDay(date, new Date());
  const title = isToday ? "Σήμερα" : date.toLocaleDateString("el-GR", { weekday: "long" });
  const subtitle = date.toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  // Only doses actually taken — a missed one must never read as progress.
  const taken = doses.filter((d) => isDoseTaken(d.status)).length;

  function shiftDay(delta: number) {
    playSound("button");
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    router.replace(`/calendar/day?date=${dateToParam(next)}`);
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 first-letter:uppercase dark:text-stone-50">{title}</h1>
          <p className="mt-0.5 text-[17px] text-stone-600 dark:text-stone-400">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label="Προηγούμενη ημέρα"
            className="flex size-11 items-center justify-center rounded-xl bg-surface-muted text-stone-700 active:scale-95 dark:text-stone-300"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            aria-label="Επόμενη ημέρα"
            className="flex size-11 items-center justify-center rounded-xl bg-surface-muted text-stone-700 active:scale-95 dark:text-stone-300"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      {status === "loading" ? (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      ) : items.length === 0 ? (
        <p className="text-[17px] text-stone-600 dark:text-stone-400">Καμία δόση αυτή την ημέρα.</p>
      ) : (
        <ol className="surface-card flex flex-col px-4 py-2" aria-label="Δόσεις ημέρας">
          {items.map((item, i) => {
            const last = i === items.length - 1;
            // The line joining one dose to the next runs through the status
            // column, from just under this dose's mark to the next row.
            const connector = !last && <span aria-hidden="true" className="absolute top-12 bottom-0 left-[15px] w-0.5 bg-stone-200 dark:bg-stone-700" />;

            if (item.kind === "projected") {
              return (
                <li key={`${item.instant.scheduleId}-${i}`} className="relative flex gap-3 py-3">
                  {connector}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center text-stone-400" aria-hidden="true">
                    <DoseStatusGlyph kind="projected" className="h-6 w-6" />
                  </span>
                  <span className="w-12 shrink-0 pt-1 text-[15px] text-stone-500 tabular-nums">{formatDoseTime(item.scheduledAt)}</span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block truncate text-[17px] font-bold text-stone-700 dark:text-stone-300">{names.get(item.instant.userMedicationId) ?? "…"}</span>
                    <span className="block text-[15px] text-stone-500 dark:text-stone-400">Προγραμματισμένη</span>
                  </span>
                </li>
              );
            }

            const dose = item.dose;
            const visual = doseVisual(dose.status);
            const name = names.get(dose.userMedicationId) ?? "…";
            const strength = strengths.get(dose.userMedicationId);
            const doseTitle = strength ? `${name} ${strength}` : name;
            const quantity = doseQuantityLabel(dose.quantityValue, dose.quantityUnit);
            const statusText = timelineStatus(dose, now);
            const time = formatDoseTime(dose.scheduledAt);
            return (
              <li key={dose.id} className="relative">
                {connector}
                <Link
                  href={`/calendar/dose/${dose.id}`}
                  onClick={() => playSound("button")}
                  aria-label={`${time}, ${doseTitle}, ${quantity ?? ""}, ${statusText}`}
                  className="flex gap-3 py-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center [&>svg]:h-8 [&>svg]:w-8" aria-hidden="true">
                    <DoseStatusMark visual={visual} />
                  </span>
                  <span className={`w-12 shrink-0 pt-1 text-[15px] tabular-nums ${visual === "done" ? "font-semibold text-accent-700 dark:text-accent-400" : "text-stone-500 dark:text-stone-400"}`}>
                    {time}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block truncate text-[17px] font-bold text-stone-900 dark:text-stone-50">{doseTitle}</span>
                    {quantity && <span className="block text-[15px] text-stone-600 dark:text-stone-400">{quantity}</span>}
                    <span
                      className={`block text-[15px] font-medium ${
                        visual === "done" ? "text-accent-700 dark:text-accent-400" : visual === "missed" || visual === "snoozed" ? "text-amber-700 dark:text-amber-400" : "text-stone-500 dark:text-stone-400"
                      }`}
                    >
                      {statusText}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {isToday && doses.length > 0 && taken > 0 && (
        <div className="flex items-center gap-4 overflow-hidden rounded-2xl bg-accent-50 pr-4 dark:bg-accent-950">
          <SproutIllustration className="h-24 w-28 shrink-0 translate-y-2" />
          <div className="py-4">
            <p className="text-[19px] font-bold text-stone-900 dark:text-stone-50">{taken === doses.length ? "Μπράβο!" : "Συνεχίστε έτσι!"}</p>
            <p className="text-[15px] text-stone-700 dark:text-stone-300">
              {taken} από {doses.length} δόσεις ελήφθησαν σήμερα.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
