import type { RefillProjection } from "@/lib/domain/inventory-consumption";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import type { MedicationForm } from "@/lib/domain/user-medication";

function unitLabel(unit: string): string {
  return FORM_LABELS[unit as MedicationForm] ?? unit;
}

function formatProjectedDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("el-GR", { day: "numeric", month: "long" });
}

/**
 * Current stock, low-stock/running-low cues, and a refill estimate
 * (Phase 3 §2.5 medication detail, journey 5). `belowThreshold`/
 * `runningLowSoon` render the SAME non-color cue this component is meant
 * to be reused for everywhere Journey 5 calls for it (Today banner,
 * Medications list badge, medication detail) — icon + text, never color
 * alone. The refill-estimate line always carries the micro-label Phase 3
 * UX risk R8 requires ("δεν αποτελεί ιατρική σύσταση") so a stock
 * projection can never be read as a dosing recommendation (CLAUDE.md
 * rule 1) — this label is not optional/dismissable, it's part of the
 * copy itself.
 */
export function InventorySummary({
  currentStock,
  quantityUnit,
  belowThreshold,
  runningLowSoon,
  projection,
}: {
  currentStock: string;
  quantityUnit: string;
  belowThreshold: boolean;
  runningLowSoon: boolean;
  projection: RefillProjection;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Απόθεμα</h2>
      <p className="text-2xl font-semibold">
        {currentStock} {unitLabel(quantityUnit)}
      </p>

      {(belowThreshold || runningLowSoon) && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          <LowStockIcon />
          Χαμηλό απόθεμα
        </p>
      )}

      {projection.basis !== "none" && projection.daysRemaining !== null && projection.projectedOutOfStockDate && (
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            Εκτίμηση εξάντλησης: {formatProjectedDate(projection.projectedOutOfStockDate)} ({projection.daysRemaining}{" "}
            {projection.daysRemaining === 1 ? "ημέρα" : "ημέρες"})
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {projection.basis === "observed" ? "Βάσει της πρόσφατης χρήσης σας" : "Βάσει του προγράμματός σας"} — εκτίμηση αποθέματος, δεν αποτελεί
            ιατρική σύσταση.
          </p>
        </div>
      )}
    </section>
  );
}

function LowStockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
    </svg>
  );
}
