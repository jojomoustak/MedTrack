"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { SyncStatusChip } from "@/components/sync/SyncStatusChip";
import { DoseStatusGlyph, DOSE_MARKER_LABEL } from "@/components/calendar/DoseStatusGlyph";
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import type { MedicationForm } from "@/lib/domain/user-medication";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("el-GR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function unitLabel(unit: string | null): string {
  if (!unit) return "";
  return FORM_LABELS[unit as MedicationForm] ?? unit;
}

/**
 * Dose history detail (Phase 3 §2.6) — read-only only, per the spec's own
 * "(read-only)" label on this screen and ADR-014's framing; no edit
 * affordance anywhere here, including for `notes` (nothing captures one
 * yet — this screen shows whatever's there, always "Καμία σημείωση" today).
 */
export default function DoseHistoryDetailPage() {
  const profileId = useProfileId();
  const params = useParams<{ id: string }>();
  const [dose, setDose] = useState<DoseEventRecord | null | undefined>(undefined);
  const { medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const repo = new DexieDoseEventRepository();
      const record = await repo.get(params.id);
      if (!cancelled) setDose(record);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const medicationName = dose ? (names.get(dose.userMedicationId) ?? "…") : "…";
  const markerKind = dose?.status;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Link href="/calendar/timeline" className="min-h-12 text-sm font-medium underline">
        ← Πίσω
      </Link>

      {dose === undefined && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      {dose === null && <p className="text-sm text-zinc-600 dark:text-zinc-400">Δεν βρέθηκε αυτή η δόση.</p>}

      {dose && (
        <>
          <div>
            <h1 className="text-xl font-semibold">Λήψη — {medicationName}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{formatDateTime(dose.scheduledAt)}</p>
          </div>

          <dl className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <dt className="font-medium">Κατάσταση</dt>
              <dd className="flex items-center gap-1.5">
                {markerKind && <DoseStatusGlyph kind={markerKind} />}
                {DOSE_MARKER_LABEL[dose.status]}
              </dd>
            </div>

            {(dose.status === "taken" || dose.status === "taken_late") && (
              <div className="flex items-center justify-between gap-2">
                <dt className="font-medium">Ώρα λήψης</dt>
                <dd>{formatTime(dose.takenAt)}</dd>
              </div>
            )}

            {dose.quantityValue && (
              <div className="flex items-center justify-between gap-2">
                <dt className="font-medium">Ποσότητα</dt>
                <dd>
                  {dose.quantityValue} {unitLabel(dose.quantityUnit)}
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <dt className="font-medium">Σημειώσεις</dt>
              <dd className="text-right">{dose.notes ?? "Καμία σημείωση"}</dd>
            </div>
          </dl>

          {dose.syncState !== "synced" && (
            <div>
              <SyncStatusChip state={dose.syncState} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
