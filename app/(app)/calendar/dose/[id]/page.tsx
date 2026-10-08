"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAccountId, useProfileId } from "@/components/shell/CurrentProfileContext";
import { playSound } from "@/lib/sound/client/play-sound";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { DoseStatusGlyph } from "@/components/calendar/DoseStatusGlyph";
import { Button } from "@/components/ui/Button";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import {
  isDoseActionable,
  recordDoseMissed,
  recordDoseSkipped,
  recordDoseTaken,
  recordDoseTakenLate,
  snoozeDose,
} from "@/lib/doses/client/dose-actions";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { logger } from "@/lib/logging/logger";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function statusText(dose: DoseEventRecord): string {
  switch (dose.status) {
    case "scheduled":
      return "Προγραμματισμένη";
    case "reminded":
      return "Εκκρεμεί";
    case "snoozed":
      return `Σε αναβολή έως ${formatTime(dose.reminderAt)}`;
    case "taken":
      return "Ελήφθη";
    case "taken_late":
      return "Ελήφθη αργότερα";
    case "skipped":
      return "Παραλείφθηκε";
    case "missed":
      return "Χάθηκε";
    case "cancelled":
      return "Ακυρώθηκε";
  }
}

/** An action that can't be undone once written — asks once more before it's recorded. */
type FinalAction = "taken" | "taken_late" | "skipped" | "missed";

const CONFIRM_TEXT: Record<FinalAction, { question: string; confirm: string }> = {
  taken: { question: "Καταγραφή της δόσης ως ελήφθη τώρα;", confirm: "Ναι, την πήρα" },
  taken_late: { question: "Καταγραφή ότι την πήρατε αργότερα;", confirm: "Ναι, την πήρα" },
  skipped: { question: "Παράλειψη αυτής της δόσης;", confirm: "Ναι, παράλειψη" },
  missed: { question: "Σήμανση αυτής της δόσης ως χαμένης;", confirm: "Ναι, χάθηκε" },
};

