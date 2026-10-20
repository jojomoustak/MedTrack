"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound/client/play-sound";

const ROW_PX = 48;
/** Rows above and below the chosen one: five visible in all. */
const PAD_ROWS = 2;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/**
 * One scroll wheel (hours or minutes), like the iPhone's time picker: flick
 * to a number and it settles in the middle band. Also a spin button, so the
 * arrow keys and screen readers (swipe up/down) change it one step at a
 * time; tapping a number picks it.
 */
function Wheel({ values, selected, onSelect, label }: { values: number[]; selected: number; onSelect: (value: number) => void; label: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, values.indexOf(selected));

  // Brought to the chosen number when it changes from outside the wheel (opening, keys, a tap).
  useEffect(() => {
    const el = scroller.current;
    if (!el || Math.round(el.scrollTop / ROW_PX) === index) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: index * ROW_PX, behavior: el.scrollTop === 0 && index > 0 ? "auto" : "smooth" });
    else el.scrollTop = index * ROW_PX;
  }, [index]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  function onScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const el = scroller.current;
      if (!el) return;
      const settled = values[Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ROW_PX)))];
      if (settled !== selected) onSelect(settled);
    }, 90);
  }

  function step(delta: number) {
    onSelect(values[(index + delta + values.length) % values.length]);
  }

  return (
    <div
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={values[0]}
      aria-valuemax={values[values.length - 1]}
      aria-valuenow={selected}
      aria-valuetext={pad(selected)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          step(-1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          step(1);
        }
      }}
      className="relative w-20 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent-600/40"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-xl bg-accent-50" style={{ top: PAD_ROWS * ROW_PX, height: ROW_PX }} />
      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative snap-y snap-mandatory overflow-y-scroll overscroll-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
        style={{
          height: ROW_PX * (PAD_ROWS * 2 + 1),
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        }}
      >
        <div aria-hidden="true" style={{ height: PAD_ROWS * ROW_PX }} />
        {values.map((value) => (
          <div
            key={value}
            aria-hidden="true"
            onClick={() => {
              playSound("button");
              onSelect(value);
            }}
            className={`flex snap-center items-center justify-center text-[26px] tabular-nums transition-colors duration-150 ${
              value === selected ? "font-bold text-accent-800" : "font-medium text-stone-500"
            }`}
            style={{ height: ROW_PX }}
          >
            {pad(value)}
          </div>
        ))}
        <div aria-hidden="true" style={{ height: PAD_ROWS * ROW_PX }} />
      </div>
    </div>
  );
}

/**
 * A dose time (owner-reported 2026-10-20: «the clock needs redesigning» —
 * it was the phone's own clock dialog). Shown as the time itself, large;
 * tapping it opens two wheels underneath, hours and minutes, any minute
 * included (18:57 is a real dose time here), in the app's own look instead
 * of a separate dialog. `value` and `onChange` speak "HH:MM", "" for none.
 */
export function TimeField({
  value,
  onChange,
  label,
  suggestion = "08:00",
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Names the time for screen readers and on the wheels ("Ώρα δόσης 1"). */
  label: string;
  /** Where the wheels start when no time is set yet. */
  suggestion?: string;
  /** Beside the time, e.g. a remove button. */
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = parse(value);

  function set(hour: number, minute: number) {
    onChange(`${pad(hour)}:${pad(minute)}`);
  }

  function toggle() {
    playSound("button");
    if (!open && !current) {
      const start = parse(suggestion) ?? { hour: 8, minute: 0 };
      set(start.hour, start.minute);
    }
    setOpen((o) => !o);
  }

  const shown = current ?? parse(suggestion) ?? { hour: 8, minute: 0 };

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${label}: ${current ? value : "χωρίς ώρα"}`}
          className="flex min-h-16 flex-1 items-center gap-3 px-4 text-left"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-accent-700">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          <span className={`text-[26px] font-bold tabular-nums tracking-tight ${current ? "text-stone-900" : "text-stone-400"}`}>{current ? value : "--:--"}</span>
          <span className="ml-auto text-[15px] font-semibold text-accent-700">{open ? "" : current ? "Αλλαγή" : "Επιλέξτε ώρα"}</span>
        </button>
        {trailing}
      </div>
      {open && (
        <div className="flex flex-col items-center gap-3 border-t border-stone-100 px-4 pt-3 pb-4">
          <div className="flex items-center gap-2">
            <Wheel values={HOURS} selected={shown.hour} onSelect={(hour) => set(hour, shown.minute)} label={`${label}, ώρα`} />
            <span aria-hidden="true" className="pb-1 text-[26px] font-bold text-stone-400">
              :
            </span>
            <Wheel values={MINUTES} selected={shown.minute} onSelect={(minute) => set(shown.hour, minute)} label={`${label}, λεπτά`} />
          </div>
          <button
            type="button"
            onClick={() => {
              playSound("button");
              setOpen(false);
            }}
            className="min-h-12 w-full rounded-xl bg-accent-700 text-[17px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            Έτοιμο
          </button>
        </div>
      )}
    </div>
  );
}
