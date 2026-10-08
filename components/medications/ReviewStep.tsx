"use client";

import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { playSound } from "@/lib/sound/client/play-sound";
import { formatQuantity } from "@/lib/domain/quantity";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { FIELD_INPUT } from "@/components/ui/field-styles";

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
  /** Batch/expiry captured via scan or manual entry — when either is present, this step also asks for a quantity so a real `MedicationPackage` can be created instead of folding the data into free-text notes (`AddMedicationFlow`'s `buildScanNotes` fallback). */
  packageBatch: string | null;
  packageExpiry: string | null;
  initialQuantityValue: string;
  onInitialQuantityValueChange: (value: string) => void;
}

function describeSchedule(schedule: ScheduleDraft): string {
  const quantity = `${formatQuantity(schedule.doseQuantityValue)} ${FORM_LABELS[schedule.doseQuantityUnit as MedicationForm] ?? schedule.doseQuantityUnit}`;
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
export function ReviewStep({
  name,
  form,
  strengthValue,
  strengthUnit,
  inventoryUnit,
  schedule,
  onEditSchedule,
  onFinish,
  submitting,
  error,
  packageBatch,
  packageExpiry,
  initialQuantityValue,
  onInitialQuantityValueChange,
}: ReviewStepProps) {
  const hasPackageData = Boolean(packageBatch || packageExpiry);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-[22px] font-bold tracking-tight text-stone-900 dark:text-stone-50">{name}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-base">
          {form && (
            <>
              <dt className="text-stone-500 dark:text-stone-400">Μορφή</dt>
              <dd>{FORM_LABELS[form as MedicationForm] ?? form}</dd>
            </>
          )}
          {strengthValue && (
            <>
              <dt className="text-stone-500 dark:text-stone-400">Περιεκτικότητα</dt>
              <dd>
                {formatQuantity(strengthValue)} {strengthUnit}
              </dd>
            </>
          )}
          <dt className="text-stone-500 dark:text-stone-400">Μονάδα αποθέματος</dt>
          <dd>{FORM_LABELS[inventoryUnit as MedicationForm] ?? inventoryUnit}</dd>
        </dl>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Πρόγραμμα δόσεων</h3>
          <Button variant="tertiary" onClick={onEditSchedule} className="px-0 underline">
            {schedule ? "Επεξεργασία" : "Προσθήκη"}
          </Button>
        </div>
        <p className="mt-1 text-base text-stone-600 dark:text-stone-400">
          {schedule ? describeSchedule(schedule) : "Χωρίς πρόγραμμα ακόμα — μπορείτε να προσθέσετε αργότερα."}
        </p>
      </Card>

      {hasPackageData && (
        <Card>
          <h3 className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Αρχικό απόθεμα</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-base">
            {packageBatch && (
              <>
                <dt className="text-stone-500 dark:text-stone-400">Παρτίδα</dt>
                <dd>{packageBatch}</dd>
              </>
            )}
            {packageExpiry && (
              <>
                <dt className="text-stone-500 dark:text-stone-400">Λήξη</dt>
                <dd>{packageExpiry}</dd>
              </>
            )}
          </dl>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">Πόσα έχετε; (προαιρετικό)</span>
            <input
              type="text"
              inputMode="decimal"
              value={initialQuantityValue}
              onChange={(e) => onInitialQuantityValueChange(e.target.value)}
              placeholder={`π.χ. 30 ${inventoryUnit}`}
              aria-label="Αρχική ποσότητα"
              className={`${FIELD_INPUT} pr-4`}
            />
          </label>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Αν το συμπληρώσετε, θα δημιουργηθεί μια πραγματική συσκευασία στο απόθεμά σας.
          </p>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <Button
        onClick={() => {
          playSound("button");
          onFinish();
        }}
        disabled={submitting}
        aria-busy={submitting}
        size="lg"
        fullWidth
      >
        {submitting ? "Αποθήκευση…" : "Ολοκλήρωση"}
      </Button>
    </div>
  );
}
