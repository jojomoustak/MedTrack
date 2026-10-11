"use client";

import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";

/**
 * Ids of this profile's medications that still exist. A deleted
 * medication's doses stay in the database (history, sync) but aren't shown
 * on Today or in Calendar: there's no medicine left to show them under, so
 * they appeared as nameless "…" rows (found on the owner's phone,
 * 2026-10-11, after deleting an accidental duplicate).
 */
export async function liveMedicationIds(profileId: string): Promise<Set<string>> {
  const medications = await new DexieUserMedicationRepository().list(profileId);
  return new Set(medications.map((m) => m.id));
}
