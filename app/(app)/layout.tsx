"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";
import { onSessionExpired } from "@/lib/auth/client/session-expired-signal";
import { CurrentProfileProvider } from "@/components/shell/CurrentProfileContext";
import { AppBar } from "@/components/shell/AppBar";
import { BottomNav } from "@/components/shell/BottomNav";
import { AddMedicationFab } from "@/components/shell/AddMedicationFab";
import { OfflineBanner } from "@/components/sync/OfflineBanner";

/**
 * The authenticated app shell (Phase 3 §1): app bar + tab content +
 * persistent bottom nav + FAB. Unauthenticated visits to any tab redirect
 * to Login (no login/register UI existed before this task).
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const session = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [session.status, router]);

  // `lib/sync/client/api.ts`'s `reportIfUnauthenticated` fires this the
  // moment any sync call gets a real 401/403 back — a session that expired
  // WHILE the app stayed open, which the effect above (mount-time only)
  // can't catch since `session.status` itself doesn't change on its own
  // (`use-current-profile.ts` never re-fetches after its initial check).
  useEffect(() => onSessionExpired(() => router.replace("/login?reason=session_expired")), [router]);

  if (session.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      </main>
    );
  }

  if (session.status === "signed-out") {
    // Redirect is in flight (see effect above) — render nothing rather
    // than a flash of protected UI.
    return null;
  }

  return (
    <CurrentProfileProvider profileId={session.profileId} accountId={session.accountId}>
      <div className="flex min-h-screen flex-col">
        <AppBar />
        <OfflineBanner />
        <div className="flex-1 pb-20">{children}</div>
        <AddMedicationFab />
        <div className="fixed inset-x-0 bottom-0">
          <BottomNav />
        </div>
      </div>
    </CurrentProfileProvider>
  );
}
