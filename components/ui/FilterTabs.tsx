"use client";

export interface FilterTab<T extends string> {
  value: T;
  label: string;
}

/**
 * List filters in the reference mockup's style (Medications: All / Active /
 * Inactive): the selected filter reads as green text with an underline; the
 * others keep a filled background, so they still look tappable — stripping
 * unselected options to plain text was tried on this very filter once and
 * users couldn't tell they were options (see `SegmentedControl`).
 */
export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`relative min-h-11 flex-1 rounded-xl px-2 text-[15px] whitespace-nowrap transition-colors duration-150 ${
              active
                ? "font-semibold text-accent-700 after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:rounded-full after:bg-accent-700 dark:text-accent-400 dark:after:bg-accent-400"
                : "bg-surface-muted font-medium text-stone-700 active:bg-stone-200 dark:text-stone-300 dark:active:bg-stone-800"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
