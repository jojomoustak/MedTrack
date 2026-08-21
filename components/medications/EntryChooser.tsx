"use client";

export type EntryChoice = "scan" | "search" | "manual";

export interface EntryChooserProps {
  onChoose: (choice: EntryChoice) => void;
}

/**
 * Phase 3 §2.4 "Add Medication — entry chooser": Scan / Search / Manual,
 * equal-weight options. Scan is Phase 7-8's camera work — shown here as a
 * visually present but disabled "coming soon" option (not omitted
 * entirely, not hidden), per the Phase 6 task's explicit either-or
 * allowance, chosen so users don't wonder whether scanning exists at all.
 */
export function EntryChooser({ onChoose }: EntryChooserProps) {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Πώς θέλετε να προσθέσετε το φάρμακο;">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label="Σάρωση barcode — σύντομα διαθέσιμο"
        className="flex min-h-12 items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
      >
        <span>
          <span className="block font-medium">Σάρωση barcode</span>
          <span className="block text-sm">Σύντομα διαθέσιμο</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChoose("search")}
        className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <span>
          <span className="block font-medium">Αναζήτηση</span>
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">Βρείτε το φάρμακο στον κατάλογο</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChoose("manual")}
        className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <span>
          <span className="block font-medium">Χειροκίνητη καταχώριση</span>
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">Εισαγάγετε τα στοιχεία με το χέρι</span>
        </span>
      </button>
    </div>
  );
}
