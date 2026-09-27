"use client";

/**
 * Content-switching tabs (Medication Detail's Overview/Schedule/History) —
 * a plain underlined style, deliberately distinct from `SegmentedControl`'s
 * filled-pill look: a segmented control picks among peer FILTERS on a list
 * (Medications' All/Active/Favorites), while this switches which CONTENT
 * section of one record is showing. Reusing the pill style for both would
 * blur that distinction on screens that have both at once.
 */
export interface TabItem<T extends string> {
  value: T;
  label: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 border-b border-stone-200 dark:border-stone-800">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`min-h-11 border-b-2 px-0.5 text-sm font-semibold transition-colors ${
              active ? "border-accent-700 text-accent-800 dark:border-accent-400 dark:text-accent-400" : "border-transparent text-stone-500 dark:text-stone-400"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
