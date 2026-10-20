"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
import { EMAIL_VERIFIED_PATH, RESEND_COOLDOWN_MS } from "@/lib/auth/client/email-verification";
import { playSound } from "@/lib/sound/client/play-sound";
import { Button } from "@/components/ui/Button";

type ResendState = "idle" | "sending" | "sent" | "error" | "offline";

/**
 * "Send me the link again", before the first sign-in (no session yet).
 * Better Auth answers this the same whether or not the address has an
 * unverified account (and waits a fixed minimum so the timing doesn't
 * tell either), so the "sent" line here never confirms an account exists.
 * Rested for two minutes after each send, like `EmailVerificationBanner`.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [state, setState] = useState<ResendState>("idle");
  // Flipped by a timer, not derived from `Date.now()` during render (see `EmailVerificationBanner`).
  const [onCooldown, setOnCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );

  async function send() {
    playSound("button");
    setState("sending");
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: EMAIL_VERIFIED_PATH });
      if (error) {
        setState("error");
        return;
      }
      setState("sent");
      setOnCooldown(true);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      cooldownTimer.current = setTimeout(() => setOnCooldown(false), RESEND_COOLDOWN_MS);
    } catch {
      setState("offline");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="lg" fullWidth onClick={send} disabled={state === "sending" || onCooldown} aria-busy={state === "sending"}>
        {state === "sending" ? "Αποστολή…" : onCooldown ? "Στάλθηκε ξανά" : "Στείλτε νέο σύνδεσμο"}
      </Button>
      {state === "sent" && (
        <p role="status" className="text-center text-[15px] text-stone-600">
          Στείλαμε νέο σύνδεσμο. Ελέγξτε το email σας.
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-center text-sm text-red-700">
          Η αποστολή δεν έγινε. Δοκιμάστε ξανά σε λίγα λεπτά.
        </p>
      )}
      {state === "offline" && (
        <p role="alert" className="text-center text-sm text-red-700">
          Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
        </p>
      )}
    </div>
  );
}
