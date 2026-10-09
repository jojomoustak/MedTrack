"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MedicationPhotoAttach } from "@/components/medications/MedicationPhotoAttach";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";
import { useReturnTo } from "@/lib/navigation/client/use-return-to";
import { playSound } from "@/lib/sound/client/play-sound";
import { usePathId } from "@/lib/navigation/client/use-path-id";

/**
 * A medication's photo (reference mockup, screen 13): a dark camera screen
 * — the live camera, the photo, or a framed placeholder, then cancel /
 * shutter / gallery. The viewfinder IS the camera (2026-10-09; it used to
 * hand off to the phone's camera app, a second camera screen), falling
 * back to the phone's camera only where the page can't use one. The photo
 * is optional.
 * Reached two ways:
 *   1. Right after "Add Medication" finishes (`?new=1`) — optional, the
 *      medication is already fully saved; leaving goes on to Today.
 *   2. From the medication's detail screen, to take, replace or remove it.
 */
function PhotoScreen() {
  const session = useCurrentProfile();
  const router = useRouter();
  const returnTo = useReturnTo();
  const params = { id: usePathId(2) };
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [session.status, router]);

  function leave() {
    playSound("button");
    // Phase 3 §3 Journey 1 ends onboarding on Today ("first dose now visible").
    if (isNew) router.push("/today");
    else returnTo(`/medications/${params.id}`);
  }

  const leaveButton = (
    <button type="button" onClick={leave} className="min-h-12 px-2 text-[17px] font-semibold text-white">
      {isNew ? "Ολοκλήρωση" : "Κλείσιμο"}
    </button>
  );

  return (
    <main className="flex min-h-dvh flex-col bg-black text-white">
      <OfflineBanner />
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-2 pt-2">
        <button type="button" onClick={leave} aria-label="Κλείσιμο" className="flex size-12 items-center justify-center rounded-full active:bg-white/10">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <h1 className="text-[17px] font-semibold">Φωτογραφία φαρμάκου</h1>
        <span className="size-12" aria-hidden="true" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-3 pb-8">
        {isNew && (
          <p className="text-center text-[15px] text-stone-300">
            Το φάρμακο προστέθηκε. Μπορείτε προαιρετικά να προσθέσετε μια φωτογραφία της συσκευασίας — ή να το παραλείψετε.
          </p>
        )}

        {session.status === "loading" && (
          <p role="status" className="text-[15px] text-stone-300">
            Φόρτωση…
          </p>
        )}

        {session.status === "ready" && <MedicationPhotoAttach userMedicationId={params.id} leading={leaveButton} className="flex-1 justify-between" />}
      </div>
    </main>
  );
}

/** `useSearchParams` (the `?new=1` flag) needs a Suspense boundary in a prebuilt page; the fallback is the same dark backdrop, so nothing flashes. */
export default function MedicationPhotoPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-black" />}>
      <PhotoScreen />
    </Suspense>
  );
}
