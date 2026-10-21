"use client";

import { useId } from "react";
import { setLanguage, useLanguage } from "@/lib/i18n/client";
import { playSound } from "@/lib/sound/client/play-sound";

/** Greece's flag: nine blue and white stripes, the white cross on blue in the corner. */
function GreekFlag() {
  return (
    <svg viewBox="0 0 27 18" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className="size-full">
      <rect width="27" height="18" fill="#0D5EAF" />
      {[2, 6, 10, 14].map((y) => (
        <rect key={y} y={y} width="27" height="2" fill="#FFFFFF" />
      ))}
      <rect width="10" height="10" fill="#0D5EAF" />
      <rect x="4" width="2" height="10" fill="#FFFFFF" />
      <rect y="4" width="10" height="2" fill="#FFFFFF" />
    </svg>
  );
}

/** The Union flag, for English. */
function UnionFlag() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className="size-full">
      <defs>
        <clipPath id={`${id}t`}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
      </defs>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath={`url(#${id}t)`} />
      <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

/**
 * Top right (owner's request, 2026-10-21): the flag of the language the
 * app is in; a tap switches to the other. Its label is in the language it
 * switches to, so someone who reads only that one can find it.
 */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const language = useLanguage();
  const next = language === "el" ? "en" : "el";
  return (
    <button
      type="button"
      onClick={() => {
        playSound("button");
        setLanguage(next);
      }}
      aria-label={next === "en" ? "Switch to English" : "Αλλαγή σε Ελληνικά"}
      lang={next}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${className}`}
    >
      <span className="block size-7 overflow-hidden rounded-full shadow-[0_1px_3px_rgb(28_25_23/0.18)] ring-1 ring-stone-900/10">
        {language === "el" ? <GreekFlag /> : <UnionFlag />}
      </span>
    </button>
  );
}
