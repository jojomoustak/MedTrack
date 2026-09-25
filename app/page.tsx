"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";

/** Splash (Phase 3 §2.1): session check, routes to Welcome or Today. */
export default function RootPage() {
  const session = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "ready") router.replace("/today");
    else if (session.status === "signed-out") router.replace("/welcome");
  }, [session.status, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-50 dark:bg-stone-950">
      <h1 className="text-2xl font-semibold">MedTracking</h1>
      <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
        Φόρτωση…
      </p>
    </main>
  );
}
