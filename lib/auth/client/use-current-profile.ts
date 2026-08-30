"use client";

import { useEffect, useState } from "react";

export type CurrentProfileState =
  | { status: "loading" }
  | { status: "ready"; profileId: string; accountId: string }
  | { status: "signed-out" };

const CACHED_PROFILE_KEY = "medtrack:last-known-profile";

type CachedProfile = { profileId: string; accountId: string };

/**
 * NOT a security/authorization boundary -- the server independently
 * re-validates the real session and profile ownership on every sync call
 * regardless of what this hook believes (CLAUDE.md rule 7), so this value
 * can never grant access to another profile's server-side data. It DOES,
 * however, scope which profile's already-synced local data (IndexedDB
 * medications/doses/outbox) renders in the UI while offline -- so unlike
 * a pure routing decision, a stale value here can show a *different*
 * (now-signed-out or deleted) local user's cached health data to whoever
 * is holding the device next. That's why `clearCachedProfile` is exported
 * and must be called explicitly on sign-out and account deletion
 * (`app/(app)/profile/page.tsx`, `components/account/DeleteAccountFlow.tsx`)
 * rather than left to self-correct whenever the next `/api/me` call
 * happens to reach the network and get a 401 -- on a flaky connection
 * right after sign-out, that round trip may not happen for a while.
 * Security review, 2026-08-29.
 */
function readCachedProfile(): CachedProfile | null {
  try {
    const raw = localStorage.getItem(CACHED_PROFILE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as CachedProfile).profileId === "string" &&
      typeof (parsed as CachedProfile).accountId === "string"
    ) {
      return parsed as CachedProfile;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: CachedProfile): void {
  try {
    localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable (private mode, quota) -- offline session
    // continuity degrades gracefully to always requiring network.
  }
}

/**
 * Plain, non-React read of the currently cached profile id — for
 * background/module-scope code (`lib/sync/client/sync-manager.ts`'s
 * schedule top-up/missed-dose sweep) that needs "which profile's local
 * data am I operating on" outside a component tree. Same non-security-
 * boundary caveat as the rest of this file: only ever used to scope
 * which LOCAL rows a query touches, never to grant server-side access.
 */
export function getCachedProfileId(): string | null {
  return readCachedProfile()?.profileId ?? null;
}

export function clearCachedProfile(): void {
  try {
    localStorage.removeItem(CACHED_PROFILE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

/**
 * The one place client components learn their own `profileId`/`accountId`
 * (`GET /api/me`, Phase 6) — reused for both the "is there a session at
 * all" guard (the app shell layout) and for the profile-scoped local
 * writes/reads that need `profileId` specifically (Better Auth's own
 * session object only carries `accountId`/`user.id`, not `profileId` —
 * that's a MedTracking-specific concept Better Auth doesn't know about).
 *
 * Only an explicit 401/403 from `/api/me` counts as "signed out". Found
 * via live-device testing (2026-08-29): `/api/*` is deliberately
 * `NetworkOnly` in the service worker (app/sw.ts — auth must never be
 * served stale), so going offline made every `/api/me` call reject with a
 * plain network error, and the old code treated ANY rejection as
 * "signed-out" — bouncing an already-logged-in, offline user to the login
 * screen, which itself needs a network connection to do anything. A
 * network error (or a non-auth server error) now falls back to the last
 * profile that successfully authenticated on this device, if any, instead
 * of forcing a logout the user never asked for.
 */
export function useCurrentProfile(): CurrentProfileState {
  const [state, setState] = useState<CurrentProfileState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const cachedProfile = readCachedProfile();

    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          const data: CachedProfile = await res.json();
          return { kind: "ready", data } as const;
        }
        if (res.status === 401 || res.status === 403) {
          return { kind: "unauthenticated" } as const;
        }
        return { kind: "unreachable" } as const;
      })
      .catch(() => ({ kind: "unreachable" }) as const)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "ready") {
          writeCachedProfile(result.data);
          setState({ status: "ready", profileId: result.data.profileId, accountId: result.data.accountId });
        } else if (result.kind === "unauthenticated") {
          clearCachedProfile();
          setState({ status: "signed-out" });
        } else if (cachedProfile) {
          setState({ status: "ready", profileId: cachedProfile.profileId, accountId: cachedProfile.accountId });
        } else {
          setState({ status: "signed-out" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
