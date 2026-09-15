"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";

/** ADR-003 §5 bullet 2: "resend available, rate-limited, e.g. 1 per 2 minutes per account". */
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

type VerificationState = "checking" | "verified" | "unverified" | "unknown";
type ResendState = "idle" | "sending" | "sent" | "error";

/**
 * ADR-003 §5's "non-blocking, dismissible-but-recurring" in-app banner: an
 * unverified email means password-reset won't work yet (see
 * `lib/auth/config.ts`'s `sendResetPassword`) — surfaced, not punitive.
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
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/profile" });
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
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <p>Το email σας δεν έχει επιβεβαιωθεί ακόμα. Η επαναφορά κωδικού πρόσβασης δεν θα λειτουργήσει μέχρι να το επιβεβαιώσετε.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={!email || resend === "sending" || onCooldown}
          aria-busy={resend === "sending"}
          className="min-h-12 rounded-full border border-amber-400 px-4 py-2 font-medium text-amber-900 disabled:opacity-60 dark:border-amber-600 dark:text-amber-100"
        >
          {resend === "sending" ? "Αποστολή…" : onCooldown ? "Στάλθηκε — δοκιμάστε ξανά σε λίγο" : "Επαναποστολή email επιβεβαίωσης"}
        </button>
        <button
          type="button"
          onClick={() => {
            playSound("button");
            setDismissed(true);
          }}
          className="min-h-12 px-2 font-medium underline"
        >
          Παράβλεψη
        </button>
      </div>
      {resend === "error" && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          Η αποστολή απέτυχε. Δοκιμάστε ξανά αργότερα.
        </p>
      )}
    </div>
  );
}
