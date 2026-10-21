"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MedicationPhotoAttach } from "@/components/medications/MedicationPhotoAttach";
import { CameraViewfinder } from "@/components/medications/CameraViewfinder";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";
import { useReturnTo } from "@/lib/navigation/client/use-return-to";
import { playSound } from "@/lib/sound/client/play-sound";
import { usePathId } from "@/lib/navigation/client/use-path-id";
import { useCameraSystemBars } from "@/lib/platform/system-bars";
import { useT, T } from "@/lib/i18n/client";

/**
 * A medication's photo (reference mockup, screen 13): a full-screen camera
 * in the native scanner screens' style (2026-10-15): the camera dimmed
 * around a clear frame, an X and the title at the top (the X is also how
 * a new medication's optional photo step ends: it goes on to Today), gallery / shutter /
 * torch along the bottom, the phone's bars black while it's open. The
 * viewfinder IS the camera (2026-10-09; it used to hand off to the phone's
 * camera app, a second camera screen), falling back to the phone's camera
 * only where the page can't use one. The photo is optional.
 * Reached two ways:
 *   1. Right after "Add Medication" finishes (`?new=1`) — optional, the
 *      medication is already fully saved; leaving goes on to Today.
 *   2. From the medication's detail screen, to take, replace or remove it.
 */
function PhotoScreen() {
  const t = useT();
  const session = useCurrentProfile();
  const router = useRouter();
  const returnTo = useReturnTo();
  const params = { id: usePathId(2) };
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  useCameraSystemBars();

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [session.status, router]);

  function leave() {
    playSound("button");
    // Phase 3 §3 Journey 1 ends onboarding on Today ("first dose now visible").
    if (isNew) router.push("/today");
    else returnTo(`/medications/${params.id}`);
  }

  const top = (
    <>
      <OfflineBanner />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-2">
        <button
          type="button"
          onClick={leave}
          aria-label={t("Κλείσιμο")}
          className="flex size-12 items-center justify-center justify-self-start rounded-full bg-black/35 active:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <h1 className="text-[17px] font-semibold"><T>Φωτογραφία φαρμάκου</T></h1>
        <span aria-hidden="true" />
      </div>
    </>
  );

  if (session.status !== "ready") {
    // The frame waits, its corners already in place, while the session loads.
    return (
      <main>
        <CameraViewfinder top={top}>
          <span role="status" className="block size-full bg-white/5 motion-safe:animate-pulse">
            <span className="sr-only"><T>Φόρτωση…</T></span>
          </span>
        </CameraViewfinder>
      </main>
    );
  }

  return (
    <main>
      <MedicationPhotoAttach
        userMedicationId={params.id}
        top={top}
        intro={isNew ? t("Το φάρμακο προστέθηκε. Αν θέλετε, φωτογραφίστε τη συσκευασία του.") : undefined}
      />
    </main>
  );
}

/** `useSearchParams` (the `?new=1` flag) needs a Suspense boundary in a prebuilt page; the fallback is the same black backdrop, so nothing flashes. */
export default function MedicationPhotoPage() {
  return (
    <Suspense fallback={<main className="h-dvh bg-black" />}>
      <PhotoScreen />
    </Suspense>
  );
}
