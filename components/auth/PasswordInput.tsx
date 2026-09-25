"use client";

import { useState } from "react";
import { playSound } from "@/lib/sound/client/play-sound";

/**
 * Shared by Login/Register/Reset — a "show password" toggle (UX feedback,
 * 2026-09-24), same field otherwise. Toggling never clears or resets the
 * typed value; it only flips the native input `type`.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  ariaLabel: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="min-h-12 w-full rounded-lg border border-stone-300 px-3 py-2 pr-12 dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="button"
          onClick={() => {
            playSound("button");
            setVisible((v) => !v);
          }}
          aria-label={visible ? "Απόκρυψη κωδικού πρόσβασης" : "Εμφάνιση κωδικού πρόσβασης"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-stone-500 dark:text-stone-400"
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    </label>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 2.5l15 15" strokeLinecap="round" />
      <path d="M8.3 4.6C8.85 4.5 9.42 4.4 10 4.4c5.5 0 8.5 6 8.5 6-.55 1.1-1.5 2.5-2.85 3.65M5.6 5.95C3.55 7.15 2 9.4 1.5 10.4c0 0 1.05 2.35 3.35 4.05 1.38 1 3.1 1.7 5.15 1.7.9 0 1.72-.13 2.47-.36" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.9 8.65a2.5 2.5 0 0 0 3.4 3.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
