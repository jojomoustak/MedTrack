"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationInventory } from "@/lib/inventory/client/use-medication-inventory";
import { InventorySummary } from "@/components/medications/InventorySummary";
import { PackageList } from "@/components/medications/PackageList";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import { playSound } from "@/lib/sound/client/play-sound";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { formatQuantity } from "@/lib/domain/quantity";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { MedicationForm } from "@/lib/domain/user-medication";

function unitLabel(unit: string): string {
  return FORM_LABELS[unit as MedicationForm] ?? unit;
}

function describeSchedule(schedule: MedicationScheduleRecord): string {
  const quantity = `${formatQuantity(schedule.doseQuantityValue)} ${unitLabel(schedule.doseQuantityUnit)}`;
  if (schedule.scheduleKind === "prn") return `Όποτε χρειάζεται — ${quantity}`;
  if (schedule.scheduleKind === "every_n_hours") return `Κάθε ${schedule.intervalHours} ώρες — ${quantity}`;
  const times = (schedule.timesOfDay ?? []).join(", ");
  const days = schedule.scheduleKind === "specific_weekdays" ? "συγκεκριμένες ημέρες" : "κάθε μέρα";
  return `${times} (${days}) — ${quantity}`;
}

/**
 * Medication detail (Phase 3 §2.5, Phase 9) — name, schedule summary,
 * inventory summary, package list. The screen this project's photo page
 * (`app/medications/[id]/photo/page.tsx`) explicitly flagged as not-yet-
 * built ("NOT a general medication detail/edit page... see
 * docs/mobile/... for when a real detail page eventually lands").
 */
export default function MedicationDetailPage() {
  const profileId = useProfileId();
  const params = useParams<{ id: string }>();
  const [medication, setMedication] = useState<UserMedicationRecord | null | undefined>(undefined);
  const [schedules, setSchedules] = useState<MedicationScheduleRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const medRepo = new DexieUserMedicationRepository();
      const scheduleRepo = new DexieMedicationScheduleRepository();
      const [med, sched] = await Promise.all([medRepo.get(params.id), scheduleRepo.listByUserMedication(params.id)]);
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
  // "viewed" interaction (Phase 2 §2.11), backing the Medications list's
  // "Recent" segment.
  useEffect(() => {
    if (medication) recordMedicationInteraction(profileId, medication.id, "viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per medication actually loaded, not on every `profileId`/`medication` object-identity change.
  }, [medication?.id]);

  const names = useDisplayNames(medication ? [medication] : []);
  const inventory = useMedicationInventory(params.id, medication?.lowStockThresholdValue ?? null);

  if (medication === undefined) {
    return (
      <p role="status" className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
        Φόρτωση…
      </p>
    );
  }

  if (medication === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Το φάρμακο δεν βρέθηκε.</p>
        <Link href="/medications" onClick={() => playSound("button")} className="inline-flex items-center justify-center min-h-12 text-sm font-medium underline">
          Πίσω στα φάρμακα
        </Link>
      </div>
    );
  }

  const activeSchedule = schedules.find((s) => s.deletedAt === null) ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/medications" onClick={() => playSound("button")} aria-label="Πίσω στα φάρμακα" className="inline-flex items-center justify-center min-h-12 text-sm font-medium underline">
          ← Πίσω
        </Link>
        <Link
          href={`/medications/${medication.id}/edit`}
          onClick={() => playSound("button")}
          className="inline-flex items-center justify-center min-h-12 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Επεξεργασία
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{names.get(medication.id) ?? "…"}</h1>
        {medication.customStrengthValue && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {formatQuantity(medication.customStrengthValue)} {medication.customStrengthUnit}
          </p>
        )}
      </div>

      <section className="rounded-xl shadow-sm shadow-zinc-300/40 dark:border dark:border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Πρόγραμμα δόσεων</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {activeSchedule ? describeSchedule(activeSchedule) : "Χωρίς πρόγραμμα ακόμα."}
        </p>
      </section>

      {inventory.status === "loading" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση αποθέματος…
        </p>
      ) : (
        <>
          <InventorySummary
            currentStock={inventory.currentStock}
            quantityUnit={medication.inventoryUnit}
            belowThreshold={inventory.belowThreshold}
            runningLowSoon={inventory.runningLowSoon}
            projection={inventory.projection}
          />

          <div className="flex gap-2">
            <Link
              href={`/medications/${medication.id}/packages/add`}
              onClick={() => playSound("button")}
              className="min-h-12 flex-1 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium dark:border-zinc-700"
            >
              Προσθήκη συσκευασίας
            </Link>
            <Link
              href={`/medications/${medication.id}/inventory/correct`}
              onClick={() => playSound("button")}
              className="min-h-12 flex-1 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium dark:border-zinc-700"
            >
              Διόρθωση αποθέματος
            </Link>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Συσκευασίες</h2>
            <PackageList profileId={profileId} packages={inventory.packages} transactions={inventory.transactions} onChanged={inventory.refresh} />
          </section>
        </>
      )}

      {medication.syncState === "synced" ? (
        <Link href={`/medications/${medication.id}/photo`} onClick={() => playSound("button")} className="inline-flex items-center justify-center min-h-12 text-sm font-medium underline">
          Φωτογραφία
        </Link>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Φωτογραφία μετά τον συγχρονισμό</p>
      )}
    </div>
  );
}
