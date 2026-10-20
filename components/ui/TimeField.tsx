"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playSound } from "@/lib/sound/client/play-sound";

const ROW_PX = 48;
/** Rows above and below the chosen one: five visible in all. */
const PAD_ROWS = 2;
/** The numbers repeat this many times so the wheel turns past 59 to 00; it starts on the middle run. */
const RUNS = 7;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const pad = (n: number) => String(n).padStart(2, "0");
const mod = (n: number, m: number) => ((n % m) + m) % m;

function parse(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

type DayPart = "morning" | "noon" | "afternoon" | "evening" | "night";

/** The part of the day a time falls in, the way it's said in Greek. */
function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 16) return "noon";
  if (hour >= 16 && hour < 20) return "afternoon";
  if (hour >= 20) return "evening";
  return "night";
}

const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: "Πρωί",
  noon: "Μεσημέρι",
  afternoon: "Απόγευμα",
  evening: "Βράδυ",
  night: "Νύχτα",
};

/** Sunrise, sun, sunset, moon: the time's part of the day at a glance; a plain clock while none is set. */
function DayPartIcon({ part }: { part: DayPart | null }) {
  const common = { viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": true, focusable: false, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (part) {
    case "morning":
      return (
        <svg {...common}>
          <path d="M7.5 16.5a4.5 4.5 0 0 1 9 0M3 16.5h18M12 3.5v3M9.8 5.4 12 3.5l2.2 1.9M5.4 10.9l1.4 1.1M18.6 10.9l-1.4 1.1M6 20h12" />
        </svg>
      );
    case "noon":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      );
    case "afternoon":
      return (
        <svg {...common}>
          <path d="M7.5 16.5a4.5 4.5 0 0 1 9 0M3 16.5h18M12 3.5v3M9.8 4.6 12 6.5l2.2-1.9M5.4 10.9l1.4 1.1M18.6 10.9l-1.4 1.1M6 20h12" />
        </svg>
      );
    case "evening":
    case "night":
      return (
        <svg {...common}>
          <path d="M19.5 14.2A7.5 7.5 0 1 1 9.8 4.5a6 6 0 0 0 9.7 9.7Z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
  }
}

/**
 * One scroll wheel (hours or minutes), like the iPhone's time picker: flick
 * to a number and it settles in the middle band, and it turns on past the
 * end (59 → 00) instead of stopping. Also a spin button, so the arrow keys
 * and screen readers (swipe up/down) change it one step at a time; tapping
 * a number picks it.
 */
function Wheel({ values, selected, onSelect, label }: { values: number[]; selected: number; onSelect: (value: number) => void; label: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const length = values.length;
  const home = Math.floor(RUNS / 2) * length;
  const index = Math.max(0, values.indexOf(selected));
  const rows = useMemo(() => Array.from({ length: length * RUNS }, (_, i) => values[i % length]), [values, length]);

  // Brought to the chosen number when it changes from outside the wheel
  // (opening, keys, a tap): to the nearest row showing it, so 59 → 00 turns
  // one step on rather than spinning back through every number.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const row = Math.round(el.scrollTop / ROW_PX);
    if (el.scrollTop === 0) {
      el.scrollTop = (home + index) * ROW_PX;
      return;
    }
    if (mod(row, length) === index) return;
    const base = row - mod(row, length);
    const target = [base - length + index, base + index, base + length + index].reduce((best, r) => (Math.abs(r - row) < Math.abs(best - row) ? r : best));
    if (typeof el.scrollTo === "function") el.scrollTo({ top: target * ROW_PX, behavior: "smooth" });
    else el.scrollTop = target * ROW_PX;
  }, [index, home, length]);

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
      const row = Math.round(el.scrollTop / ROW_PX);
      const at = mod(row, length);
      // Back onto the middle run without a visible change (the same numbers), so the wheel never runs out.
      if (row !== home + at) el.scrollTop = (home + at) * ROW_PX;
      if (values[at] !== selected) onSelect(values[at]);
    }, 120);
  }

  function step(delta: number) {
    onSelect(values[mod(index + delta, length)]);
  }

  return (
    <div
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={values[0]}
      aria-valuemax={values[length - 1]}
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
      <div
        ref={scroller}
        onScroll={onScroll}
        className="snap-y snap-mandatory overflow-y-scroll overscroll-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
        style={{
          height: ROW_PX * (PAD_ROWS * 2 + 1),
          maskImage: "linear-gradient(to bottom, transparent, black 32%, black 68%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 32%, black 68%, transparent)",
        }}
      >
        <div aria-hidden="true" style={{ height: PAD_ROWS * ROW_PX }} />
        {rows.map((value, i) => (
          <div
            key={i}
            aria-hidden="true"
            onClick={() => {
              playSound("button");
              onSelect(value);
            }}
            className={`flex snap-center items-center justify-center tabular-nums transition-colors duration-150 ${
              value === selected ? "text-[28px] font-bold text-accent-800" : "text-[24px] font-medium text-stone-500"
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
 * it was the phone's own clock dialog — and then «could be better»). A row
 * with the time large and its part of the day («Πρωί», «Βράδυ»); tapping
 * it opens two wheels underneath, hours and minutes, any minute included
 * (18:57 is a real dose time here), sharing one band across the middle like
 * a clock face's window. `value` and `onChange` speak "HH:MM", "" for none.
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
  const part = current ? dayPart(current.hour) : null;

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${label}: ${current ? value : "χωρίς ώρα"}`}
          className="flex min-h-18 flex-1 items-center gap-3.5 px-4 text-left"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <DayPartIcon part={part} />
          </span>
          {current ? (
            <span className="flex items-baseline gap-2.5">
              <span className="text-[28px] font-bold leading-none tracking-tight text-stone-900 tabular-nums">{value}</span>
              {part && <span className="text-[15px] font-medium text-stone-500">{DAY_PART_LABEL[part]}</span>}
            </span>
          ) : (
            <span className="text-[18px] font-semibold text-accent-700">Επιλέξτε ώρα</span>
          )}
          {current && !open && <span className="ml-auto text-[15px] font-semibold text-accent-700">Αλλαγή</span>}
        </button>
        {trailing}
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-stone-100 px-4 pt-3 pb-4">
          <div className="relative flex items-center justify-center gap-3">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-xl bg-accent-50" style={{ top: PAD_ROWS * ROW_PX, height: ROW_PX }} />
            <Wheel values={HOURS} selected={shown.hour} onSelect={(hour) => set(hour, shown.minute)} label={`${label}, ώρα`} />
            <span aria-hidden="true" className="relative pb-1 text-[28px] font-bold text-accent-800">
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
