"use client";

import { useState } from "react";

export interface ManualEntryValues {
  name: string;
  /** Carried through from a "couldn't identify automatically" scan fallback (Phase 3 §2.4/Journey 3) — `null` for the ordinary manual-entry path, or when the scanner read no expiry. Not yet persisted onto `UserMedication` (no `Package`/inventory schema exists — `lib/domain/ids.ts`'s reserved `MedicationPackageId`); kept here and surfaced to the user rather than silently discarded, pending that future entity. */
  expiry: string | null;
  batch: string | null;
}

export interface ManualEntryFormProps {
  onSubmit: (values: ManualEntryValues) => void;
  /** Pre-fill from a scan that couldn't be automatically identified — Phase 3 Journey 3: "Continue manually → manual entry form, pre-filled with parsed expiry/batch if present." Both remain editable; either may be absent even when the other is present. */
  initialExpiry?: string | null;
  initialBatch?: string | null;
}

/** Phase 3 §2.4 "Manual entry form" — the primary, fully-functional path for real users at MVP (per the Phase 6 task directive; the catalog/search path exists to prove the architecture, not to imply real market coverage). */
export function ManualEntryForm({ onSubmit, initialExpiry = null, initialBatch = null }: ManualEntryFormProps) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState(initialExpiry ?? "");
  const [batch, setBatch] = useState(initialBatch ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Το όνομα του φαρμάκου είναι απαραίτητο.");
      return;
    }
    setError(null);
    onSubmit({
      name: trimmed,
      expiry: expiry.trim().length > 0 ? expiry.trim() : null,
      batch: batch.trim().length > 0 ? batch.trim() : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Όνομα φαρμάκου</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Όνομα φαρμάκου"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "manual-name-error" : undefined}
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error && (
          <span id="manual-name-error" role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </span>
        )}
      </label>

      {(initialExpiry !== null || initialBatch !== null) && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Αυτά διαβάστηκαν από τη σάρωση — ελέγξτε ή διορθώστε τα.</p>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Ημερομηνία λήξης</span>
            <input
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="ΕΕΕΕ-ΜΜ-ΗΗ"
              aria-label="Ημερομηνία λήξης"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Παρτίδα</span>
            <input
              type="text"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              aria-label="Παρτίδα"
              className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Συνέχεια
      </button>
    </form>
  );
}
