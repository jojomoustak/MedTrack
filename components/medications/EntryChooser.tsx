"use client";

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
export function EntryChooser({ onChoose, scanAvailable }: EntryChooserProps) {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Πώς θέλετε να προσθέσετε το φάρμακο;">
      <button
        type="button"
        disabled={!scanAvailable}
        aria-disabled={!scanAvailable}
        aria-label={scanAvailable ? "Σάρωση barcode" : "Σάρωση barcode — διαθέσιμο μόνο στην εφαρμογή για κινητά"}
        onClick={scanAvailable ? () => onChoose("scan") : undefined}
        className={
          scanAvailable
            ? "flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            : "flex min-h-12 items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
        }
      >
        <span>
          <span className="block font-medium">Σάρωση barcode</span>
          <span className="block text-sm">
            {scanAvailable ? "Σαρώστε τη συσκευασία του φαρμάκου" : "Διαθέσιμο μόνο στην εφαρμογή για κινητά"}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChoose("search")}
        className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <span>
          <span className="block font-medium">Αναζήτηση</span>
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">Βρείτε το φάρμακο στον κατάλογο</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChoose("manual")}
        className="flex min-h-12 items-center rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <span>
          <span className="block font-medium">Χειροκίνητη καταχώριση</span>
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">Εισαγάγετε τα στοιχεία με το χέρι</span>
        </span>
      </button>
    </div>
  );
}
