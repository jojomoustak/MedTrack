"use client";

import { useMemo } from "react";
import type { MedicationForm, UserMedicationRecord } from "@/lib/domain/user-medication";

export interface MedicationVisual {
  form: MedicationForm | null;
  /** Only a synced medication can have a photo on the server (`MedicationAvatar`). */
  withPhoto: boolean;
}

/**
 * What each medication's picture needs (`MedicationAvatar`), by id: the
 * same form and photo rules as the Medications list, for the dose rows on
 * Today and the Calendar (2026-10-15).
 */
export function useMedicationVisuals(medications: readonly UserMedicationRecord[]): Map<string, MedicationVisual> {
  return useMemo(
    () => new Map(medications.map((med) => [med.id, { form: med.customForm ?? med.inventoryUnit, withPhoto: med.syncState === "synced" }])),
    [medications],
  );
}
