"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationInventory } from "@/lib/inventory/client/use-medication-inventory";
import { InventorySummary } from "@/components/medications/InventorySummary";
import { PackageList } from "@/components/medications/PackageList";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
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

  const activeSchedule = schedules.find((s) => s.deletedAt === null) ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <ButtonLink href="/medications" onClick={() => playSound("button")} aria-label="Πίσω στα φάρμακα" variant="tertiary" className="px-0 underline">
          ← Πίσω
        </ButtonLink>
        <ButtonLink href={`/medications/${medication.id}/edit`} onClick={() => playSound("button")} variant="secondary" size="sm">
          Επεξεργασία
        </ButtonLink>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{names.get(medication.id) ?? "…"}</h1>
        {medication.customStrengthValue && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {formatQuantity(medication.customStrengthValue)} {medication.customStrengthUnit}
          </p>
        )}
      </div>

      <Card as="section">
        <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Πρόγραμμα δόσεων</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {activeSchedule ? describeSchedule(activeSchedule) : "Χωρίς πρόγραμμα ακόμα."}
        </p>
      </Card>

      {inventory.status === "loading" ? (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
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

          {/* Design pass (2026-09-27): "Correct inventory" demoted to a text
              link — a rarer, maintenance-only action next to "Add package"
              (the common one), rather than two equal-weight bordered
              buttons competing for attention (button-hierarchy audit). */}
          <div className="flex items-center gap-4">
            <ButtonLink href={`/medications/${medication.id}/packages/add`} onClick={() => playSound("button")} variant="secondary" fullWidth>
              Προσθήκη συσκευασίας
            </ButtonLink>
            <ButtonLink href={`/medications/${medication.id}/inventory/correct`} onClick={() => playSound("button")} variant="tertiary" className="whitespace-nowrap px-0">
              Διόρθωση αποθέματος
            </ButtonLink>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Συσκευασίες</h2>
            <PackageList profileId={profileId} packages={inventory.packages} transactions={inventory.transactions} onChanged={inventory.refresh} />
          </section>
        </>
      )}

      {medication.syncState === "synced" ? (
        <ButtonLink href={`/medications/${medication.id}/photo`} onClick={() => playSound("button")} variant="tertiary" className="self-start px-0 underline">
          Φωτογραφία
        </ButtonLink>
      ) : (
        <p className="text-sm text-stone-500 dark:text-stone-400">Φωτογραφία μετά τον συγχρονισμό</p>
      )}
    </div>
  );
}
