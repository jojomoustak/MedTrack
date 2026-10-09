"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { authClient } from "@/lib/auth/client/auth-client";
import { DayStrip } from "@/components/today/DayStrip";
import { TodayDoseRow } from "@/components/today/TodayDoseRow";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { useLowStockMedicationIds } from "@/lib/inventory/client/use-low-stock-medications";
import { useTodayDoseEvents, allTodayDosesResolved } from "@/components/today/use-today-dose-events";
import { isDoseTaken } from "@/lib/domain/dose-event";
import { isDoseActionable, recordAllDosesTaken, recordDoseTaken, recordDoseTakenLate } from "@/lib/doses/client/dose-actions";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";
import { logger } from "@/lib/logging/logger";

function LowStockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor" className="shrink-0">
      <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
    </svg>
  );
}

/**
 * Journey 5's Today banner — same icon+text cue as `InventorySummary`
 * (medication detail) and the Medications list badge, never color alone.
 * Non-blocking: rendered above the dose list, never gates it.
 *
 * UX audit (2026-09-27): `onDismiss` hides it for this session only (plain
 * component state, no outbox entry) — it reappears on next launch, since
 * the underlying low-stock FACT hasn't changed and shouldn't be silently
 * suppressed forever, only de-prioritized for the rest of today's visits.
 */
function LowStockBanner({ names, onDismiss }: { names: string[]; onDismiss: () => void }) {
  const label = names.length === 1 ? `${names[0]} — χαμηλό απόθεμα.` : `${names.length} φάρμακα με χαμηλό απόθεμα: ${names.join(", ")}.`;
  return (
    <AlertBanner tone="warn" icon={<LowStockIcon />} onDismiss={onDismiss} dismissLabel="Απόκρυψη ειδοποίησης χαμηλού αποθέματος για τώρα">
      <Link href="/medications" onClick={() => playSound("button")} className="block min-h-11 py-1.5">
        {label}
      </Link>
    </AlertBanner>
  );
}

/** Greek has no distinct "good afternoon" — Καλημέρα until noon, Καλησπέρα after (common convention). */
function greeting(now: Date): string {
  return now.getHours() < 12 ? "Καλημέρα" : "Καλησπέρα";
}

/** Today's greeting (reference mockup, screen 1) — the wordmark and sync indicator above it come from the shared `AppBar`. */
function TodayGreeting({ today }: { today: Date }) {
  const { data: session } = authClient.useSession();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];

  return (
    <div>
      <h1 className="text-[30px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">
        {greeting(today)}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-1 text-[16px] text-stone-600 dark:text-stone-400">Μείνετε συνεπείς. Τα πάτε καλά!</p>
    </div>
  );
}

/**
 * Today (Phase 3 §2.2) — the daily adherence loop's home screen, laid out
 * after the reference mockup's screen 1: greeting, day cards, then today's
 * doses as compact rows with a completion ring. Recording goes through
 * `lib/doses/client/dose-actions.ts`, shared with Dose Detail.
 */
