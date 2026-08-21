"use client";

export interface ReviewStepProps {
  name: string;
  form: string | null;
  strengthValue: string;
  strengthUnit: string;
  inventoryUnit: string;
  onFinish: () => void;
  submitting: boolean;
  error: string | null;
}

/** Phase 3 §2.4 "Add Medication — review & finish": summary before creating the `UserMedication` row. */
export function ReviewStep({ name, form, strengthValue, strengthUnit, inventoryUnit, onFinish, submitting, error }: ReviewStepProps) {
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
