"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useLowStockMedicationIds } from "@/lib/inventory/client/use-low-stock-medications";
import { useFavoriteMedications } from "@/lib/medications/client/use-favorite-medications";
import { useRecentMedications } from "@/lib/medications/client/use-recent-medications";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { playSound } from "@/lib/sound/client/play-sound";
import { formatQuantity } from "@/lib/domain/quantity";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

type Segment = "all" | "active" | "favorites" | "recent";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "all", label: "Όλα" },
  { key: "active", label: "Ενεργά" },
  { key: "favorites", label: "Αγαπημένα" },
  { key: "recent", label: "Πρόσφατα" },
];

const EMPTY_SEGMENT_MESSAGE: Record<Segment, string> = {
  all: "Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.",
  active: "Κανένα ενεργό φάρμακο αυτή τη στιγμή.",
  favorites: "Δεν έχετε αγαπημένα φάρμακα ακόμα. Πατήστε το ★ σε ένα φάρμακο για να το προσθέσετε.",
  recent: "Δεν έχετε δει κανένα φάρμακο πρόσφατα.",
};

/** Phase 3 §2.3 Medications list — All/Active/Favorites/Recent segments (§1 refinement 1, Phase 13). */
export default function MedicationsPage() {
  const profileId = useProfileId();
  const { status, medications } = useMedicationsList(profileId);
  const [segment, setSegment] = useState<Segment>("all");
  const names = useDisplayNames(medications);
  const lowStockIds = useLowStockMedicationIds(profileId, medications);
  const { status: favoritesStatus, favoriteIds, toggleFavorite } = useFavoriteMedications(profileId);
  const { status: recentStatus, recentMedicationIds } = useRecentMedications(profileId);

  const medicationsById = new Map(medications.map((m) => [m.id, m]));

  let visible: UserMedicationRecord[];
  let segmentLoading = false;
  if (segment === "active") {
    visible = medications.filter((m) => m.treatmentState === "active");
  } else if (segment === "favorites") {
    segmentLoading = favoritesStatus === "loading";
    visible = medications.filter((m) => favoriteIds.has(m.id));
  } else if (segment === "recent") {
    segmentLoading = recentStatus === "loading";
    visible = recentMedicationIds.map((id) => medicationsById.get(id)).filter((m): m is UserMedicationRecord => m !== undefined);
  } else {
    visible = medications;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* UX feedback (2026-09-22): "add" used to also live here, top-right
          — redundant with `AddMedicationFab` (fixed bottom-right on this
          same screen) and wrongly placed for a primary action. One add
          entry point now, in the conventional mobile position. */}
      <h1 className="text-xl font-semibold">Φάρμακα</h1>

      <div role="tablist" aria-label="Φίλτρο φαρμάκων" className="flex gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => {
              playSound("button");
              setSegment(s.key);
            }}
            className={`min-h-12 rounded-full border px-4 py-2 text-sm font-medium ${
              segment === s.key
                ? "border-accent-700 bg-accent-700 text-white dark:border-accent-500 dark:bg-accent-500 dark:text-zinc-950"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {(status === "loading" || segmentLoading) && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      {/* UX feedback (2026-09-22): this centered CTA duplicated
          `AddMedicationFab`, which is always on-screen here (fixed
          bottom-right) regardless of segment/empty state — one add
          entry point on this screen is enough. */}
      {status === "ready" && !segmentLoading && visible.length === 0 && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">{EMPTY_SEGMENT_MESSAGE[segment]}</p>
        </div>
      )}

      {status === "ready" && !segmentLoading && visible.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Λίστα φαρμάκων">
          {visible.map((med) => {
            const isFavorite = favoriteIds.has(med.id);
            return (
              <li key={med.id} className="flex min-h-12 items-center justify-between gap-2 rounded-xl shadow-sm shadow-zinc-300/40 dark:border dark:border-zinc-800 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    playSound("button");
                    toggleFavorite(med.id);
                  }}
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? `Αφαίρεση ${names.get(med.id) ?? "φαρμάκου"} από τα αγαπημένα` : `Προσθήκη ${names.get(med.id) ?? "φαρμάκου"} στα αγαπημένα`}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${isFavorite ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}`}
                >
                  {isFavorite ? "★" : "☆"}
                </button>
                <div className="min-w-0 flex-1">
                  <Link href={`/medications/${med.id}`} className="font-medium underline-offset-2 hover:underline">
                    {names.get(med.id) ?? "…"}
                  </Link>
                  {lowStockIds.has(med.id) && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true" focusable="false" fill="currentColor" className="shrink-0">
                        <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
                      </svg>
                      Χαμηλό απόθεμα
                    </span>
                  )}
                  {med.customStrengthValue && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {formatQuantity(med.customStrengthValue)} {med.customStrengthUnit}
                    </p>
                  )}
                  {/* A freshly-created medication may not exist on the server yet (local-first write) — the photo endpoints need a real server row, so this link only appears once synced (mirrors `MedicationPhotoAttach`'s own gating). */}
                  {med.syncState === "synced" ? (
                    <Link href={`/medications/${med.id}/photo`} className="text-sm font-medium underline">
                      Φωτογραφία
                    </Link>
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Φωτογραφία μετά τον συγχρονισμό</p>
                  )}
                </div>
                <SyncStatusChip state={med.syncState} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
