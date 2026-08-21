"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";
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
    <CurrentProfileProvider profileId={session.profileId}>
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
