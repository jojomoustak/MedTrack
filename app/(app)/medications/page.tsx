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
import { MedicationThumbnail } from "@/components/medications/MedicationThumbnail";
import { SegmentedControl, type Segment as SegmentDef } from "@/components/ui/SegmentedControl";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { playSound } from "@/lib/sound/client/play-sound";
import { formatQuantity } from "@/lib/domain/quantity";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

type Segment = "all" | "active" | "favorites" | "recent";

const SEGMENTS: SegmentDef<Segment>[] = [
  { value: "all", label: "Όλα" },
  { value: "active", label: "Ενεργά" },
  { value: "favorites", label: "Αγαπημένα" },
  { value: "recent", label: "Πρόσφατα" },
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

      {/* UX feedback history here: shrinking (flex-1+truncate) clipped
          labels; scrolling (overflow-x-auto) cut the last tab off at the
          edge on narrow Android widths; flex-wrap avoided both but left
          the 4th tab alone on its own row, lower than the rest and visibly
          lopsided. A fixed 2x2 grid is the one layout where every label
          stays full-size and every tab sits at the same visual level. */}
      <SegmentedControl
        segments={SEGMENTS}
        value={segment}
        onChange={(next) => {
          playSound("button");
          setSegment(next);
        }}
        label="Φίλτρο φαρμάκων"
        columns={2}
      />

      {(status === "loading" || segmentLoading) && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {/* UX feedback (2026-09-22): this centered CTA duplicated
          `AddMedicationFab`, which is always on-screen here (fixed
          bottom-right) regardless of segment/empty state — one add
          entry point on this screen is enough. */}
      {status === "ready" && !segmentLoading && visible.length === 0 && (
        <EmptyState icon={<EmptyMedIcon />} title={EMPTY_SEGMENT_MESSAGE[segment]} />
      )}

      {status === "ready" && !segmentLoading && visible.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Λίστα φαρμάκων">
          {visible.map((med) => {
            const isFavorite = favoriteIds.has(med.id);
            return (
              <Card as="li" key={med.id} className="flex min-h-16 items-center justify-between gap-3 p-3">
                {/* A freshly-created medication may not exist on the server
                    yet (local-first write) — the photo endpoints need a
                    real server row, so this only appears once synced
                    (mirrors `MedicationPhotoAttach`'s own gating). */}
                {med.syncState === "synced" && <MedicationThumbnail userMedicationId={med.id} />}
                <div className="min-w-0 flex-1">
                  <Link href={`/medications/${med.id}`} className="font-medium underline-offset-2 hover:underline">
                    {names.get(med.id) ?? "…"}
                  </Link>
                  {lowStockIds.has(med.id) && (
                    <span className="ml-2 inline-flex">
                      <Badge tone="warn" icon={<LowStockGlyph />}>
                        Χαμηλό απόθεμα
                      </Badge>
                    </span>
                  )}
                  {med.customStrengthValue && (
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      {formatQuantity(med.customStrengthValue)} {med.customStrengthUnit}
                    </p>
                  )}
                </div>
                {/* UX feedback (2026-09-24): moved from the leading edge to
                    trail the row, next to the sync chip, alongside the
                    thumbnail size bump. */}
                <button
                  type="button"
                  onClick={() => {
                    playSound("button");
                    toggleFavorite(med.id);
                  }}
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? `Αφαίρεση ${names.get(med.id) ?? "φαρμάκου"} από τα αγαπημένα` : `Προσθήκη ${names.get(med.id) ?? "φαρμάκου"} στα αγαπημένα`}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition duration-200 active:scale-90 ${isFavorite ? "text-amber-500" : "text-stone-300 dark:text-stone-600"}`}
                >
                  <StarIcon filled={isFavorite} />
                </button>
                <SyncStatusChip state={med.syncState} />
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LowStockGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true" focusable="false" fill="currentColor" className="shrink-0">
      <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
    </svg>
  );
}

function EmptyMedIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <g transform="rotate(-45 12 12)">
        <rect x="4" y="8" width="16" height="8" rx="4" />
        <path d="M12 8v8" />
      </g>
    </svg>
  );
}

/** Real drawn icon, not the Unicode ★/☆ glyphs this replaced — those render with inconsistent glyph coverage/weight across platforms/fonts. */
function StarIcon({ filled }: { filled: boolean }) {
  const path = "M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z";
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="currentColor">
        <path d={path} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
