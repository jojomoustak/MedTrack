/**
 * A single-row segmented control where every option keeps a visible
 * border/background — unlike an independent action-button row (where
 * only the primary action stays solid and the rest go text-only), a
 * segmented control's options are a *set the user must recognize as one
 * control*; stripping the unselected options down to plain text breaks
 * that signifier (confirmed the hard way: an earlier pass tried it on the
 * Medications filter and users couldn't tell the other options were
 * tappable). All segments stay bordered; only the active one fills solid.
 */
export interface Segment<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  columns,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Force a fixed grid (e.g. 2 columns) instead of one flexible row — for label sets that would wrap awkwardly in a single row on narrow phones. */
  columns?: number;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={columns ? `grid gap-2` : "flex gap-2"}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.value)}
            className={`min-h-12 flex-1 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 active:scale-95 ${
              active
                ? "border-accent-700 bg-accent-700 text-white dark:border-accent-500 dark:bg-accent-500 dark:text-stone-950"
                : "border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
