"use client";

import { useState } from "react";
import { zonedWallClockToUtc } from "@/lib/domain/dose-event-generation";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT } from "@/components/ui/field-styles";
import { TimeField } from "@/components/ui/TimeField";
import { DateField } from "@/components/ui/DateField";
import { dateToParam } from "@/components/calendar/date-param";
import { T, useT } from "@/lib/i18n/client";

export interface ElapsedScheduleValues {
  intervalHours: number;
  anchorAt: string;
}

export interface ElapsedScheduleBuilderProps {
  onSubmit: (values: ElapsedScheduleValues) => void;
  onBack: () => void;
  initial?: { intervalHours: number; anchorDate: string; anchorTime: string };
}

/** Phase 3 §2.5's "Elapsed builder" — every_n_hours: interval + first-dose anchor. */
export function ElapsedScheduleBuilder({ onSubmit, onBack, initial }: ElapsedScheduleBuilderProps) {
  const t = useT();
  const [intervalHours, setIntervalHours] = useState(initial?.intervalHours ? String(initial.intervalHours) : "8");
  const [anchorDate, setAnchorDate] = useState(initial?.anchorDate ?? dateToParam(new Date())); // the phone's own date, not UTC's
  const [anchorTime, setAnchorTime] = useState(initial?.anchorTime ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const hours = Number(intervalHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      setError(t("Το διάστημα πρέπει να είναι από 1 έως 24 ώρες."));
      return;
    }
    if (!anchorDate || !anchorTime) {
      setError(t("Συμπληρώστε την ημερομηνία και ώρα της πρώτης δόσης."));
      return;
    }
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const anchorAt = zonedWallClockToUtc(anchorDate, anchorTime, timezone).toISOString();
    playSound("button");
    onSubmit({ intervalHours: hours, anchorAt });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold tracking-tight text-stone-900"><T>Κάθε πόσες ώρες</T></h2>

      <label className="flex flex-col gap-1">
        <span className="text-[17px] font-semibold text-stone-800"><T>Κάθε πόσες ώρες;</T></span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={24}
          value={intervalHours}
          onChange={(e) => setIntervalHours(e.target.value)}
          aria-label={t("Διάστημα σε ώρες")}
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[17px] font-semibold text-stone-800"><T>Πρώτη δόση</T></legend>
        <DateField value={anchorDate} onChange={setAnchorDate} label={t("Ημερομηνία πρώτης δόσης")} />
        <TimeField value={anchorTime} onChange={setAnchorTime} label={t("Ώρα πρώτης δόσης")} />
        <p className="text-[15px] text-stone-600">
          <T>Το διάστημα υπολογίζεται από την πρώτη δόση και δεν αλλάζει με την αλλαγή ώρας (π.χ. καλοκαιρινή/χειμερινή ώρα).</T>
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            playSound("button");
            onBack();
          }}
          size="lg"
          className="flex-1"
        >
          <T>Πίσω</T>
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          <T>Συνέχεια</T>
        </Button>
      </div>
    </form>
  );
}
