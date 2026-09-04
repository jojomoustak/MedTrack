"use client";

import { useState } from "react";

export interface InventoryCorrectionValues {
  /** Signed — positive adds stock, negative removes it. Never zero (enforced below). */
  quantityDelta: number;
  note: string;
}

/**
 * Inventory manual correction (Phase 3 §2.5) — an explicit "adjust
 * stock" ledger entry. `note` is REQUIRED (not just encouraged): an
 * unexplained stock adjustment defeats the whole point of an audit-
 * trail ledger (ADR-010) — every other transaction type has a self-
 * evident reason (a dose taken, a package opened); a manual correction
 * is the one type that doesn't, so it's the one place this form asks for
 * it outright rather than leaving `note` as the optional field it is on
 * every other transaction type.
 */
export function InventoryCorrectionForm({
  onSubmit,
  submitting,
  error,
}: {
  onSubmit: (values: InventoryCorrectionValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValidationError("Η ποσότητα πρέπει να είναι θετικός αριθμός.");
      return;
    }
    if (note.trim().length === 0) {
      setValidationError("Χρειάζεται μια σύντομη αιτιολογία.");
      return;
    }
    setValidationError(null);
    onSubmit({ quantityDelta: direction === "add" ? parsed : -parsed, note: note.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Κατεύθυνση διόρθωσης" className="flex gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={direction === "remove"}
          onClick={() => setDirection("remove")}
          className={`min-h-12 flex-1 rounded-full border px-4 py-2 text-sm font-medium ${
            direction === "remove" ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          Αφαίρεση
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={direction === "add"}
          onClick={() => setDirection("add")}
          className={`min-h-12 flex-1 rounded-full border px-4 py-2 text-sm font-medium ${
            direction === "add" ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          Προσθήκη
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Ποσότητα</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-h-12 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Αιτιολογία (απαραίτητο)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="π.χ. Καταμέτρηση, χαμένο δισκίο, λάθος καταχώρηση"
          className="min-h-12 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700 dark:bg-transparent"
        />
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
        {submitting ? "Αποθήκευση…" : "Διόρθωση αποθέματος"}
      </button>
    </form>
  );
}
