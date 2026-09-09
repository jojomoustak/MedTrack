"use client";

import { useCallback, useEffect, useState } from "react";
import { newId } from "@/lib/domain/ids";
import { DexieFavoriteRepository } from "@/lib/db-client/favorite-repository";
import { logger } from "@/lib/logging/logger";

export interface FavoriteMedicationsState {
  status: "loading" | "ready";
  favoriteIds: Set<string>;
  /** Optimistic — flips local state immediately, then persists (Phase 2 §2.10's LWW toggle) in the background. Never throws; a failure is logged and the optimistic flip is left as-is (the next pull/outbox retry reconciles it, same as every other LWW entity). */
  toggleFavorite: (userMedicationId: string) => void;
}

/**
 * Backs the Medications list's "Favorites" segment (Phase 3 §1 refinement
 * 1 — a filter/relationship on `UserMedication`, not a separate tab's own
 * content) and a per-row favorite-toggle affordance.
 */
export function useFavoriteMedications(profileId: string | null): FavoriteMedicationsState {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    async function load() {
      const repo = new DexieFavoriteRepository();
      const active = await repo.listActive(profileId!);
      if (cancelled) return;
      setFavoriteIds(new Set(active.map((f) => f.userMedicationId)));
      setStatus("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const toggleFavorite = useCallback(
    (userMedicationId: string) => {
      if (!profileId) return;
      // Optimistic flip first — the repository call below is the one
      // that actually persists it; a mid-flight tap on the SAME
      // medication before it resolves reads this updated state, not the
      // pre-toggle one.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(userMedicationId)) next.delete(userMedicationId);
        else next.add(userMedicationId);
        return next;
      });

      const repo = new DexieFavoriteRepository();
      repo.toggle(profileId, userMedicationId, newId()).catch((err) => {
        logger.warn("medications.toggle_favorite_failed", { message: err instanceof Error ? err.message : String(err) });
      });
    },
    [profileId],
  );

  return { status, favoriteIds, toggleFavorite };
}
