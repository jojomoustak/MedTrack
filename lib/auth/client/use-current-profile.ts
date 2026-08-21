"use client";

import { useEffect, useState } from "react";

export type CurrentProfileState =
  | { status: "loading" }
  | { status: "ready"; profileId: string; accountId: string }
  | { status: "signed-out" };

/**
 * The one place client components learn their own `profileId`/`accountId`
 * (`GET /api/me`, Phase 6) — reused for both the "is there a session at
 * all" guard (the app shell layout) and for the profile-scoped local
 * writes/reads that need `profileId` specifically (Better Auth's own
 * session object only carries `accountId`/`user.id`, not `profileId` —
 * that's a MedTracking-specific concept Better Auth doesn't know about).
 */
export function useCurrentProfile(): CurrentProfileState {
  const [state, setState] = useState<CurrentProfileState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { profileId: string; accountId: string }) => {
        if (!cancelled) setState({ status: "ready", profileId: data.profileId, accountId: data.accountId });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signed-out" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
