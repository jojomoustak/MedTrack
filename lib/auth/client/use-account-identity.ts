"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
// Cleared with the cached profile on sign-out and account deletion (`clearCachedProfile`).
import { CACHED_ACCOUNT_IDENTITY_KEY } from "@/lib/auth/client/use-current-profile";

export interface AccountIdentity {
  name: string | null;
  email: string | null;
  /** The Google picture's address, when the account has one. */
  image: string | null;
}

const NONE: AccountIdentity = { name: null, email: null, image: null };

function readRaw(): string | null {
  try {
    return localStorage.getItem(CACHED_ACCOUNT_IDENTITY_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): AccountIdentity | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof AccountIdentity, unknown>>;
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    return { name: text(value.name), email: text(value.email), image: text(value.image) };
  } catch {
    return null;
  }
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * The signed-in person's name and email for Profile (owner-reported
 * 2026-10-21: both vanished offline — the session lookup is a server
 * round trip, and nothing was kept). Like `useFirstName`, the last ones
 * seen on this device stand in until the session answers, or for as long
 * as there's no connection.
 */
export function useAccountIdentity(): AccountIdentity {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const live = useMemo<AccountIdentity | null>(
    () => (user ? { name: user.name?.trim() || null, email: user.email || null, image: user.image || null } : null),
    [user],
  );
  const raw = useSyncExternalStore(subscribeToStorage, readRaw, () => null);
  const cached = useMemo(() => parse(raw), [raw]);

  useEffect(() => {
    if (!live) return;
    const next = JSON.stringify(live);
    if (next === raw) return;
    try {
      localStorage.setItem(CACHED_ACCOUNT_IDENTITY_KEY, next);
    } catch {
      // Storage unavailable: Profile just waits for the session.
    }
  }, [live, raw]);

  return live ?? cached ?? NONE;
}
