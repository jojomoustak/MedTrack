"use client";

import { playSound } from "@/lib/sound/client/play-sound";

export type EntryChoice = "scan" | "search" | "manual";

export interface EntryChooserProps {
  onChoose: (choice: EntryChoice) => void;
  /**
   * Whether the native scanner is actually reachable right now
   * (`MobilePlatform.isAvailable()`, Phase 1 §3) — synchronous, no native
   * call made just to check. `false` covers both "not inside the Median
   * app at all" and any other reason the bridge can't be used; the option
   * stays visible either way (never omitted — per Phase 3's "not hidden
   * entirely" direction from the earlier disabled-placeholder version of
   * this component) but is only clickable when this is `true`.
   */
  scanAvailable: boolean;
}

/**
 * Phase 3 §2.4 "Add Medication — entry chooser": Scan / Search / Manual,
 * equal-weight options. Scan (Phase 7-8) is wired to the real
 * `MobilePlatform.scanBarcode()` flow — its enabled/disabled state
 * reflects live platform availability, not a "coming soon" placeholder
 * anymore.
 */
const ICONS: Record<EntryChoice, React.ReactNode> = {
  scan: (
    <>
      <path d="M4 9V7.5A2.5 2.5 0 0 1 6.5 5h2l1.5-2h4l1.5 2h2A2.5 2.5 0 0 1 20 7.5V9" />
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  manual: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
};

function ChoiceCard({
  choice,
  title,
  description,
  disabled = false,
  label,
  onChoose,
}: {
  choice: EntryChoice;
  title: string;
  description: string;
  disabled?: boolean;
  label?: string;
  onChoose: (choice: EntryChoice) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={label}
      onClick={disabled ? undefined : () => onChoose(choice)}
      className={`surface-card flex min-h-24 w-full items-center gap-4 p-4 text-left transition-transform duration-150 ${disabled ? "opacity-60" : "active:scale-[0.98]"}`}
    >
      <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-400">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[choice]}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[19px] font-bold text-stone-900 dark:text-stone-50">{title}</span>
        <span className="block text-base text-stone-600 dark:text-stone-400">{description}</span>
      </span>
    </button>
  );
}

/**
 * Phase 3 §2.4 "Add Medication — entry chooser" (reference mockup, screen
 * 14): Scan / Search / Manual as three equal cards. Scan is wired to the
 * real `MobilePlatform.scanBarcode()` flow — enabled only when the native
 * scanner is reachable, but never hidden.
 */
export function EntryChooser({ onChoose, scanAvailable }: EntryChooserProps) {
  function handleChoose(choice: EntryChoice) {
    playSound("button");
    onChoose(choice);
  }

  return (
    <div className="flex flex-col gap-4" role="group" aria-label="Πώς θέλετε να προσθέσετε το φάρμακο;">
      <ChoiceCard
        choice="scan"
        title="Σάρωση συσκευασίας"
        description={scanAvailable ? "Σαρώστε το barcode της συσκευασίας και τα στοιχεία συμπληρώνονται." : "Διαθέσιμο μόνο στην εφαρμογή για κινητά."}
        disabled={!scanAvailable}
        label={scanAvailable ? "Σάρωση συσκευασίας" : "Σάρωση συσκευασίας — διαθέσιμο μόνο στην εφαρμογή για κινητά"}
        onChoose={handleChoose}
      />
      <ChoiceCard choice="search" title="Αναζήτηση στον κατάλογο" description="Βρείτε το φάρμακό σας στον κατάλογο φαρμάκων." onChoose={handleChoose} />
      <ChoiceCard choice="manual" title="Χειροκίνητη καταχώριση" description="Συμπληρώστε τα στοιχεία μόνοι σας." onChoose={handleChoose} />
    </div>
  );
}
