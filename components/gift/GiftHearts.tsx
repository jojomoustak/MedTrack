"use client";

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/sync/client/use-reduced-motion";
import { AWAY_COUNTS_AS_OPENING_MS, readHeartsShownAt, shouldShowHearts, writeHeartsShownAt } from "@/lib/gift/client/hearts-schedule";

const COLORS = ["#ff2d55", "#ff4d6d", "#f43f5e", "#e11d48", "#fb7185", "#ff6b9d"];
const HEART_COUNT = 26;
/** Hearts start one after another over this long. */
const EMIT_OVER_MS = 2400;
const LONGEST_RISE_MS = 3800;
/** The whole burst, from the first heart to the last one gone. */
export const BURST_MS = EMIT_OVER_MS + LONGEST_RISE_MS + 200;
/** With reduced motion: one heart, fading in and out. */
export const GLOW_MS = 1800;
/** A moment after opening, once the first screen is drawn. */
export const SHOW_AFTER_MS = 700;

const HEART_PATH =
  "M12 21s-6.7-4.35-9.33-8.1C.4 9.7 2.2 5 6.4 5c2.1 0 3.6 1.2 4.6 2.6l1 1.4 1-1.4C14 6.2 15.5 5 17.6 5c4.2 0 6 4.7 3.73 7.9C18.7 16.65 12 21 12 21Z";

interface Heart {
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  sway: number;
  swayDuration: number;
  turn: number;
  scale: number;
}

/** Each heart its own place, size, colour and path; most from the middle of the screen. */
export function makeHearts(random: () => number = Math.random): Heart[] {
  return Array.from({ length: HEART_COUNT }, (_, i) => {
    const spread = (random() + random()) / 2; // gathers towards the middle
    return {
      left: 12 + spread * 76,
      size: 20 + Math.round(random() * 26),
      color: COLORS[Math.floor(random() * COLORS.length)],
      delay: Math.round((i / HEART_COUNT) * EMIT_OVER_MS + random() * 120),
      duration: Math.round(2600 + random() * (LONGEST_RISE_MS - 2600)),
      drift: Math.round((random() - 0.5) * 140),
      sway: 6 + Math.round(random() * 14),
      swayDuration: Math.round(700 + random() * 700),
      turn: Math.round((random() - 0.5) * 40),
      scale: Number((0.8 + random() * 0.5).toFixed(2)),
    };
  });
}

function HeartShape({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ filter: "drop-shadow(0 2px 4px rgb(225 29 72 / 0.35))" }}>
      <path d={HEART_PATH} fill={color} />
    </svg>
  );
}

/** One burst of hearts over the whole screen; never in the way of a tap. */
export function HeartsBurst({ onDone, random }: { onDone: () => void; random?: () => number }) {
  const reduced = useReducedMotion();
  const [hearts] = useState(() => makeHearts(random));

  useEffect(() => {
    const timer = setTimeout(onDone, reduced ? GLOW_MS : BURST_MS);
    return () => clearTimeout(timer);
  }, [onDone, reduced]);

  return (
    <div aria-hidden="true" data-testid="gift-hearts" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {reduced ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ animation: `gift-heart-glow ${GLOW_MS}ms ease-in-out both` }}>
          <HeartShape size={96} color={COLORS[0]} />
        </div>
      ) : (
        hearts.map((heart, i) => (
          <span
            key={i}
            data-heart
            className="absolute"
            style={
              {
                left: `${heart.left}%`,
                bottom: "4vh",
                "--drift": `${heart.drift}px`,
                "--turn": `${heart.turn}deg`,
                "--scale": heart.scale,
                animation: `gift-heart-rise ${heart.duration}ms cubic-bezier(0.22, 0.61, 0.36, 1) ${heart.delay}ms both`,
              } as React.CSSProperties
            }
          >
            <span
              className="block"
              style={{ "--sway": `${heart.sway}px`, animation: `gift-heart-sway ${heart.swayDuration}ms ease-in-out infinite alternate` } as React.CSSProperties}
            >
              <HeartShape size={heart.size} color={heart.color} />
            </span>
          </span>
        ))
      )}
    </div>
  );
}

/**
 * A gift for one person (owner's request, 2026-10-20): hearts float up
 * when they open the app, like Facebook's when the heart is held — the
 * first time on this device, then now and then (`hearts-schedule.ts`).
 * Coming back after half an hour away counts as opening it again. Who gets
 * them is decided on the server (`lib/account/server/gift.ts`).
 *
 * `?hearts` in the address shows them once to anyone signed in, without
 * counting: a preview for the owner.
 */
export function GiftHearts({ accountId, enabled }: { accountId: string; enabled: boolean }) {
  const [burst, setBurst] = useState(0);
  const finished = useCallback(() => setBurst(0), []);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).has("hearts");
    if (!enabled && !preview) return;

    function opened() {
      const now = Date.now();
      if (!shouldShowHearts(readHeartsShownAt(accountId), now, Math.random())) return;
      writeHeartsShownAt(accountId, now);
      setBurst((n) => n + 1);
    }

    const timer = setTimeout(() => (preview ? setBurst((n) => n + 1) : opened()), SHOW_AFTER_MS);
    if (!enabled) return () => clearTimeout(timer);

    let hiddenAt: number | null = null;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        const away = Date.now() - hiddenAt;
        hiddenAt = null;
        if (away >= AWAY_COUNTS_AS_OPENING_MS) opened();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [accountId, enabled]);

  return burst > 0 ? <HeartsBurst key={burst} onDone={finished} /> : null;
}
