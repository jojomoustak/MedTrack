"use client";

import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { playSound } from "@/lib/sound/client/play-sound";
import { formatQuantity } from "@/lib/domain/quantity";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";
import type { MedicationForm } from "@/lib/domain/user-medication";
import { FIELD_INPUT } from "@/components/ui/field-styles";
import { useT, T } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translate";

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

/** The review's one line for a schedule, in the screen's language (`t`). */
function describeSchedule(schedule: ScheduleDraft, t: Translator): string {
  const unit = FORM_LABELS[schedule.doseQuantityUnit as MedicationForm];
  const quantity = `${formatQuantity(schedule.doseQuantityValue)} ${unit ? t(unit) : schedule.doseQuantityUnit}`;
  if (schedule.scheduleKind === "prn") {
    return t("Όποτε χρειάζεται — {quantity}", { quantity });
  }
  if (schedule.scheduleKind === "every_n_hours") {
    return t("Κάθε {hours} ώρες — {quantity}", { hours: schedule.intervalHours ?? "?", quantity });
  }
  const times = (schedule.timesOfDay ?? []).join(", ");
  const days = schedule.scheduleKind === "specific_weekdays" ? t("συγκεκριμένες ημέρες") : t("κάθε μέρα");
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
  const t = useT();
  const hasPackageData = Boolean(packageBatch || packageExpiry);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-[22px] font-bold tracking-tight text-stone-900">{name}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-base">
          {form && (
            <>
              <dt className="text-stone-500"><T>Μορφή</T></dt>
              <dd>{FORM_LABELS[form as MedicationForm] ? t(FORM_LABELS[form as MedicationForm]) : form}</dd>
            </>
          )}
          {strengthValue && (
            <>
              <dt className="text-stone-500"><T>Περιεκτικότητα</T></dt>
              <dd>
                {formatQuantity(strengthValue)} {strengthUnit}
              </dd>
            </>
          )}
          <dt className="text-stone-500"><T>Μονάδα αποθέματος</T></dt>
          <dd>{FORM_LABELS[inventoryUnit as MedicationForm] ? t(FORM_LABELS[inventoryUnit as MedicationForm]) : inventoryUnit}</dd>
        </dl>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-semibold text-stone-800"><T>Πρόγραμμα δόσεων</T></h3>
          <Button variant="tertiary" onClick={onEditSchedule} className="px-0 underline">
            {schedule ? t("Επεξεργασία") : t("Προσθήκη")}
          </Button>
        </div>
        <p className="mt-1 text-base text-stone-600">
          {schedule ? describeSchedule(schedule, t) : t("Χωρίς πρόγραμμα ακόμα — μπορείτε να προσθέσετε αργότερα.")}
        </p>
      </Card>

      {hasPackageData && (
        <Card>
          <h3 className="text-[17px] font-semibold text-stone-800"><T>Αρχικό απόθεμα</T></h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-base">
            {packageBatch && (
              <>
                <dt className="text-stone-500"><T>Παρτίδα</T></dt>
                <dd>{packageBatch}</dd>
              </>
            )}
            {packageExpiry && (
              <>
                <dt className="text-stone-500"><T>Ημερομηνία λήξης</T></dt>
                <dd>{packageExpiry}</dd>
              </>
            )}
          </dl>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-[17px] font-semibold text-stone-800"><T>Πόσα έχετε; (προαιρετικό)</T></span>
            <input
              type="text"
              inputMode="decimal"
              value={initialQuantityValue}
              onChange={(e) => onInitialQuantityValueChange(e.target.value)}
              placeholder={t("π.χ. 30 {unit}", { unit: inventoryUnit })}
              aria-label={t("Αρχική ποσότητα")}
              className={`${FIELD_INPUT} pr-4`}
            />
          </label>
          <p className="mt-1 text-sm text-stone-500">
            <T>Αν το συμπληρώσετε, θα δημιουργηθεί μια πραγματική συσκευασία στο απόθεμά σας.</T>
          </p>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700">
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
        {submitting ? t("Αποθήκευση…") : t("Ολοκλήρωση")}
      </Button>
    </div>
  );
}
