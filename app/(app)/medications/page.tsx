"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { useScheduleSummaries } from "@/lib/medications/client/use-schedule-summaries";
import { useLowStockMedicationIds } from "@/lib/inventory/client/use-low-stock-medications";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { MedicationAvatar } from "@/components/medications/MedicationAvatar";
import { FilterTabs, type FilterTab } from "@/components/ui/FilterTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import { playSound } from "@/lib/sound/client/play-sound";
import { dosageFormLabel, TREATMENT_STATE_LABELS } from "@/lib/medications/labels";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

type Segment = "all" | "active" | "inactive";

const EMPTY_SEGMENT_MESSAGE: Record<Segment, string> = {
  all: "Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.",
  active: "Κανένα ενεργό φάρμακο αυτή τη στιγμή.",
  inactive: "Κανένα ανενεργό φάρμακο αυτή τη στιγμή.",
};

/**
 * Phase 3 §2.3 Medications list, laid out after the reference mockup's
 * screen 8: title with the one Add entry point, a search field, All /
 * Active / Inactive filters with counts, and one row per medication — its
 * tile, name, "strength • form", and how often it's scheduled. The whole
 * row opens the medication. (The favorite star moved to Medication Detail.)
 */
export default function MedicationsPage() {
  const profileId = useProfileId();
  const { status, medications } = useMedicationsList(profileId);
  const [segment, setSegment] = useState<Segment>("all");
  const [query, setQuery] = useState("");
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);
  const schedules = useScheduleSummaries(profileId, medications);
  const lowStockIds = useLowStockMedicationIds(profileId, medications);

  const allCount = medications.length;
  const activeCount = medications.filter((m) => m.treatmentState === "active").length;
  const inactiveCount = allCount - activeCount;

  const tabs: FilterTab<Segment>[] = [
    { value: "all", label: `Όλα (${allCount})` },
    { value: "active", label: `Ενεργά (${activeCount})` },
    { value: "inactive", label: `Ανενεργά (${inactiveCount})` },
  ];

  let visible: UserMedicationRecord[];
  if (segment === "active") {
    visible = medications.filter((m) => m.treatmentState === "active");
  } else if (segment === "inactive") {
    visible = medications.filter((m) => m.treatmentState !== "active");
  } else {
    visible = medications;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery) {
    visible = visible.filter((m) => (names.get(m.id) ?? "").toLocaleLowerCase().includes(normalizedQuery));
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Φάρμακα</h1>
        <ButtonLink href="/medications/add" onClick={() => playSound("button")}>
          <PlusIcon />
          Προσθήκη
        </ButtonLink>
      </div>

      <label className="relative block">
        <span className="sr-only">Αναζήτηση φαρμάκων</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-500 dark:text-stone-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση φαρμάκων…"
          className="min-h-12 w-full rounded-xl bg-surface-muted py-2 pr-4 pl-11 text-base text-stone-900 placeholder:text-stone-500 focus:ring-2 focus:ring-accent-600/25 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-500"
        />
      </label>

      <FilterTabs
        tabs={tabs}
        value={segment}
        onChange={(next) => {
          playSound("button");
          setSegment(next);
        }}
        label="Φίλτρο φαρμάκων"
      />

      {status === "loading" && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && visible.length === 0 && (
        <EmptyState icon={<EmptyMedIcon />} title={normalizedQuery ? "Δεν βρέθηκαν φάρμακα." : EMPTY_SEGMENT_MESSAGE[segment]} />
      )}

      {status === "ready" && visible.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Λίστα φαρμάκων">
          {visible.map((med) => {
            const name = names.get(med.id) ?? "…";
            const detail = [strengths.get(med.id), dosageFormLabel(med.customForm ?? med.inventoryUnit)].filter(Boolean).join(" • ");
            const frequency = med.treatmentState === "active" ? schedules.get(med.id) : TREATMENT_STATE_LABELS[med.treatmentState];
            const lowStock = lowStockIds.has(med.id);
            return (
              <li key={med.id}>
                <Link
                  href={`/medications/${med.id}`}
                  onClick={() => playSound("button")}
                  className="surface-card flex min-h-24 items-center gap-4 py-4 pr-3 pl-3.5 transition-transform duration-150 active:scale-[.99]"
                >
                  {/* A freshly-created medication may not exist on the
                      server yet (local-first write) — the photo endpoint
                      needs a real server row, so its photo is only looked
                      up once synced. */}
                  <MedicationAvatar medicationId={med.id} form={med.customForm ?? med.inventoryUnit} withPhoto={med.syncState === "synced"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[19px] font-bold text-stone-900 dark:text-stone-50">{name}</p>
                    {detail && <p className="truncate text-base text-stone-600 dark:text-stone-400">{detail}</p>}
                    {frequency && <p className="truncate text-base text-stone-600 dark:text-stone-400">{frequency}</p>}
                    {lowStock && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
                        <LowStockGlyph />
                        Χαμηλό απόθεμα
                      </p>
                    )}
                  </div>
                  <SyncStatusChip state={med.syncState} compact />
                  <ChevronIcon />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M16 16l-3.5-3.5" />
    </svg>
  );
}

function LowStockGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true" focusable="false" fill="currentColor" className="shrink-0">
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
