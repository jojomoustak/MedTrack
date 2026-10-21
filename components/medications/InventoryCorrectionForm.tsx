"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { segmentClasses } from "@/components/ui/SegmentedControl";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { formatQuantity } from "@/lib/domain/quantity";
import { playSound } from "@/lib/sound/client/play-sound";
import { T, useLanguage, useT } from "@/lib/i18n/client";

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
  const t = useT();
  const language = useLanguage();
  const [direction, setDirection] = useState<Direction>("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentStockNum = Number(currentStock);
  const parsedAmount = Number(amount.replace(",", "."));
  const hasValidAmount = amount.trim() !== "" && Number.isFinite(parsedAmount) && (direction === "set" ? parsedAmount >= 0 : parsedAmount > 0);
  const previewStock = hasValidAmount ? (direction === "add" ? currentStockNum + parsedAmount : direction === "remove" ? currentStockNum - parsedAmount : parsedAmount) : null;
  const stockLabel = (value: string) => doseQuantityLabel(value, quantityUnit, language) ?? formatQuantity(value);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasValidAmount) {
      setValidationError(direction === "set" ? t("Εισαγάγετε το τρέχον απόθεμα (μπορεί να είναι 0).") : t("Η ποσότητα πρέπει να είναι θετικός αριθμός."));
      return;
    }
    const quantityDelta = direction === "add" ? parsedAmount : direction === "remove" ? -parsedAmount : parsedAmount - currentStockNum;
    if (quantityDelta === 0) {
      setValidationError(t("Το απόθεμα είναι ήδη αυτή η τιμή — δεν υπάρχει αλλαγή να καταγραφεί."));
      return;
    }
    if (note.trim().length === 0) {
      setValidationError(t("Χρειάζεται μια σύντομη αιτιολογία."));
      return;
    }
    setValidationError(null);
    playSound("button");
    onSubmit({ quantityDelta, note: note.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <p className={FIELD_LABEL}><T>Τρέχον απόθεμα</T></p>
        <p className="text-[17px] text-stone-600 tabular-nums">{stockLabel(currentStock)}</p>
      </div>

      <div role="radiogroup" aria-label={t("Είδος διόρθωσης")} className="flex gap-2">
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
            {t(option.label)}
          </button>
        ))}
      </div>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>{direction === "set" ? t("Νέο απόθεμα") : t("Ποσότητα")}</span>
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${FIELD_INPUT} pr-4 tabular-nums`} />
      </label>

      {/* The reference's "New stock: 38 tablets" line — "—" until there's a real number to compute from. */}
      <div className="flex flex-col gap-1 border-b border-stone-200 pb-4" aria-live="polite">
        <p className={FIELD_LABEL}><T>Νέο απόθεμα</T></p>
        <p className="text-[17px] text-stone-600 tabular-nums">{previewStock !== null ? stockLabel(String(previewStock)) : "—"}</p>
      </div>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}><T>Αιτιολογία</T></span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("π.χ. Καταμέτρηση, χαμένο δισκίο")}
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-[15px] font-medium text-red-700">
          {validationError ?? error}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting}>
        {submitting ? t("Αποθήκευση…") : t("Ενημέρωση αποθέματος")}
      </Button>
    </form>
  );
}
