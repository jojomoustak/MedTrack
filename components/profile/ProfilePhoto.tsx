"use client";

import { useRef, useState } from "react";
import { useProfilePhoto } from "@/lib/account/client/profile-photo";
import { playSound } from "@/lib/sound/client/play-sound";

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.4-2h6.2l1.4 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/**
 * The avatar at the top of Profile, with the person's own photo if they
 * add one (owner's request, 2026-10-20) — optional, never asked for.
 * Without one it's their Google picture or their initial, as before. The
 * camera badge says it can be changed; with a photo set, tapping offers
 * «Αλλαγή» or «Αφαίρεση», since a second tap shouldn't replace it by surprise.
 */
export function ProfilePhoto({ profileId, fallbackImage, initial }: { profileId: string | null; fallbackImage: string | null; initial: string }) {
  const { src, busy, error, upload, remove } = useProfilePhoto(profileId);
  const input = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(false);
  const shown = src ?? fallbackImage;

  function pick() {
    setChoosing(false);
    input.current?.click();
  }

  return (
    <div className="mb-2 flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={busy || !profileId}
        aria-busy={busy}
        aria-expanded={src ? choosing : undefined}
        aria-label={src ? "Φωτογραφία προφίλ: αλλαγή ή αφαίρεση" : "Προσθήκη φωτογραφίας προφίλ"}
        onClick={() => {
          playSound("button");
          if (src) setChoosing((c) => !c);
          else pick();
        }}
        className="relative size-24 rounded-full transition-transform active:scale-95"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL kept on the phone, or the account's Google photo; nothing to optimize
          <img src={shown} alt="" referrerPolicy="no-referrer" className="size-24 rounded-full object-cover shadow-[0_2px_10px_rgba(28,25,23,.12)]" />
        ) : (
          <span aria-hidden="true" className="flex size-24 items-center justify-center rounded-full bg-accent-100 text-4xl font-bold text-accent-800">
            {initial}
          </span>
        )}
        {busy && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-full bg-stone-900/35">
            <span className="size-8 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
          </span>
        )}
        <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 flex size-9 items-center justify-center rounded-full bg-accent-700 text-white ring-4 ring-background">
          <CameraIcon />
        </span>
      </button>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {choosing && src && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              playSound("button");
              pick();
            }}
            className="min-h-11 rounded-xl bg-accent-700 px-4 text-[15px] font-semibold text-white active:scale-95"
          >
            Αλλαγή φωτογραφίας
          </button>
          <button
            type="button"
            onClick={() => {
              playSound("button");
              setChoosing(false);
              void remove();
            }}
            className="min-h-11 rounded-xl bg-surface-muted px-4 text-[15px] font-semibold text-stone-700 active:scale-95"
          >
            Αφαίρεση
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="max-w-xs text-[15px] leading-snug text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
