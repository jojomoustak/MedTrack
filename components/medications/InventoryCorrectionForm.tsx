"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatQuantity } from "@/lib/domain/quantity";
import { playSound } from "@/lib/sound/client/play-sound";

export interface InventoryCorrectionValues {
  /** Signed — positive adds stock, negative removes it. Never zero (enforced below). */
  quantityDelta: number;
  note: string;
}

type Direction = "add" | "remove" | "set";

/**
 * Inventory manual correction (Phase 3 §2.5) — an explicit "adjust
 * stock" ledger entry. `note` is REQUIRED (not just encouraged): an
 * unexplained stock adjustment defeats the whole point of an audit-
 * trail ledger (ADR-010) — every other transaction type has a self-
 * evident reason (a dose taken, a package opened); a manual correction
 * is the one type that doesn't, so it's the one place this form asks for
 * it outright rather than leaving `note` as the optional field it is on
 * every other transaction type.
 *
 * Design pass (2026-09-28, reference mockup comparison): added a third
 * "Ορισμός" (Set) direction — the reference lets you type the actual
 * target count directly (a recount is usually "I counted 12," not "I
 * need to add/remove some unknown amount") — plus a live "new stock will
 * be" preview. `currentStock`/`quantityUnit` are new required props so
 * both of those can be computed; the underlying ledger contract is
 * unchanged, this only changes how the UI arrives at the signed delta.
 */
export function InventoryCorrectionForm({
  currentStock,
  quantityUnit,
  onSubmit,
  submitting,
  error,
}: {
  currentStock: string;
  quantityUnit: string;
  onSubmit: (values: InventoryCorrectionValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [direction, setDirection] = useState<Direction>("remove");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const currentStockNum = Number(currentStock);
  const parsedAmount = Number(amount.replace(",", "."));
  const hasValidAmount = Number.isFinite(parsedAmount) && (direction === "set" ? parsedAmount >= 0 : parsedAmount > 0);
  const previewStock = hasValidAmount ? (direction === "add" ? currentStockNum + parsedAmount : direction === "remove" ? currentStockNum - parsedAmount : parsedAmount) : null;

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Τρέχον απόθεμα: <span className="font-medium text-stone-900 dark:text-stone-100">{formatQuantity(currentStock)} {quantityUnit}</span>
      </p>

      <div role="radiogroup" aria-label="Κατεύθυνση διόρθωσης" className="flex gap-2">
        {(
          [
            { value: "remove", label: "Αφαίρεση" },
            { value: "add", label: "Προσθήκη" },
            { value: "set", label: "Ορισμός" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={direction === option.value}
            onClick={() => {
              playSound("button");
              setDirection(option.value);
            }}
            className={`min-h-12 flex-1 rounded-full border px-3 py-2 text-sm font-medium ${
              direction === option.value ? "border-accent-700 bg-accent-700 text-white dark:border-accent-500 dark:bg-accent-500 dark:text-stone-950" : "border-stone-300 dark:border-stone-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{direction === "set" ? "Νέο απόθεμα" : "Ποσότητα"}</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-h-12 rounded-lg border border-stone-300 px-3 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      {/* Live preview (reference mockup's own "New stock: 38 tablets" line) — only once there's a real number to compute from, never a stale/zero placeholder. */}
      {previewStock !== null && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Νέο απόθεμα: <span className="font-medium text-accent-700 dark:text-accent-400">{formatQuantity(String(previewStock))} {quantityUnit}</span>
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Αιτιολογία (απαραίτητο)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="π.χ. Καταμέτρηση, χαμένο δισκίο, λάθος καταχώρηση"
          className="min-h-12 rounded-lg border border-stone-300 px-3 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      {(validationError ?? error) && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {validationError ?? error}
        </p>
      )}

      <Button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Αποθήκευση…" : "Διόρθωση αποθέματος"}
      </Button>
    </form>
  );
}
