import { DoseStatusGlyph, DOSE_MARKER_LABEL } from "@/components/calendar/DoseStatusGlyph";

export interface ProjectedDoseRowProps {
  medicationName: string;
  /** ISO instant, UTC. */
  scheduledAt: string;
}

/**
 * A dose beyond `GENERATION_HORIZON_MS` — ADR-014's projection, not a real
 * `DoseEventRecord`. Deliberately lighter than `DoseCard` (no status to
 * show beyond "something is scheduled here," no quantity, no sync chip)
 * and never wrapped in a link: no `id` exists for a detail screen to key
 * off of.
 */
export function ProjectedDoseRow({ medicationName, scheduledAt }: ProjectedDoseRowProps) {
  const timeLabel = new Date(scheduledAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      role="group"
      aria-label={`${medicationName}, ${timeLabel}, ${DOSE_MARKER_LABEL.projected}, χωρίς κατάσταση ακόμα`}
      className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-2 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
    >
      <DoseStatusGlyph kind="projected" />
      <p className="text-sm">
        {timeLabel} — {medicationName}
      </p>
      <span className="ml-auto text-xs">{DOSE_MARKER_LABEL.projected}</span>
    </div>
  );
}
