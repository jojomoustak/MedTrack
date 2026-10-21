"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { T, useT } from "@/lib/i18n/client";

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

/** Phase 3 §2.4 "Manual entry form" (reference mockup, screen 15) — the primary, fully-functional path for real users at MVP (per the Phase 6 task directive; the catalog/search path exists to prove the architecture, not to imply real market coverage). */
export function ManualEntryForm({ onSubmit, initialExpiry = null, initialBatch = null }: ManualEntryFormProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState(initialExpiry ?? "");
  const [batch, setBatch] = useState(initialBatch ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("Το όνομα του φαρμάκου είναι απαραίτητο."));
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}><T>Όνομα</T></span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("Όνομα φαρμάκου")}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "manual-name-error" : undefined}
          placeholder={t("Γράψτε το όνομα του φαρμάκου")}
          className={`${FIELD_INPUT} pr-4`}
        />
        {error && (
          <span id="manual-name-error" role="alert" className="text-[15px] font-medium text-red-700">
            {error}
          </span>
        )}
      </label>

      {(initialExpiry !== null || initialBatch !== null) && (
        <div className="surface-card flex flex-col gap-4 p-4">
          <p className="text-[15px] text-stone-600"><T>Αυτά διαβάστηκαν από τη σάρωση — ελέγξτε ή διορθώστε τα.</T></p>
          <label className={FIELD_WRAPPER}>
            <span className={FIELD_LABEL}><T>Ημερομηνία λήξης</T></span>
            <input
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder={t("ΕΕΕΕ-ΜΜ-ΗΗ")}
              aria-label={t("Ημερομηνία λήξης")}
              className={`${FIELD_INPUT} pr-4`}
            />
          </label>
          <label className={FIELD_WRAPPER}>
            <span className={FIELD_LABEL}><T>Παρτίδα</T></span>
            <input type="text" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label={t("Παρτίδα")} className={`${FIELD_INPUT} pr-4`} />
          </label>
        </div>
      )}

      <Button type="submit" size="lg" fullWidth>
        <T>Συνέχεια</T>
      </Button>
    </form>
  );
}
