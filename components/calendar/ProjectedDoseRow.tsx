import { DoseStatusGlyph, DOSE_MARKER_LABEL } from "@/components/calendar/DoseStatusGlyph";
import { formatDoseTime } from "@/components/doses/DoseStatus";

export interface ProjectedDoseRowProps {
  medicationName: string;
  /** ISO instant, UTC. */
  scheduledAt: string;
}

/**
 * A dose beyond `GENERATION_HORIZON_MS` — ADR-014's projection, not a real
 * `DoseEventRecord`. Same shape as a dose row but dashed and muted, with
 * no status beyond "scheduled", and never a link: no `id` exists for a
 * detail screen to key off of.
 */
export function ProjectedDoseRow({ medicationName, scheduledAt }: ProjectedDoseRowProps) {
  const timeLabel = formatDoseTime(scheduledAt);
  return (
    <div
      role="group"
      aria-label={`${medicationName}, ${timeLabel}, ${DOSE_MARKER_LABEL.projected}, χωρίς κατάσταση ακόμα`}
      className="flex min-h-19 items-center gap-3.5 rounded-2xl border-2 border-dashed border-stone-300 py-3 pr-3 pl-3 dark:border-stone-700"
    >
      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-stone-400">
        <DoseStatusGlyph kind="projected" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold text-stone-700 dark:text-stone-300">{medicationName}</p>
        <p className="truncate text-[15px] text-stone-500 tabular-nums dark:text-stone-400">
          {timeLabel} • {DOSE_MARKER_LABEL.projected}
        </p>
      </div>
    </div>
  );
}
