"use client";

import { useEffect, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
// Cleared with the cached profile on sign-out and account deletion (`clearCachedProfile`).
import { CACHED_FIRST_NAME_KEY } from "@/lib/auth/client/use-current-profile";

function readCachedFirstName(): string | null {
  try {
    return localStorage.getItem(CACHED_FIRST_NAME_KEY);
  } catch {
    return null;
  }
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * The signed-in user's first name, for Today's greeting. The session
 * lookup is a server round trip, so the greeting used to appear without a
 * name and gain it a moment later on every visit (2026-10-09); the last
 * name seen on this device stands in until the session answers.
 */
export function useFirstName(): string | null {
  const { data: session } = authClient.useSession();
  const live = session?.user?.name?.trim().split(/\s+/)[0] || null;
  const cached = useSyncExternalStore(subscribeToStorage, readCachedFirstName, () => null);

  useEffect(() => {
    if (!live || live === cached) return;
    try {
      localStorage.setItem(CACHED_FIRST_NAME_KEY, live);
    } catch {
      // Storage unavailable — the greeting just waits for the session.
    }
  }, [live, cached]);

  return live ?? cached;
}
