"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";

type Segment = "all" | "active" | "favorites" | "recent";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "all", label: "Όλα" },
  { key: "active", label: "Ενεργά" },
  { key: "favorites", label: "Αγαπημένα" },
  { key: "recent", label: "Πρόσφατα" },
];

/** Phase 3 §2.3 Medications list — All/Active/Favorites/Recent segments (§1 refinement 1). Favorites/Recent are Phase 13 — shown as real, selectable segments with an honest "not built yet" state, not omitted or fake-populated. */
export default function MedicationsPage() {
  const profileId = useProfileId();
  const { status, medications } = useMedicationsList(profileId);
  const [segment, setSegment] = useState<Segment>("all");
  const names = useDisplayNames(medications);

  const visible =
    segment === "active"
      ? medications.filter((m) => m.treatmentState === "active")
      : segment === "all"
        ? medications
        : []; // favorites/recent: Phase 13

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Φάρμακα</h1>
        <Link href="/medications/add" className="min-h-12 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
          Προσθήκη
        </Link>
      </div>

      <div role="tablist" aria-label="Φίλτρο φαρμάκων" className="flex gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={`min-h-12 rounded-full border px-4 py-2 text-sm font-medium ${
              segment === s.key
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {status === "loading" && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && (segment === "favorites" || segment === "recent") && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Έρχεται σύντομα.</p>
      )}

      {status === "ready" && (segment === "all" || segment === "active") && visible.length === 0 && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            {medications.length === 0 ? "Δεν έχετε προσθέσει ακόμα κανένα φάρμακο." : "Κανένα ενεργό φάρμακο αυτή τη στιγμή."}
          </p>
          <Link
            href="/medications/add"
            className="flex min-h-12 items-center justify-center rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Προσθήκη φαρμάκου
          </Link>
        </div>
      )}

      {status === "ready" && visible.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Λίστα φαρμάκων">
          {visible.map((med) => (
            <li key={med.id} className="flex min-h-12 items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <p className="font-medium">{names.get(med.id) ?? "…"}</p>
                {med.customStrengthValue && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {med.customStrengthValue} {med.customStrengthUnit}
                  </p>
                )}
                {/* A freshly-created medication may not exist on the server yet (local-first write) — the photo endpoints need a real server row, so this link only appears once synced (mirrors `MedicationPhotoAttach`'s own gating). */}
                {med.syncState === "synced" ? (
                  <Link href={`/medications/${med.id}/photo`} className="text-sm font-medium underline">
                    Φωτογραφία
                  </Link>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">Φωτογραφία μετά τον συγχρονισμό</p>
                )}
              </div>
              <SyncStatusChip state={med.syncState} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
