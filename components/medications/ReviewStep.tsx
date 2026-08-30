"use client";

import { FORM_LABELS } from "@/components/medications/DetailsStep";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";
import type { MedicationForm } from "@/lib/domain/user-medication";

export interface ReviewStepProps {
  name: string;
  form: string | null;
  strengthValue: string;
  strengthUnit: string;
  inventoryUnit: string;
  schedule: ScheduleDraft | null;
  onEditSchedule: () => void;
  onFinish: () => void;
  submitting: boolean;
  error: string | null;
}

function describeSchedule(schedule: ScheduleDraft): string {
  const quantity = `${schedule.doseQuantityValue} ${FORM_LABELS[schedule.doseQuantityUnit as MedicationForm] ?? schedule.doseQuantityUnit}`;
  if (schedule.scheduleKind === "prn") {
    return `Όποτε χρειάζεται — ${quantity}`;
  }
  if (schedule.scheduleKind === "every_n_hours") {
    return `Κάθε ${schedule.intervalHours} ώρες — ${quantity}`;
  }
  const times = (schedule.timesOfDay ?? []).join(", ");
  const days = schedule.scheduleKind === "specific_weekdays" ? "συγκεκριμένες ημέρες" : "κάθε μέρα";
  return `${times} (${days}) — ${quantity}`;
}

/** Phase 3 §2.4 "Add Medication — review & finish": summary before creating the `UserMedication` (+ optional `MedicationSchedule`) rows. */
export function ReviewStep({ name, form, strengthValue, strengthUnit, inventoryUnit, schedule, onEditSchedule, onFinish, submitting, error }: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-lg font-semibold">{name}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {form && (
            <>
              <dt className="text-zinc-500">Μορφή</dt>
              <dd>{form}</dd>
            </>
          )}
          {strengthValue && (
            <>
              <dt className="text-zinc-500">Περιεκτικότητα</dt>
              <dd>
                {strengthValue} {strengthUnit}
              </dd>
            </>
          )}
          <dt className="text-zinc-500">Μονάδα αποθέματος</dt>
          <dd>{inventoryUnit}</dd>
        </dl>
      </div>

      <div className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Πρόγραμμα δόσεων</h3>
          <button type="button" onClick={onEditSchedule} className="min-h-12 text-sm font-medium underline">
            {schedule ? "Επεξεργασία" : "Προσθήκη"}
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {schedule ? describeSchedule(schedule) : "Χωρίς πρόγραμμα ακόμα — μπορείτε να προσθέσετε αργότερα."}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onFinish}
        disabled={submitting}
        aria-busy={submitting}
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {submitting ? "Αποθήκευση…" : "Ολοκλήρωση"}
      </button>
    </div>
  );
}
