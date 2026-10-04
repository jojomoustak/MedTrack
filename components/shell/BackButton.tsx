"use client";

import { useRouter } from "next/navigation";

/**
 * Back arrow for screens reachable from more than one place (e.g. Privacy,
 * linked from Register and from Profile): returns to wherever the user
 * came from, or to `fallback` when there's no in-app history (a direct
 * link or a fresh tab).
 */
export function BackButton({ fallback, className = "" }: { fallback: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Πίσω"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={`flex size-11 items-center justify-center rounded-full text-stone-800 dark:text-stone-200 ${className}`}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5 8 12l7 7" />
      </svg>
    </button>
  );
}
