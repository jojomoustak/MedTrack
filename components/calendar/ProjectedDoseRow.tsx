import { DoseStatusGlyph, DOSE_MARKER_LABEL } from "@/components/calendar/DoseStatusGlyph";
import { formatDoseTime } from "@/components/doses/DoseStatus";
import { MedicationAvatar } from "@/components/medications/MedicationAvatar";
import type { MedicationForm } from "@/lib/domain/user-medication";

export interface ProjectedDoseRowProps {
  medicationId: string;
  medicationName: string;
  /** For the medicine's picture, as on `TodayDoseRow`. */
  medication?: { form: MedicationForm | null; withPhoto: boolean };
  /** ISO instant, UTC. */
  scheduledAt: string;
}

/**
 * A dose beyond `GENERATION_HORIZON_MS` — ADR-014's projection, not a real
 * `DoseEventRecord`. Same shape as a dose row but dashed and muted, with
 * no status beyond "scheduled", and never a link: no `id` exists for a
 * detail screen to key off of.
 */
export function ProjectedDoseRow({ medicationId, medicationName, scheduledAt, medication }: ProjectedDoseRowProps) {
  const timeLabel = formatDoseTime(scheduledAt);
  return (
    <div
      role="group"
      aria-label={`${medicationName}, ${timeLabel}, ${DOSE_MARKER_LABEL.projected}, χωρίς κατάσταση ακόμα`}
      className="flex min-h-19 items-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 py-3 pr-2 pl-3"
    >
      <MedicationAvatar medicationId={medicationId} form={medication?.form ?? null} withPhoto={medication?.withPhoto ?? false} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold text-stone-700">{medicationName}</p>
        <p className="truncate text-[15px] text-stone-500 tabular-nums">
          {timeLabel} • {DOSE_MARKER_LABEL.projected}
        </p>
      </div>
      {/* Where a real dose row has its status circle (`TodayDoseRow`). */}
      <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-stone-400">
          <DoseStatusGlyph kind="projected" className="h-6 w-6" />
        </span>
      </span>
    </div>
  );
}
