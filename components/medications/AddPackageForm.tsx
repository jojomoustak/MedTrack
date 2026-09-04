"use client";

import { useState } from "react";
import { FORM_LABELS } from "@/components/medications/DetailsStep";

export interface AddPackageValues {
  batchNumber: string | null;
  expiryDate: string | null;
  initialQuantityValue: number;
  quantityUnit: string;
  openNow: boolean;
}

/**
 * Add package (manual) — Phase 3 §2.5, reached from medication detail's
 * "Προσθήκη συσκευασίας". Batch/expiry are optional (a package with
 * neither is still a real, trackable unit of stock).
 *
 * Not yet wired: `AddMedicationFlow`'s own scan/manual-entry batch/expiry
 * capture still folds into the medication's free-text `notes` field
 * (`buildScanNotes`) rather than creating a real `MedicationPackage` row
 * here — that flow only ever had a barcode's parsed batch/expiry to go
 * on, never a quantity (Phase 3's own screen inventory calls out a
 * distinct "initial package step" for that, never built). A real fix
 * routes that data through this same form instead of leaving it as text;
 * flagged as a follow-up, not done in this pass.
 *
 * "Άνοιγμα τώρα" defaults on: a package someone bothers to add by hand is
 * almost always one they're about to start using, and skipping a second
 * separate "open" tap matches Journey 5's "Add package (manual), pre-
 * filled → inventory ledger updated" flow (opening is what actually
 * establishes the package's ledger balance — see `PackageList`'s own doc).
 */
export function AddPackageForm({
  defaultUnit,
  initialBatch = null,
  initialExpiry = null,
  onSubmit,
  submitting,
  error,
}: {
  defaultUnit: string;
  initialBatch?: string | null;
  initialExpiry?: string | null;
  onSubmit: (values: AddPackageValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [batchNumber, setBatchNumber] = useState(initialBatch ?? "");
  const [expiryDate, setExpiryDate] = useState(initialExpiry ?? "");
  const [quantityValue, setQuantityValue] = useState("30");
  const [quantityUnit, setQuantityUnit] = useState(defaultUnit);
  const [openNow, setOpenNow] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(quantityValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValidationError("Η ποσότητα πρέπει να είναι θετικός αριθμός.");
      return;
    }
    setValidationError(null);
    onSubmit({
      batchNumber: batchNumber.trim() || null,
      expiryDate: expiryDate.trim() || null,
      initialQuantityValue: parsed,
      quantityUnit,
      openNow,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Ποσότητα</span>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            className="min-h-12 w-24 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-transparent"
          />
          <select
            value={quantityUnit}
            onChange={(e) => setQuantityUnit(e.target.value)}
            className="min-h-12 flex-1 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-transparent"
          >
            {Object.entries(FORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Αριθμός παρτίδας (προαιρετικό)</span>
        <input
          type="text"
          value={batchNumber}
          onChange={(e) => setBatchNumber(e.target.value)}
          className="min-h-12 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Ημερομηνία λήξης (προαιρετικό)</span>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="min-h-12 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-transparent"
        />
      </label>

      <label className="flex min-h-12 items-center gap-2">
        <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} className="h-5 w-5" />
        <span className="text-sm">Άνοιγμα τώρα (μετράει στο τρέχον απόθεμα)</span>
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {submitting ? "Αποθήκευση…" : "Προσθήκη"}
      </button>
    </form>
  );
}

