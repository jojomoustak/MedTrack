"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { playSound } from "@/lib/sound/client/play-sound";

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
  function handleChoose(choice: ScheduleKindChoice) {
    playSound("button");
    onChoose(choice);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Πρόγραμμα δόσεων</h2>
      <div className="flex flex-col gap-3" role="group" aria-label="Πώς παίρνετε αυτό το φάρμακο;">
        <Card
          as="button"
          type="button"
          onClick={() => handleChoose("wall_clock")}
          className="flex min-h-12 items-center px-4 py-3 text-left transition-transform duration-150 active:scale-[0.98] hover:bg-stone-50 dark:hover:bg-stone-900"
        >
          <span>
            <span className="block font-medium">Σταθερές ώρες</span>
            <span className="block text-sm text-stone-600 dark:text-stone-400">Παίρνετε το φάρμακο σε συγκεκριμένες ώρες κάθε μέρα</span>
          </span>
        </Card>

        <Card
          as="button"
          type="button"
          onClick={() => handleChoose("elapsed")}
          className="flex min-h-12 items-center px-4 py-3 text-left transition-transform duration-150 active:scale-[0.98] hover:bg-stone-50 dark:hover:bg-stone-900"
        >
          <span>
            <span className="block font-medium">Κάθε πόσες ώρες</span>
            <span className="block text-sm text-stone-600 dark:text-stone-400">Π.χ. κάθε 8 ώρες, ανεξαρτήτως ώρας ημέρας</span>
          </span>
        </Card>

        <Card
          as="button"
          type="button"
          onClick={() => handleChoose("prn")}
          className="flex min-h-12 items-center px-4 py-3 text-left transition-transform duration-150 active:scale-[0.98] hover:bg-stone-50 dark:hover:bg-stone-900"
        >
          <span>
            <span className="block font-medium">Όποτε χρειάζεται</span>
            <span className="block text-sm text-stone-600 dark:text-stone-400">Χωρίς σταθερό πρόγραμμα</span>
          </span>
        </Card>
      </div>

      <Button variant="tertiary" onClick={() => { playSound("button"); onSkip(); }} className="self-start px-0 underline">
        Παράλειψη — θα προσθέσω πρόγραμμα αργότερα
      </Button>

      <Button variant="secondary" onClick={() => { playSound("button"); onBack(); }} className="self-start">
        Πίσω
      </Button>
    </div>
  );
}
