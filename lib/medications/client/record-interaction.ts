"use client";

import { newId } from "@/lib/domain/ids";
import type { RecentlyUsedInteractionType } from "@/lib/domain/recently-used-event";
import { DexieRecentlyUsedEventRepository } from "@/lib/db-client/recently-used-event-repository";
import { logger } from "@/lib/logging/logger";

/**
 * Records one `RecentlyUsedEvent` (Phase 2 §2.11) — backs the Medications
 * list's "Recent" segment. Best-effort and fire-and-forget by design: a
 * failure here (offline, IndexedDB unavailable) must never block or fail
 * the real action it's decorating (viewing a medication, marking a dose
 * taken, …), same reasoning as `syncNativeRemindersNow`'s own callers.
 */
export function recordMedicationInteraction(profileId: string | null, userMedicationId: string, interactionType: RecentlyUsedInteractionType): void {
  if (!profileId) return;
  const repo = new DexieRecentlyUsedEventRepository();
  repo
    .record({
      id: newId(),
      profileId,
      userMedicationId,
      interactionType,
      occurredAt: new Date().toISOString(),
    })
    .catch((err) => logger.warn("medications.record_interaction_failed", { interactionType, message: err instanceof Error ? err.message : String(err) }));
}
