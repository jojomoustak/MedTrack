"use client";

export type ScheduleKindChoice = "wall_clock" | "elapsed" | "prn";

export interface ScheduleKindChooserProps {
  onChoose: (choice: ScheduleKindChoice) => void;
  onSkip: () => void;
  onBack: () => void;
}

/**
 * Phase 3 §2.5's schedule-kind picker — same card-button pattern as
 * `EntryChooser`. Below the three cards, a lower-emphasis text link lets
 * the user skip adding a schedule now (design doc, 2026-08-30): the data
 * model allows a `UserMedication` with zero schedules, and there's no
 * "add later" entry point yet, so this is deliberately visible rather
 * than buried.
 */
export function ScheduleKindChooser({ onChoose, onSkip, onBack }: ScheduleKindChooserProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Πρόγραμμα δόσεων</h2>
      <div className="flex flex-col gap-3" role="group" aria-label="Πώς παίρνετε αυτό το φάρμακο;">
        <button
          type="button"
          onClick={() => onChoose("wall_clock")}
          className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span>
            <span className="block font-medium">Σταθερές ώρες</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">Παίρνετε το φάρμακο σε συγκεκριμένες ώρες κάθε μέρα</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChoose("elapsed")}
          className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span>
            <span className="block font-medium">Κάθε πόσες ώρες</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">Π.χ. κάθε 8 ώρες, ανεξαρτήτως ώρας ημέρας</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChoose("prn")}
          className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span>
            <span className="block font-medium">Όποτε χρειάζεται</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">Χωρίς σταθερό πρόγραμμα</span>
          </span>
        </button>
      </div>

      <button type="button" onClick={onSkip} className="min-h-12 self-start text-sm font-medium underline">
        Παράλειψη — θα προσθέσω πρόγραμμα αργότερα
      </button>

      <button type="button" onClick={onBack} className="min-h-12 self-start rounded-full border border-zinc-300 px-5 py-3 font-medium dark:border-zinc-700">
        Πίσω
      </button>
    </div>
  );
}
