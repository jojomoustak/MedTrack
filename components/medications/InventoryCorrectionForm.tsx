"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { segmentClasses } from "@/components/ui/SegmentedControl";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { formatQuantity } from "@/lib/domain/quantity";
import { playSound } from "@/lib/sound/client/play-sound";

export interface InventoryCorrectionValues {
  /** Signed — positive adds stock, negative removes it. Never zero (enforced below). */
  quantityDelta: number;
  note: string;
}

type Direction = "add" | "remove" | "set";

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "add", label: "Προσθήκη" },
  { value: "remove", label: "Αφαίρεση" },
  { value: "set", label: "Ορισμός" },
];

/**
 * Inventory manual correction (Phase 3 §2.5), laid out after the reference
 * mockup's "Adjust Stock": current stock, Add / Remove / Set, the amount,
 * and a live "new stock" line. `note` is REQUIRED (the reference shows it
 * optional): an unexplained adjustment defeats the point of an audit-trail
 * ledger (ADR-010) — every other transaction type has a self-evident
 * reason, a manual correction is the one that doesn't.
 *
 * "Set" lets the user type the counted total directly (a recount is "I
 * counted 12", not "add some unknown amount"); the ledger still records a
 * signed delta.
 */
export function InventoryCorrectionForm({
  currentStock,
  quantityUnit,
  onSubmit,
  submitting,
  error,
}: {
  currentStock: string;
  /** The medication's inventory unit code (e.g. "tablet"). */
  quantityUnit: string;
  onSubmit: (values: InventoryCorrectionValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [direction, setDirection] = useState<Direction>("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentStockNum = Number(currentStock);
  const parsedAmount = Number(amount.replace(",", "."));
  const hasValidAmount = amount.trim() !== "" && Number.isFinite(parsedAmount) && (direction === "set" ? parsedAmount >= 0 : parsedAmount > 0);
  const previewStock = hasValidAmount ? (direction === "add" ? currentStockNum + parsedAmount : direction === "remove" ? currentStockNum - parsedAmount : parsedAmount) : null;
  const stockLabel = (value: string) => doseQuantityLabel(value, quantityUnit) ?? formatQuantity(value);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasValidAmount) {
      setValidationError(direction === "set" ? "Εισαγάγετε το τρέχον απόθεμα (μπορεί να είναι 0)." : "Η ποσότητα πρέπει να είναι θετικός αριθμός.");
      return;
    }
    const quantityDelta = direction === "add" ? parsedAmount : direction === "remove" ? -parsedAmount : parsedAmount - currentStockNum;
    if (quantityDelta === 0) {
      setValidationError("Το απόθεμα είναι ήδη αυτή η τιμή — δεν υπάρχει αλλαγή να καταγραφεί.");
      return;
    }
    if (note.trim().length === 0) {
      setValidationError("Χρειάζεται μια σύντομη αιτιολογία.");
      return;
    }
    setValidationError(null);
    playSound("button");
    onSubmit({ quantityDelta, note: note.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <p className={FIELD_LABEL}>Τρέχον απόθεμα</p>
        <p className="text-[17px] text-stone-600 tabular-nums dark:text-stone-400">{stockLabel(currentStock)}</p>
      </div>

      <div role="radiogroup" aria-label="Είδος διόρθωσης" className="flex gap-2">
        {DIRECTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={direction === option.value}
            onClick={() => {
              playSound("button");
              setDirection(option.value);
            }}
            className={segmentClasses(direction === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>{direction === "set" ? "Νέο απόθεμα" : "Ποσότητα"}</span>
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${FIELD_INPUT} pr-4 tabular-nums`} />
      </label>

      {/* The reference's "New stock: 38 tablets" line — "—" until there's a real number to compute from. */}
      <div className="flex flex-col gap-1 border-b border-stone-200 pb-4 dark:border-stone-800" aria-live="polite">
        <p className={FIELD_LABEL}>Νέο απόθεμα</p>
        <p className="text-[17px] text-stone-600 tabular-nums dark:text-stone-400">{previewStock !== null ? stockLabel(String(previewStock)) : "—"}</p>
      </div>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Αιτιολογία</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="π.χ. Καταμέτρηση, χαμένο δισκίο"
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting}>
        {submitting ? "Αποθήκευση…" : "Ενημέρωση αποθέματος"}
      </Button>
    </form>
  );
}
