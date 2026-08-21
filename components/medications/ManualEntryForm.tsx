"use client";

import { useState } from "react";

export interface ManualEntryValues {
  name: string;
}

export interface ManualEntryFormProps {
  onSubmit: (values: ManualEntryValues) => void;
}

/** Phase 3 §2.4 "Manual entry form" — the primary, fully-functional path for real users at MVP (per the Phase 6 task directive; the catalog/search path exists to prove the architecture, not to imply real market coverage). */
export function ManualEntryForm({ onSubmit }: ManualEntryFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Το όνομα του φαρμάκου είναι απαραίτητο.");
      return;
    }
    setError(null);
    onSubmit({ name: trimmed });
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

      <button
        type="submit"
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Συνέχεια
      </button>
    </form>
  );
}
