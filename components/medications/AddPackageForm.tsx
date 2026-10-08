"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";

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
 * `AddMedicationFlow`'s own scan/manual-entry batch/expiry capture (Phase
 * 3's own screen inventory called out a distinct "initial package step,"
 * built 2026-09-13) now creates a real `MedicationPackage` row directly in
 * `ReviewStep` when a quantity is given, rather than going through this
 * form — that flow only ever had a barcode's/manual entry's parsed batch/
 * expiry to go on, never a quantity, until `ReviewStep` added one inline.
 * Left as free-text `notes` (`buildScanNotes`) only when that quantity is
 * left blank, so scanned/entered data is never silently discarded either
 * way.
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
    playSound("button");
    onSubmit({
      batchNumber: batchNumber.trim() || null,
      expiryDate: expiryDate.trim() || null,
      initialQuantityValue: parsed,
      quantityUnit,
      openNow,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <fieldset className={FIELD_WRAPPER}>
        <legend className={`${FIELD_LABEL} mb-2`}>Ποσότητα</legend>
        <div className="flex gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            aria-label="Ποσότητα συσκευασίας"
            className={`${FIELD_INPUT} max-w-28 pr-4 tabular-nums`}
          />
          <span className="relative block flex-1">
            <select value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)} aria-label="Μονάδα" className={`${FIELD_INPUT} appearance-none pr-11`}>
              {Object.entries(FORM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 20 20"
              width="20"
              height="20"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-stone-600 dark:text-stone-400"
            >
              <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </fieldset>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Αριθμός παρτίδας</span>
        <input type="text" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Προαιρετικό" className={`${FIELD_INPUT} pr-4`} />
      </label>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Ημερομηνία λήξης</span>
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={`${FIELD_INPUT} pr-4`} />
      </label>

      <label className="surface-card flex min-h-16 items-center gap-3 px-4 py-3">
        <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} className="size-5 shrink-0 accent-accent-700" />
        <span className="text-[17px] text-stone-800 dark:text-stone-200">Άνοιγμα τώρα (μετράει στο τρέχον απόθεμα)</span>
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting}>
        {submitting ? "Αποθήκευση…" : "Προσθήκη συσκευασίας"}
      </Button>
    </form>
  );
}