function DetailIcon({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <dt className="text-[15px] font-semibold text-stone-900 dark:text-stone-100">{label}</dt>
        <dd className="text-[15px] text-stone-600 dark:text-stone-400">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Dose detail (reference mockup, screen 18). Read-only facts, plus the
 * actions that moved here from Today's rows (user's choice, 2026-10-04):
 * Taken, Snooze, Skip, Mark missed — and "taken late" for a missed dose.
 * All go through `dose-actions.ts`, the same path Today uses. Actions that
 * can't be undone ask for a second tap first; Snooze is repeatable and
 * applies immediately. Editing the taken time or adding a note isn't
 * offered: the sync model has no mutation for changing a recorded dose.
 */
export default function DoseDetailPage() {
  const profileId = useProfileId();
  const accountId = useAccountId();
  const params = useParams<{ id: string }>();
  const [dose, setDose] = useState<DoseEventRecord | null | undefined>(undefined);
  const [confirming, setConfirming] = useState<FinalAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);

  // Bumped after every action, to re-read the dose's new state.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const record = await new DexieDoseEventRepository().get(params.id);
      if (!cancelled) setDose(record);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, reloadKey]);

  async function run(action: FinalAction | "snoozed") {
    if (!dose || busy) return;
    setBusy(true);
    setFailed(false);
    setConfirming(null);
    try {
      if (action === "taken") await recordDoseTaken(dose.id, profileId);
      else if (action === "taken_late") await recordDoseTakenLate(dose.id, profileId);
      else if (action === "skipped") await recordDoseSkipped(dose.id, profileId);
      else if (action === "missed") await recordDoseMissed(dose.id, profileId);
      else await snoozeDose(dose.id, profileId, accountId);
      playSound("success");
    } catch (err) {
      setFailed(true);
      logger.warn("dose_detail.action_failed", { action, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setReloadKey((k) => k + 1);
    }
  }

  function ask(action: FinalAction) {
    playSound("button");
    setConfirming(action);
  }

  const medicationName = dose ? (names.get(dose.userMedicationId) ?? "…") : "…";
  const strength = dose ? strengths.get(dose.userMedicationId) : null;
  const quantity = dose ? doseQuantityLabel(dose.quantityValue, dose.quantityUnit) : null;
  const doseText = quantity && strength ? `${quantity} (${strength})` : (quantity ?? strength ?? "—");
  const actionable = dose ? isDoseActionable(dose) : false;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-1 pb-6">

      {dose === undefined && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {dose === null && <p className="text-[15px] text-stone-600 dark:text-stone-400">Δεν βρέθηκε αυτή η δόση.</p>}

      {dose && (
        <>
          <div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Λεπτομέρειες δόσης</h1>
            <p className="mt-1 text-[17px] font-semibold text-stone-700 dark:text-stone-300">{medicationName}</p>
          </div>

          <dl className="surface-card divide-y divide-stone-100 px-4 py-1 dark:divide-stone-800">
            <DetailRow
              label="Ημερομηνία"
              icon={
                <DetailIcon>
                  <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                  <path d="M3.5 9.5h17M8 3v4M16 3v4" />
                </DetailIcon>
              }
            >
              {formatDate(dose.scheduledAt)}
            </DetailRow>
            <DetailRow
              label="Ώρα"
              icon={
                <DetailIcon>
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </DetailIcon>
              }
            >
              <span className="tabular-nums">{formatTime(dose.scheduledAt)}</span>
            </DetailRow>
            <DetailRow
              label="Δόση"
              icon={
                <DetailIcon>
                  <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" />
                  <path d="m9.5 9.5 5 5" />
                </DetailIcon>
              }
            >
              {doseText}
            </DetailRow>
            <DetailRow
              label="Κατάσταση"
              icon={
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800">
                  <DoseStatusGlyph kind={dose.status} className="h-6 w-6" />
                </span>
              }
            >
              <span aria-live="polite">{statusText(dose)}</span>
            </DetailRow>
            {(dose.status === "taken" || dose.status === "taken_late") && (
              <DetailRow
                label="Ώρα λήψης"
                icon={
                  <DetailIcon>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </DetailIcon>
                }
              >
                <span className="tabular-nums">{formatTime(dose.takenAt)}</span>
              </DetailRow>
            )}
            {dose.notes && (
              <DetailRow
                label="Σημειώσεις"
                icon={
                  <DetailIcon>
                    <path d="M6 4h9l3 3v13H6z" />
                    <path d="M9 11h6M9 15h6" />
                  </DetailIcon>
                }
              >
                {dose.notes}
              </DetailRow>
            )}
          </dl>

          {dose.syncState !== "synced" && (
            <div>
              <SyncStatusChip state={dose.syncState} />
            </div>
          )}

          {failed && (
            <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">
              Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.
            </p>
          )}

          {confirming ? (
            <div className="surface-card flex flex-col gap-3 p-4">
              <p className="text-[16px] font-semibold text-stone-900 dark:text-stone-100">{CONFIRM_TEXT[confirming].question}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="lg" fullWidth onClick={() => setConfirming(null)}>
                  Ακύρωση
                </Button>
                <Button
                  variant={confirming === "missed" ? "danger" : "primary"}
                  size="lg"
                  fullWidth
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void run(confirming)}
                >
                  {CONFIRM_TEXT[confirming].confirm}
                </Button>
              </div>
            </div>
          ) : actionable ? (
            <div className="flex flex-col gap-3">
              <Button size="lg" fullWidth disabled={busy} onClick={() => ask("taken")}>
                Έλαβα
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={busy}
                  onClick={() => void run("snoozed")}
                >
                  Αναβολή
                </Button>
                <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={() => ask("skipped")}>
                  Παράλειψη
                </Button>
              </div>
              <Button variant="danger-outline" size="lg" fullWidth disabled={busy} onClick={() => ask("missed")}>
                Σήμανση ως χαμένη
              </Button>
            </div>
          ) : (
            dose.status === "missed" && (
              <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={() => ask("taken_late")}>
                Το πήρα αργότερα
              </Button>
            )
          )}
        </>
      )}
    </main>
  );
}
