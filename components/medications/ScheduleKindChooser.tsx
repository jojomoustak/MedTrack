"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { playSound } from "@/lib/sound/client/play-sound";
import { useT, T } from "@/lib/i18n/client";

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
  const t = useT();
  function handleChoose(choice: ScheduleKindChoice) {
    playSound("button");
    onChoose(choice);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900"><T>Πρόγραμμα δόσεων</T></h2>
      <div className="flex flex-col gap-3" role="group" aria-label={t("Πώς παίρνετε αυτό το φάρμακο;")}>
        <Card
          as="button"
          type="button"
          onClick={() => handleChoose("wall_clock")}
          className="flex min-h-20 items-center text-left transition-transform duration-150 active:scale-[0.98]"
        >
          <span>
            <span className="block text-[17px] font-bold text-stone-900"><T>Σταθερές ώρες</T></span>
            <span className="block text-[15px] text-stone-600"><T>Παίρνετε το φάρμακο σε συγκεκριμένες ώρες κάθε μέρα</T></span>
          </span>
        </Card>

        <Card
          as="button"
          type="button"
          onClick={() => handleChoose("elapsed")}
          className="flex min-h-20 items-center text-left transition-transform duration-150 active:scale-[0.98]"
        >
          <span>
            <span className="block text-[17px] font-bold text-stone-900"><T>Κάθε πόσες ώρες</T></span>
            <span className="block text-[15px] text-stone-600"><T>Π.χ. κάθε 8 ώρες, ανεξαρτήτως ώρας ημέρας</T></span>
          </span>
        </Card>

        <Card
          as="button"
          type="button"
          onClick={() => handleChoose("prn")}
          className="flex min-h-20 items-center text-left transition-transform duration-150 active:scale-[0.98]"
        >
          <span>
            <span className="block text-[17px] font-bold text-stone-900"><T>Όποτε χρειάζεται</T></span>
            <span className="block text-[15px] text-stone-600"><T>Χωρίς σταθερό πρόγραμμα</T></span>
          </span>
        </Card>
      </div>

      <Button variant="tertiary" onClick={() => { playSound("button"); onSkip(); }} className="self-start px-0 underline">
        <T>Παράλειψη — θα προσθέσω πρόγραμμα αργότερα</T>
      </Button>

      <Button variant="secondary" onClick={() => { playSound("button"); onBack(); }} size="lg" className="self-start">
        <T>Πίσω</T>
      </Button>
    </div>
  );
}
