"use client";

import { useMemo } from "react";
import { MedicationAvatar } from "@/components/medications/MedicationAvatar";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { dosageFormLabel } from "@/lib/medications/labels";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

/** Which medication a task screen is about (reference mockup, Adjust Stock): its tile, name, and "strength • form". */
export function MedicationHeader({ medication }: { medication: UserMedicationRecord }) {
  // Memoized: the name/strength hooks re-resolve whenever this array's identity changes.
  const list = useMemo(() => [medication], [medication]);
  const name = useDisplayNames(list).get(medication.id) ?? "…";
  const strength = useMedicationStrengths(list).get(medication.id) ?? null;
  const form = medication.customForm ?? medication.inventoryUnit;
  const subtitle = [strength, dosageFormLabel(form)].filter(Boolean).join(" • ");

  return (
    <div className="flex items-center gap-4">
      <MedicationAvatar medicationId={medication.id} form={form} withPhoto={medication.syncState === "synced"} />
      <div className="min-w-0">
        <p className="truncate text-[21px] font-bold text-stone-900 dark:text-stone-50">{name}</p>
        {subtitle && <p className="truncate text-[17px] text-stone-600 dark:text-stone-400">{subtitle}</p>}
      </div>
    </div>
  );
}
