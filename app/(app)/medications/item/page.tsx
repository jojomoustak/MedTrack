"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { useMedicationInventory } from "@/lib/inventory/client/use-medication-inventory";
import { useFavoriteMedications } from "@/lib/medications/client/use-favorite-medications";
import { InventorySummary } from "@/components/medications/InventorySummary";
import { PackageList } from "@/components/medications/PackageList";
import { MedicationAvatar } from "@/components/medications/MedicationAvatar";
import { DOSE_TILE_CLASSES, DoseStatusMark, doseStatusText, doseVisual, formatDoseTime } from "@/components/doses/DoseStatus";
import { ButtonLink } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import { FilterTabs, type FilterTab } from "@/components/ui/FilterTabs";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import { playSound } from "@/lib/sound/client/play-sound";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { describeSchedule, isScheduleCurrent } from "@/lib/medications/schedule-summary";
import { dosageFormLabel, TREATMENT_STATE_LABELS } from "@/lib/medications/labels";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { usePathId } from "@/lib/navigation/client/use-path-id";

type DetailTab = "overview" | "schedule" | "history";
const DETAIL_TABS: FilterTab<DetailTab>[] = [
  { value: "overview", label: "Επισκόπηση" },
  { value: "schedule", label: "Πρόγραμμα" },
  { value: "history", label: "Ιστορικό" },
];

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "2024-01-10" → "10 Ιαν 2024". */
function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
}

function formatHistoryDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short" });
}

/** A label/value block (reference: "Dosage / 500 mg (1 tablet)"). */
function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[17px] font-semibold text-stone-900 dark:text-stone-100">{label}</dt>
      <dd className="text-[17px] text-stone-600 dark:text-stone-400">{children}</dd>
    </div>
  );
}

