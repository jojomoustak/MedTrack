"use client";

/**
 * Lightweight UI sound effects — a tap cue (`button`), a save confirmation
 * (`success`), and an in-app "a dose just became due" chime
 * (`notification`). Deliberately not tied to any accessibility/media
 * preference the app doesn't yet have (`UserPreferencesRecord` has no
 * sound toggle) — every call site here is triggered by a genuine user
 * action (a tap) or a benign in-app cue, never autoplayed on page load,
 * so there's nothing here for a mute setting to need to suppress yet.
 *
 * `HTMLAudioElement.play()` can reject (autoplay policy, no audio
 * hardware, the file failing to load) — always swallowed, since a sound
 * effect failing must never surface as an error or block the real action
 * it's decorating.
 */
export type SoundEffect = "button" | "success" | "notification";

const SOUND_FILES: Record<SoundEffect, string> = {
  button: "/button.mp3",
  success: "/success.mp3",
  notification: "/notification.mp3",
};

const baseAudioCache = new Map<SoundEffect, HTMLAudioElement>();

export function playSound(effect: SoundEffect): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

  try {
    let base = baseAudioCache.get(effect);
    if (!base) {
      base = new Audio(SOUND_FILES[effect]);
      base.preload = "auto";
      baseAudioCache.set(effect, base);
    }
    // Clone rather than reuse/replay the cached element directly, so two
    // rapid taps (e.g. Taken on two different dose cards in quick
    // succession) overlap instead of the second cutting the first off.
    const instance = base.cloneNode(true) as HTMLAudioElement;
    void instance.play().catch(() => {
      // Ignored — see this module's doc comment.
    });
  } catch {
    // Ignored — see this module's doc comment.
  }
}

/** Test-only: clears the cached base `Audio` elements, so a test that stubs `window.Audio` isn't defeated by a previous test's cached instance surviving into it. */
export function __resetSoundCacheForTests(): void {
  baseAudioCache.clear();
}
