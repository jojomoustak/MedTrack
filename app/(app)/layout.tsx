"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";
import { onSessionExpired } from "@/lib/auth/client/session-expired-signal";
import { notifySessionRestored } from "@/lib/auth/client/session-restored-signal";
import { CurrentProfileProvider } from "@/components/shell/CurrentProfileContext";
import { AppBar } from "@/components/shell/AppBar";
import { BottomNav } from "@/components/shell/BottomNav";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { RouteSkeleton } from "@/components/shell/ScreenSkeletons";
import { preloadPhotoThumbnails } from "@/lib/medications/client/use-medication-photo-thumbnail";
import { catchUpWithServer } from "@/lib/sync/client/catch-up";

/**
 * The authenticated app shell (Phase 3 §1): app bar + tab content +
 * persistent bottom nav. Unauthenticated visits to any tab go to Welcome
 * (which leads to both sign-in and sign-up), the same as the root page:
 * the Android app opens straight on /today since 2026-10-14 — the root
 * page's "Φόρτωση…" step after the native loading screen was redundant —
 * so a first launch must still reach Welcome from here.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const session = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/welcome");
  }, [session.status, router]);

  // `lib/sync/client/api.ts`'s `reportIfUnauthenticated` fires this the
  // moment any sync call gets a real 401/403 back — a session that expired
  // WHILE the app stayed open, which the effect above (mount-time only)
  // can't catch since `session.status` itself doesn't change on its own
  // (`use-current-profile.ts` never re-fetches after its initial check).
  useEffect(() => onSessionExpired(() => router.replace("/login?reason=session_expired")), [router]);

  // `SyncManagerBootstrap` lives in the root layout and never remounts on
  // client-side navigation, so its own initial `drainNow()` can't catch a
  // fresh sign-in that happens later in the same app session — this fires
  // every time the authenticated shell newly resolves a valid session
  // (including right after login), so `sync-manager.ts` gets a chance to
  // retry any outbox entries a previously-expired session left `failed`.
  useEffect(() => {
    if (session.status === "ready") notifySessionRestored();
  }, [session.status]);

  // Medicine photos in memory before the first screen's rows are drawn, so
  // they appear with the row instead of swapping in a moment later.
  useEffect(() => {
    if (session.status === "ready") void preloadPhotoThumbnails();
  }, [session.status]);

  // What changed on the server, whatever screen is open: on sign-in, at
  // launch and on every return to the foreground (at most once a minute,
  // `lib/sync/client/catch-up.ts`). Only the medicines screens used to ask,
  // so Lists opened first stayed empty on a new phone (2026-10-19).
  const signedInProfileId = session.status === "ready" ? session.profileId : null;
  useEffect(() => {
    if (!signedInProfileId) return;
    void catchUpWithServer(signedInProfileId);
    function onVisible() {
      if (document.visibilityState === "visible") void catchUpWithServer(signedInProfileId!);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedInProfileId]);

  if (session.status === "signed-out") {
    // Redirect is in flight (see effect above) — render nothing rather
    // than a flash of protected UI.
    return null;
  }

  // The app frame (bar + tabs) is drawn even while the session is still
  // being confirmed, so it's already in the prebuilt page: a launch shows
  // the app at first paint instead of a blank "Φόρτωση…" screen until the
  // scripts start (2026-10-09). Neither part shows any user data. The
  // offline banner waits for the app itself — it reads the device's
  // connection, which the prebuilt page can't know.
  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar />
      {session.status === "ready" && <OfflineBanner />}
      <div className="flex-1 pb-20">
        {session.status === "ready" ? (
          <CurrentProfileProvider profileId={session.profileId} accountId={session.accountId}>
            {children}
          </CurrentProfileProvider>
        ) : (
          <RouteSkeleton />
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0">
        <BottomNav />
      </div>
    </div>
  );
}