/** A scheduled time of day, as the reference's "◦ 08:00" chips. */
function TimeChips({ times, onCard = false }: { times: string[]; onCard?: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2.5" aria-label="Ώρες δόσεων">
      {times.map((t) => (
        <li
          key={t}
          className={`flex min-h-12 items-center gap-2 px-4 text-[17px] font-medium text-stone-800 tabular-nums dark:text-stone-200 ${onCard ? "rounded-xl bg-surface-muted" : "surface-card"}`}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-stone-500">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3.2l2 1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.slice(0, 5)}
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ medication }: { medication: UserMedicationRecord }) {
  const active = medication.treatmentState === "active";
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${
        active ? "bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-400" : "bg-stone-200/70 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
      }`}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="8" cy="8" r="6.2" />
        {active ? <path d="m5.4 8.2 1.8 1.8 3.4-3.6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M5.5 8h5" strokeLinecap="round" />}
      </svg>
      {TREATMENT_STATE_LABELS[medication.treatmentState]}
    </span>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  const path = "M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z";
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.6} strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

/** One schedule's facts — Overview shows the first current one, the Schedule tab lists all of them. */
function ScheduleFacts({ schedule, strength, onCard = false }: { schedule: MedicationScheduleRecord; strength: string | null; onCard?: boolean }) {
  const quantity = doseQuantityLabel(schedule.doseQuantityValue, schedule.doseQuantityUnit);
  const dose = strength && quantity ? `${strength} (${quantity})` : (quantity ?? strength);
  return (
    <>
      {dose && <InfoBlock label="Δόση">{dose}</InfoBlock>}
      <InfoBlock label="Συχνότητα">
        {describeSchedule(schedule)}
        {schedule.timesOfDay && schedule.timesOfDay.length > 0 && <TimeChips times={schedule.timesOfDay} onCard={onCard} />}
      </InfoBlock>
      <InfoBlock label="Έναρξη">{formatDay(schedule.startDate)}</InfoBlock>
      {schedule.endDate && <InfoBlock label="Λήξη">{formatDay(schedule.endDate)}</InfoBlock>}
    </>
  );
}

/**
 * Medication detail (Phase 3 §2.5, Phase 9), laid out after the reference
 * mockup's screen 9: the medication's tile, name, "strength • form" and
 * status, then Overview / Schedule / History. Overview holds the dose,
 * frequency and times, start date and notes the user entered — never a
 * purpose or diagnosis (CLAUDE.md rule 1: this app records what the user
 * says they were prescribed, nothing clinical) — followed by stock, which
 * the reference has no slot for but this app tracks (Phase 9).
 */
export default function MedicationDetailPage() {
  const profileId = useProfileId();
  const params = { id: usePathId(2) };
  const [medication, setMedication] = useState<UserMedicationRecord | null | undefined>(undefined);
  const [schedules, setSchedules] = useState<MedicationScheduleRecord[]>([]);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [doseHistory, setDoseHistory] = useState<DoseEventRecord[] | null>(null);
  const { favoriteIds, toggleFavorite } = useFavoriteMedications(profileId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [med, sched] = await Promise.all([
        new DexieUserMedicationRepository().get(params.id),
        new DexieMedicationScheduleRepository().listByUserMedication(params.id),
      ]);
      if (cancelled) return;
      setMedication(med);
      setSchedules(sched);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Records once per successful load, not on every re-render — a real
  // "viewed" interaction (Phase 2 §2.11).
  useEffect(() => {
    if (medication) recordMedicationInteraction(profileId, medication.id, "viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per medication actually loaded, not on every `profileId`/`medication` object-identity change.
  }, [medication?.id]);

  // Memoized: the name/strength hooks re-resolve whenever this array's
  // identity changes, so a fresh array per render would loop forever.
  const medicationList = useMemo(() => (medication ? [medication] : []), [medication]);
  const names = useDisplayNames(medicationList);
  const strengths = useMedicationStrengths(medicationList);
  const inventory = useMedicationInventory(params.id, medication?.lowStockThresholdValue ?? null);

  // Lazy, once — the History tab's own data, only fetched if the user
  // actually opens it. Past doses only (most recent first): upcoming ones
  // aren't history yet.
  useEffect(() => {
    if (tab !== "history" || doseHistory !== null) return;
    let cancelled = false;
    void new DexieDoseEventRepository().listByUserMedication(params.id).then((events) => {
      if (cancelled) return;
      const now = new Date().toISOString();
      // Cancelled doses never happened (schedule changed / medication stopped).
      const past = events.filter((e) => e.status !== "cancelled" && (e.scheduledAt ?? "") <= now).sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""));
      setDoseHistory(past);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, doseHistory, params.id]);

  if (medication === undefined) {
    return (
      <p role="status" className="p-6 text-sm text-stone-600 dark:text-stone-400">
        Φόρτωση…
      </p>
    );
  }

  if (medication === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-stone-600 dark:text-stone-400">Το φάρμακο δεν βρέθηκε.</p>
        <ButtonLink href="/medications" onClick={() => playSound("button")} variant="tertiary" className="underline">
          Πίσω στα φάρμακα
        </ButtonLink>
      </div>
    );
  }

  const today = localToday();
  const currentSchedules = schedules.filter((s) => isScheduleCurrent(s, today)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const displayName = names.get(medication.id) ?? "…";
  const strength = strengths.get(medication.id) ?? null;
  const form = medication.customForm ?? medication.inventoryUnit;
  const subtitle = [strength, dosageFormLabel(form)].filter(Boolean).join(" • ");
  const isFavorite = favoriteIds.has(medication.id);
  const synced = medication.syncState === "synced";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-1 pb-6">
      <section className="surface-card flex items-start gap-4 p-4" aria-label="Φάρμακο">
        {/* The tile opens the photo screen (take, replace or remove a photo)
            once the medication exists on the server — the photo endpoints
            need a real server row. */}
        {synced ? (
          <Link href={`/medications/${medication.id}/photo`} onClick={() => playSound("button")} aria-label="Φωτογραφία φαρμάκου" className="shrink-0 transition-transform duration-150 active:scale-95">
            <MedicationAvatar medicationId={medication.id} form={form} withPhoto />
          </Link>
        ) : (
          <MedicationAvatar medicationId={medication.id} form={form} withPhoto={false} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight wrap-break-word text-stone-900 dark:text-stone-50">{displayName}</h1>
          {subtitle && <p className="mt-0.5 text-[17px] text-stone-600 dark:text-stone-400">{subtitle}</p>}
          <div className="mt-2.5">
            <StatusPill medication={medication} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            playSound("button");
            toggleFavorite(medication.id);
          }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Αφαίρεση από τα αγαπημένα" : "Προσθήκη στα αγαπημένα"}
          className={`-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full transition duration-200 active:scale-90 ${isFavorite ? "text-amber-500" : "text-stone-400 dark:text-stone-500"}`}
        >
          <StarIcon filled={isFavorite} />
        </button>
      </section>

      <FilterTabs
        tabs={DETAIL_TABS}
        value={tab}
        onChange={(next) => {
          playSound("button");
          setTab(next);
        }}
        label="Λεπτομέρειες φαρμάκου"
      />

      {tab === "overview" && (
        <>
          <dl className="flex flex-col gap-5">
            {currentSchedules[0] ? (
              <ScheduleFacts schedule={currentSchedules[0]} strength={strength} />
            ) : (
              <InfoBlock label="Πρόγραμμα">Χωρίς πρόγραμμα δόσεων</InfoBlock>
            )}
            {medication.notes && <InfoBlock label="Σημειώσεις">{medication.notes}</InfoBlock>}
          </dl>

          {inventory.status === "loading" ? (
            <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
              Φόρτωση αποθέματος…
            </p>
          ) : (
            <section className="flex flex-col gap-3" aria-label="Απόθεμα">
              <InventorySummary
                currentStock={inventory.currentStock}
                quantityUnit={medication.inventoryUnit}
                belowThreshold={inventory.belowThreshold}
                runningLowSoon={inventory.runningLowSoon}
                projection={inventory.projection}
              />
              {/* "Correct stock" stays a text link — a rarer, maintenance-only
                  action next to the common "add package" one. */}
              <div className="flex flex-col items-center gap-1">
                <ButtonLink href={`/medications/${medication.id}/packages/add`} onClick={() => playSound("button")} variant="secondary" fullWidth>
                  Προσθήκη συσκευασίας
                </ButtonLink>
                <ButtonLink
                  href={`/medications/${medication.id}/inventory/correct`}
                  onClick={() => playSound("button")}
                  variant="tertiary"
                  className="text-accent-700 dark:text-accent-400"
                >
                  Διόρθωση αποθέματος
                </ButtonLink>
              </div>
              {inventory.packages.length > 0 && (
                <>
                  <h2 className="mt-1 text-[17px] font-semibold text-stone-900 dark:text-stone-100">Συσκευασίες</h2>
                  <PackageList profileId={profileId} packages={inventory.packages} transactions={inventory.transactions} onChanged={inventory.refresh} />
                </>
              )}
            </section>
          )}

          <ButtonLink href={`/medications/${medication.id}/edit`} onClick={() => playSound("button")} size="lg" fullWidth>
            Επεξεργασία
          </ButtonLink>
        </>
      )}

      {tab === "schedule" &&
        (currentSchedules.length === 0 ? (
          <p className="text-[17px] text-stone-600 dark:text-stone-400">Χωρίς πρόγραμμα δόσεων.</p>
        ) : (
          currentSchedules.map((schedule) => (
            <dl key={schedule.id} className="surface-card flex flex-col gap-5 p-4">
              <ScheduleFacts schedule={schedule} strength={strength} onCard />
            </dl>
          ))
        ))}

      {tab === "history" &&
        (doseHistory === null ? (
          <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
            Φόρτωση ιστορικού…
          </p>
        ) : doseHistory.length === 0 ? (
          <p className="text-[17px] text-stone-600 dark:text-stone-400">Δεν υπάρχει ακόμα ιστορικό δόσεων.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Ιστορικό δόσεων">
            {doseHistory.map((dose) => {
              const visual = doseVisual(dose.status);
              const status = doseStatusText(dose) ?? "Εκκρεμεί";
              const when = `${formatHistoryDay(dose.scheduledAt)} • ${formatDoseTime(dose.scheduledAt)}`;
              return (
                <li key={dose.id}>
                  <Link
                    href={`/calendar/dose/${dose.id}`}
                    onClick={() => playSound("button")}
                    aria-label={`${when}, ${status}`}
                    className="surface-card flex min-h-19 items-center gap-3.5 py-3 pr-2 pl-3"
                  >
                    <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${DOSE_TILE_CLASSES[visual]}`}>
                      <DoseStatusMark visual={visual} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-semibold text-stone-900 tabular-nums dark:text-stone-100">{when}</span>
                      <span className="block truncate text-[15px] text-stone-600 dark:text-stone-400">{status}</span>
                    </span>
                    <ChevronIcon />
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
