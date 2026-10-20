/**
 * When the gift's hearts show (`components/gift/GiftHearts.tsx`): the
 * first time the app is opened on this device, then now and then — never
 * twice within a few days, and only by chance after that, so they stay a
 * surprise (owner's request, 2026-10-20: "the first time, then rarely").
 */

/** Never again within this long. */
export const HEARTS_MIN_GAP_MS = 4 * 24 * 3_600_000;

/** After the gap, the chance at each opening. */
export const HEARTS_CHANCE = 0.25;

/** Coming back to the app after this long counts as opening it again. */
export const AWAY_COUNTS_AS_OPENING_MS = 30 * 60_000;

export function shouldShowHearts(lastShownAt: number | null, now: number, random: number): boolean {
  if (lastShownAt === null) return true;
  if (now - lastShownAt < HEARTS_MIN_GAP_MS) return false;
  return random < HEARTS_CHANCE;
}

/** Per account and device, in the browser's storage: when they last showed. Not health data. */
function storageKey(accountId: string): string {
  return `medtrack:gift-hearts:${accountId}`;
}

export function readHeartsShownAt(accountId: string): number | null {
  try {
    const value = Number(localStorage.getItem(storageKey(accountId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeHeartsShownAt(accountId: string, at: number): void {
  try {
    localStorage.setItem(storageKey(accountId), String(at));
  } catch {
    // Storage unavailable: they may show again next time, which is fine.
  }
}
