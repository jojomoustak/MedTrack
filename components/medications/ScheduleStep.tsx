"use client";

import { useState } from "react";
import { ScheduleKindChooser, type ScheduleKindChoice } from "@/components/medications/ScheduleKindChooser";
import { WallClockScheduleBuilder, type WallClockScheduleValues } from "@/components/medications/WallClockScheduleBuilder";
import { ElapsedScheduleBuilder, type ElapsedScheduleValues } from "@/components/medications/ElapsedScheduleBuilder";
import { PrnScheduleBuilder, type PrnScheduleValues } from "@/components/medications/PrnScheduleBuilder";
import { ScheduleDatesReview } from "@/components/medications/ScheduleDatesReview";
import { deriveWallClockScheduleKind, type ScheduleDraft } from "@/lib/domain/schedule-draft";

type ScheduleSubStep = "kind" | "wall_clock" | "elapsed" | "prn" | "dates";

export interface ScheduleStepProps {
  onContinue: (draft: ScheduleDraft | null) => void;
  onBack: () => void;
  /** Preserves the draft when the user comes back from Review to edit it. */
  initialDraft: ScheduleDraft | null;
}

/** Phase 3 §2.5's Add Medication schedule step — kind chooser → kind-specific builder → shared dates/quantity review. */
export function ScheduleStep({ onContinue, onBack, initialDraft }: ScheduleStepProps) {
  const [subStep, setSubStep] = useState<ScheduleSubStep>(initialDraft ? subStepForDraft(initialDraft) : "kind");
  const isInitialWallClock = initialDraft ? ["daily", "multiple_times_daily", "specific_weekdays"].includes(initialDraft.scheduleKind) : false;
  const [wallClockValues, setWallClockValues] = useState<WallClockScheduleValues | null>(
    isInitialWallClock && initialDraft ? { timesOfDay: initialDraft.timesOfDay ?? [], weekdaysMask: initialDraft.weekdaysMask } : null,
  );
  const [elapsedValues, setElapsedValues] = useState<ElapsedScheduleValues | null>(
    initialDraft?.intervalHours !== null && initialDraft?.intervalHours !== undefined && initialDraft?.anchorAt
      ? { intervalHours: initialDraft.intervalHours, anchorAt: initialDraft.anchorAt }
      : null,
  );
  const [prnValues, setPrnValues] = useState<PrnScheduleValues | null>(
    initialDraft?.scheduleKind === "prn" ? { doseQuantityValue: initialDraft.doseQuantityValue, doseQuantityUnit: initialDraft.doseQuantityUnit as PrnScheduleValues["doseQuantityUnit"] } : null,
  );

  function handleKindChoice(choice: ScheduleKindChoice) {
    setSubStep(choice);
  }

  function handleWallClockSubmit(values: WallClockScheduleValues) {
    setWallClockValues(values);
    setSubStep("dates");
  }

  function handleElapsedSubmit(values: ElapsedScheduleValues) {
    setElapsedValues(values);
    setSubStep("dates");
  }

  function handlePrnSubmit(values: PrnScheduleValues) {
    setPrnValues(values);
    setSubStep("dates");
  }

  if (subStep === "kind") {
    return <ScheduleKindChooser onChoose={handleKindChoice} onSkip={() => onContinue(null)} onBack={onBack} />;
  }

  if (subStep === "wall_clock") {
    return <WallClockScheduleBuilder onSubmit={handleWallClockSubmit} onBack={() => setSubStep("kind")} initial={wallClockValues ?? undefined} />;
  }

  if (subStep === "elapsed") {
    return <ElapsedScheduleBuilder onSubmit={handleElapsedSubmit} onBack={() => setSubStep("kind")} />;
  }

  if (subStep === "prn") {
    return <PrnScheduleBuilder onSubmit={handlePrnSubmit} onBack={() => setSubStep("kind")} initial={prnValues ?? undefined} />;
  }

  // "dates" — assemble whichever kind-specific values were collected.
  if (wallClockValues) {
    return (
      <ScheduleDatesReview
        base={{
          scheduleKind: deriveWallClockScheduleKind(wallClockValues.timesOfDay, wallClockValues.weekdaysMask),
          timesOfDay: wallClockValues.timesOfDay,
          weekdaysMask: wallClockValues.weekdaysMask,
          intervalHours: null,
          anchorAt: null,
        }}
        onSubmit={onContinue}
        onBack={() => setSubStep("wall_clock")}
      />
    );
  }
  if (elapsedValues) {
    return (
      <ScheduleDatesReview
        base={{ scheduleKind: "every_n_hours", timesOfDay: null, weekdaysMask: null, intervalHours: elapsedValues.intervalHours, anchorAt: elapsedValues.anchorAt }}
        onSubmit={onContinue}
        onBack={() => setSubStep("elapsed")}
      />
    );
  }
  if (prnValues) {
    return (
      <ScheduleDatesReview
        base={{
          scheduleKind: "prn",
          timesOfDay: null,
          weekdaysMask: null,
          intervalHours: null,
          anchorAt: null,
          doseQuantityValue: prnValues.doseQuantityValue,
          doseQuantityUnit: prnValues.doseQuantityUnit,
        }}
        onSubmit={onContinue}
        onBack={() => setSubStep("prn")}
      />
    );
  }

  // Defensive fallback — shouldn't be reachable via the normal flow.
  return <ScheduleKindChooser onChoose={handleKindChoice} onSkip={() => onContinue(null)} onBack={onBack} />;
}

function subStepForDraft(draft: ScheduleDraft): ScheduleSubStep {
  if (draft.scheduleKind === "prn") return "prn";
  if (draft.scheduleKind === "every_n_hours") return "elapsed";
  return "wall_clock";
}