export default function TodayPage() {
  const profileId = useProfileId();
  const today = useMemo(() => new Date(), []);
  const { status: medsStatus, medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);
  // Journey 5 (Phase 3 §3): the same non-color low-stock cue as the
  // Medications list badge and the medication detail banner.
  const lowStockIds = useLowStockMedicationIds(profileId, medications);
  const lowStockNames = [...lowStockIds].map((id) => names.get(id)).filter((n): n is string => Boolean(n));
  const [lowStockDismissed, setLowStockDismissed] = useState(false);
  // A dose crossed from "not yet due" to "due now" while this page stayed
  // open — the in-app chime, separate from the native reminder (Phase 11).
  const { status: dosesStatus, todayDoses, refresh } = useTodayDoseEvents(profileId, () => playSound("notification"));
  const [confirmingMarkAll, setConfirmingMarkAll] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  function handleTake(doseId: string, kind: "taken" | "taken_late") {
    const record = kind === "taken" ? recordDoseTaken : recordDoseTakenLate;
    record(doseId, profileId)
      .then(() => playSound("success"))
      .catch((err) => logger.warn("today.record_dose_failed", { message: err instanceof Error ? err.message : String(err) }))
      .finally(refresh);
  }

  /**
   * Bulk "mark all as taken" requires an explicit confirm tap first: one
   * tap here can commit several real medications as taken at once, so the
   * safety net is a confirm step instead of a per-row undo window
   * (CLAUDE.md's priority order puts Safety/Data integrity above speed).
   */
  async function handleMarkAllTaken() {
    setConfirmingMarkAll(false);
    setMarkingAll(true);
    try {
      await recordAllDosesTaken(todayDoses, profileId);
      playSound("success");
    } catch (err) {
      logger.warn("today.mark_all_failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      setMarkingAll(false);
      refresh();
    }
  }

  if (medsStatus === "loading" || dosesStatus === "loading") {
    return (
      <p role="status" className="p-6 text-sm text-stone-600 dark:text-stone-400">
        Φόρτωση…
      </p>
    );
  }

  const lowStock = lowStockNames.length > 0 && !lowStockDismissed && <LowStockBanner names={lowStockNames} onDismiss={() => setLowStockDismissed(true)} />;

  if (medications.length === 0) {
    return (
      <div className="flex flex-col gap-6 px-5 pt-1 pb-6">
        <TodayGreeting today={today} />
        <div className="surface-card flex flex-col items-center gap-4 px-6 py-8 text-center">
          <p className="text-[17px] font-semibold">Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.</p>
          <p className="text-[15px] text-stone-600 dark:text-stone-400">Προσθέστε το πρώτο σας φάρμακο και το πρόγραμμά του, για να εμφανίζονται εδώ οι δόσεις της ημέρας.</p>
          <ButtonLink href="/medications/add" onClick={() => playSound("button")} size="lg" fullWidth>
            Προσθήκη φαρμάκου
          </ButtonLink>
        </div>
      </div>
    );
  }

  const total = todayDoses.length;
  // Progress counts doses actually taken — a missed or skipped dose is recorded, not completed.
  const takenCount = todayDoses.filter((d) => isDoseTaken(d.status)).length;
  const allResolved = total > 0 && allTodayDosesResolved(todayDoses);
  const hasActionableDose = todayDoses.some(isDoseActionable);
  const percent = total > 0 ? Math.round((takenCount / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 px-5 pt-1 pb-6">
      <TodayGreeting today={today} />
      <DayStrip today={today} />

      {lowStock}

      <section className="flex flex-col gap-3" aria-labelledby="today-doses-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="today-doses-heading" className="text-[24px] font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Σημερινές δόσεις
            </h2>
            <p role="status" className="mt-0.5 text-[15px] text-stone-600 dark:text-stone-400">
              {total === 0
                ? "Καμία προγραμματισμένη δόση σήμερα."
                : allResolved
                  ? "Όλες οι δόσεις καταγράφηκαν."
                  : `${takenCount} από ${total} ελήφθησαν`}
            </p>
          </div>
          {total > 0 && (
            <div aria-hidden="true" className="text-accent-700 dark:text-accent-400">
              <ProgressRing value={takenCount} total={total} size={92} strokeWidth={9} label={`${percent}%`} labelClassName="text-[19px] font-bold text-stone-900 dark:text-stone-50" />
            </div>
          )}
        </div>

        {total === 0 ? (
          <Link href="/medications" onClick={() => playSound("button")} className="inline-flex min-h-12 items-center text-[15px] font-semibold text-accent-700 dark:text-accent-400">
            Δείτε τα φάρμακά σας
          </Link>
        ) : (
          <div className="flex flex-col gap-3">
            {todayDoses.map((dose) => (
              <TodayDoseRow
                key={dose.id}
                dose={dose}
                medicationName={names.get(dose.userMedicationId) ?? "…"}
                medicationStrength={strengths.get(dose.userMedicationId)}
                onTake={handleTake}
              />
            ))}
          </div>
        )}
      </section>

      {hasActionableDose &&
        (confirmingMarkAll ? (
          <div className="flex flex-col gap-2">
            <p className="text-center text-[15px] text-stone-700 dark:text-stone-300">Να καταγραφούν όλες οι υπόλοιπες δόσεις ως ελήφθησαν τώρα;</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={() => setConfirmingMarkAll(false)} fullWidth>
                Ακύρωση
              </Button>
              <Button size="lg" onClick={() => void handleMarkAllTaken()} disabled={markingAll} aria-busy={markingAll} fullWidth>
                {markingAll ? "Καταγραφή…" : "Ναι, όλες"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={() => {
              playSound("button");
              setConfirmingMarkAll(true);
            }}
            fullWidth
          >
            Καταγραφή όλων ως ελήφθησαν
          </Button>
        ))}
    </div>
  );
}
