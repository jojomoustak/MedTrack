"use client";

import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "@/components/shell/BrandMark";
import { backTarget } from "@/lib/navigation/back-target";
import { getPreviousPathname } from "@/lib/navigation/client/previous-path";
import { playSound } from "@/lib/sound/client/play-sound";

/**
 * The top bar every signed-in screen shares (reference mockup): a back
 * chevron on inner screens, the centered MedTrack wordmark, and an optional
 * trailing slot (the sync indicator, in `AppBar`). Where back goes is
 * decided per route by `backTarget`.
 */
export function ScreenHeader({ trailing }: { trailing?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const target = backTarget(pathname);

  function goBack() {
    playSound("button");
    if (target.kind === "parent") {
      // Pop history when the screen above is literally the previous one, so
      // the device back button and this chevron agree; otherwise go up.
      if (getPreviousPathname() === target.href) router.back();
      else router.push(target.href);
    } else if (target.kind === "history") {
      if (window.history.length > 1) router.back();
      else router.push(target.fallback);
    }
  }

  return (
    <header className="relative flex min-h-14 items-center justify-center bg-background px-14">
      {target.kind !== "none" && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Πίσω"
          className="absolute left-2 flex size-11 items-center justify-center rounded-full text-stone-800 active:bg-stone-200/60 dark:text-stone-200 dark:active:bg-stone-800"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
      )}
      <span className="inline-flex items-center gap-1.5 text-[21px] font-bold tracking-tight text-accent-700 dark:text-accent-400">
        <BrandMark size={25} />
        MedTrack
      </span>
      {trailing && <div className="absolute right-3">{trailing}</div>}
    </header>
  );
}
