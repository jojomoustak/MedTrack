"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
import { EMAIL_VERIFIED_PATH, RESEND_COOLDOWN_MS } from "@/lib/auth/client/email-verification";
import { playSound } from "@/lib/sound/client/play-sound";
import { Button } from "@/components/ui/Button";

type VerificationState = "checking" | "verified" | "unverified" | "unknown";
type ResendState = "idle" | "sending" | "sent" | "error";

/**
 * ADR-003 §5's "non-blocking, dismissible-but-recurring" in-app banner,
 * now only for accounts made before 2026-10-20, when signing in started to
 * need a confirmed email: their sessions still work, but the next sign-in
 * won't until it's confirmed — surfaced, not punitive.
 * "Dismissible-but-recurring" is kept deliberately simple: dismissal is
 * component-local state, not persisted, so it reappears the next time this
 * mounts (e.g. next visit to Profile) rather than needing its own
 * localStorage-backed "don't show again" flag — matches the spec's "small,
 * non-blocking" ask without over-building this into a bigger feature.
 *
 * Renders nothing while the check is in flight, once confirmed verified,
 * or if the check itself fails (`"unknown"`) — never nags based on an
 * uncertain answer.
 */
export function EmailVerificationBanner({ email }: { email: string | null }) {
  const [state, setState] = useState<VerificationState>("checking");
  const [dismissed, setDismissed] = useState(false);
  const [resend, setResend] = useState<ResendState>("idle");
  // A plain boolean, flipped by a `setTimeout` rather than derived from
  // `Date.now()` at render time (React requires render to stay pure/
  // idempotent — reading the current time during render is exactly the
  // kind of impure call that rule forbids; a timer-driven state update is
  // the correct way to express "this becomes false after N ms").
  const [onCooldown, setOnCooldown] = useState(false);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/email-verification", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ emailVerified: boolean }>) : Promise.reject(new Error("request failed"))))
      .then((data) => {
        if (!cancelled) setState(data.emailVerified ? "verified" : "unverified");
      })
      .catch(() => {
        if (!cancelled) setState("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResend() {
    if (!email) return;
    playSound("button");
    setResend("sending");
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: EMAIL_VERIFIED_PATH });
      if (error) {
        setResend("error");
        return;
      }
      setResend("sent");
      setOnCooldown(true);
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
      cooldownTimeoutRef.current = setTimeout(() => setOnCooldown(false), RESEND_COOLDOWN_MS);
    } catch {
      setResend("error");
    }
  }

  if (state !== "unverified" || dismissed) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p>Το email σας δεν έχει επιβεβαιωθεί ακόμα. Επιβεβαιώστε το για να μπορείτε να συνδεθείτε ξανά, αν αποσυνδεθείτε.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={handleResend}
          disabled={!email || resend === "sending" || onCooldown}
          aria-busy={resend === "sending"}
          className="border-amber-400 text-amber-900"
        >
          {resend === "sending" ? "Αποστολή…" : onCooldown ? "Στάλθηκε — δοκιμάστε ξανά σε λίγο" : "Επαναποστολή email επιβεβαίωσης"}
        </Button>
        <Button
          variant="tertiary"
          onClick={() => {
            playSound("button");
            setDismissed(true);
          }}
          className="px-0 text-amber-900 underline"
        >
          Παράβλεψη
        </Button>
      </div>
      {resend === "error" && (
        <p role="alert" className="text-red-700">
          Η αποστολή απέτυχε. Δοκιμάστε ξανά αργότερα.
        </p>
      )}
    </div>
  );
}
