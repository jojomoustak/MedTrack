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
 *
 * `notification` is the one effect in the app NOT called synchronously
 * from inside a click/tap handler — it fires from `useTodayDoseEvents`'s
 * 30s polling interval when a dose crosses into "due now" while Today
 * stays open. Mobile browser/WebView autoplay policies generally only
 * allow unmuted playback that's tied to a real user gesture; a
 * timer-fired call has no such gesture in its call stack, so without the
 * priming below it can be silently blocked even though `button`/`success`
 * (always gesture-triggered) play fine. `registerAutoplayUnlock` prime-
 * plays (then immediately pauses) every cached element the moment the
 * user makes their first real tap anywhere in the app, which is enough
 * for most engines to treat the page as having "user activation" for the
 * rest of the session — including later calls with no gesture in their
 * own stack.
 */
export type SoundEffect = "button" | "success" | "notification";

const SOUND_FILES: Record<SoundEffect, string> = {
  button: "/button.mp3",
  success: "/success.mp3",
  notification: "/notification.mp3",
};

/**
 * Decoded sounds, played through Web Audio (2026-10-09). Every tap used to
 * clone an `<audio>` element, and each clone loaded its file again —
 * visible as two media requests per tap, and on a phone a click that
 * lagged the tap. Decoded once, a sound starts the instant it's asked for.
 * The `<audio>` path below stays as the fallback: for the first moments
 * after launch while the files decode, and where Web Audio isn't
 * available.
 */
let audioContext: AudioContext | null | undefined;
const decoded = new Map<SoundEffect, AudioBuffer>();
const decoding = new Map<SoundEffect, Promise<void>>();

function getAudioContext(): AudioContext | null {
  if (audioContext !== undefined) return audioContext;
  const Context = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  try {
    audioContext = Context ? new Context() : null;
  } catch {
    audioContext = null;
  }
  return audioContext;
}

function decode(effect: SoundEffect): void {
  const context = getAudioContext();
  if (!context || decoded.has(effect) || decoding.has(effect)) return;
  const run = fetch(SOUND_FILES[effect])
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      decoded.set(effect, buffer);
    })
    .catch(() => {
      // Ignored — the `<audio>` fallback keeps working; a later call retries.
    })
    .finally(() => decoding.delete(effect));
  decoding.set(effect, run);
}

/** True if the sound was started through Web Audio. */
function playDecoded(effect: SoundEffect): boolean {
  const context = getAudioContext();
  const buffer = decoded.get(effect);
  if (!context || !buffer) return false;
  try {
    if (context.state === "suspended") void context.resume().catch(() => {});
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    return true;
  } catch {
    return false;
  }
}

const baseAudioCache = new Map<SoundEffect, HTMLAudioElement>();
let activeUnlockHandler: (() => void) | null = null;

function getOrCreateBase(effect: SoundEffect): HTMLAudioElement {
  let base = baseAudioCache.get(effect);
  if (!base) {
    base = new Audio(SOUND_FILES[effect]);
    base.preload = "auto";
    baseAudioCache.set(effect, base);
  }
  return base;
}

function unregisterAutoplayUnlock(): void {
  if (!activeUnlockHandler || typeof document === "undefined") return;
  document.removeEventListener("pointerdown", activeUnlockHandler);
  document.removeEventListener("touchstart", activeUnlockHandler);
  activeUnlockHandler = null;
}

function registerAutoplayUnlock(): void {
  if (activeUnlockHandler || typeof document === "undefined") return;

  const unlock = () => {
    unregisterAutoplayUnlock();
    // The first real tap is also the gesture Web Audio needs to start, and
    // the moment to decode every sound for the rest of the session.
    const context = getAudioContext();
    if (context?.state === "suspended") void context.resume().catch(() => {});
    for (const effect of Object.keys(SOUND_FILES) as SoundEffect[]) {
      decode(effect);
      try {
        const base = getOrCreateBase(effect);
        const result = base.play();
        if (result && typeof result.then === "function") {
          result.then(() => base.pause()).catch(() => {});
        }
      } catch {
        // Ignored — see this module's doc comment.
      }
    }
  };

  activeUnlockHandler = unlock;
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("touchstart", unlock);
}

export function playSound(effect: SoundEffect): void {
  if (typeof window === "undefined") return;
  if (playDecoded(effect)) return;
  decode(effect);
  if (typeof Audio === "undefined") return;

  try {
    const base = getOrCreateBase(effect);
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

if (typeof window !== "undefined") {
  registerAutoplayUnlock();
}

/** Test-only: clears the cached base `Audio` elements and decoded sounds, and re-arms a fresh autoplay-unlock listener (tearing down any previous one first), so a test that stubs `window.Audio` isn't defeated by a previous test's cached instance or dangling listener surviving into it. */
export function __resetSoundCacheForTests(): void {
  baseAudioCache.clear();
  decoded.clear();
  decoding.clear();
  audioContext = undefined;
  unregisterAutoplayUnlock();
  if (typeof window !== "undefined") {
    registerAutoplayUnlock();
  }
}
