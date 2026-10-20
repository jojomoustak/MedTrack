"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { ForgotPasswordIllustration } from "@/components/auth/AuthIllustrations";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { Button } from "@/components/ui/Button";

type Message = "pending" | "sign-in-elsewhere" | "offline";

/**
 * After sign-up (owner's call, 2026-10-20: an account needs its email
 * confirmed first — `lib/auth/config.ts`). The link opens in the phone's
 * browser, not the app, so this screen signs in by itself when the person
 * comes back to it, with the email and password they just typed (held in
 * memory only, gone when they leave this screen); «Συνέχεια» does the same
 * on demand.
 *
 * Shown the same for an email that already had an account (the server
 * answers that sign-up like a new one and emails the owner instead), where
 * the password typed here is most likely not that account's: a refused
 * password stops the automatic tries, since each one counts toward that
 * account's lockout (`lib/auth/lockout.ts`).
 */
export function CheckEmailPanel({ email, password, onChangeEmail }: { email: string; password: string; onChangeEmail: () => void }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const inFlight = useRef(false);
  const autoTries = useRef(true);

  const trySignIn = useCallback(
    async (onDemand: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (onDemand) {
        setChecking(true);
        setMessage(null);
      }
      try {
        const { error } = await authClient.signIn.email({ email, password });
        if (!error) {
          router.push("/today");
          return;
        }
        if (error.code === "EMAIL_NOT_VERIFIED") {
          if (onDemand) setMessage("pending");
          return;
        }
        autoTries.current = false;
        if (onDemand) setMessage("sign-in-elsewhere");
      } catch {
        if (onDemand) setMessage("offline");
      } finally {
        inFlight.current = false;
        if (onDemand) setChecking(false);
      }
    },
    [email, password, router],
  );

  useEffect(() => {
    function onReturn() {
      if (document.visibilityState === "visible" && autoTries.current) void trySignIn(false);
    }
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [trySignIn]);

  return (
    <div className="flex w-full flex-col">
      <ForgotPasswordIllustration className="size-40 self-center" />
      <h1 className="mt-6 text-[29px] font-bold leading-tight tracking-tight text-stone-900">Ελέγξτε το email σας</h1>
      <p className="mt-3 text-lg leading-snug text-stone-600">
        Στείλαμε έναν σύνδεσμο στο
        <span className="block font-semibold text-stone-900 wrap-anywhere">{email}</span>
      </p>
      <p className="mt-2 text-lg leading-snug text-stone-600">Πατήστε τον για να ενεργοποιηθεί ο λογαριασμός σας και μετά γυρίστε εδώ.</p>

      <div className="mt-7 flex flex-col gap-3">
        {message === "pending" && (
          <p role="status" className="text-[15px] leading-snug text-stone-700">
            Δεν έχει επιβεβαιωθεί ακόμα. Πατήστε τον σύνδεσμο στο email και δοκιμάστε ξανά.
          </p>
        )}
        {message === "sign-in-elsewhere" && (
          <p role="alert" className="text-sm leading-snug text-red-700">
            Δεν ήταν δυνατή η σύνδεση από εδώ.{" "}
            <Link href="/login" onClick={() => playSound("button")} className="font-semibold text-accent-700 underline">
              Συνδεθείτε από την οθόνη σύνδεσης
            </Link>
            .
          </p>
        )}
        {message === "offline" && (
          <p role="alert" className="text-sm leading-snug text-red-700">
            Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
          </p>
        )}

        <Button
          size="lg"
          fullWidth
          disabled={checking}
          aria-busy={checking}
          onClick={() => {
            playSound("button");
            void trySignIn(true);
          }}
        >
          {checking ? "Έλεγχος…" : "Συνέχεια"}
        </Button>
        <ResendVerificationButton email={email} />
      </div>

      <p className="mt-5 text-center text-[15px] leading-relaxed text-stone-500">Δεν το βλέπετε; Κοιτάξτε και στα ανεπιθύμητα (spam).</p>

      <button
        type="button"
        onClick={() => {
          playSound("button");
          onChangeEmail();
        }}
        className="mt-3 min-h-12 self-center text-[15px] font-semibold text-accent-700"
      >
        Λάθος email; Διορθώστε το
      </button>
    </div>
  );
}
