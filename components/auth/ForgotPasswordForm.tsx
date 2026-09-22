"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";

type Status = "idle" | "sent" | "offline";

/**
 * Phase 3 §2.1-style "forgot password" — mirrors `RegisterForm.tsx`'s
 * structure/conventions (`min-h-12` touch targets, `aria-label`s, Greek
 * copy, `role="alert"` errors, `playSound("button")` on submit and every
 * Link, not just onClick buttons — this project has been bitten before by
 * a sound sweep that only grepped `onClick=`).
 *
 * Calls `authClient.requestPasswordReset()` — NOT `authClient.forgetPassword`
 * (Better Auth 1.7.1's core has no `/forget-password` route; that name only
 * exists in the separate `email-otp` plugin). Confirmed against the pinned
 * version's actual route (`/request-password-reset`,
 * `node_modules/better-auth/.../api/routes/password.mjs`) and its client
 * path-to-camelCase mapping (`node_modules/better-auth/dist/client/
 * path-to-object.d.mts`).
 *
 * Always shows the SAME generic success message regardless of whether the
 * email exists — Better Auth's `/request-password-reset` endpoint is
 * already enumeration-safe by design (identical 200 response either way,
 * confirmed by reading its source). This component only distinguishes a
 * genuine network/offline failure (a THROWN error — the request never
 * reached the server) from a normal submission, same pattern
 * `LoginForm.tsx` already uses for that distinction; it never reads or
 * branches on the response body itself, so it can't accidentally
 * reintroduce the distinction the server-side endpoint already avoids.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    playSound("button");
    setSubmitting(true);
    try {
      await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      setStatus("sent");
    } catch {
      setStatus("offline");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="flex w-full max-w-sm flex-col gap-4 text-center">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού σε λίγα λεπτά.
        </p>
        <Link
          href="/login"
          onClick={() => playSound("button")}
          className="flex min-h-12 items-center justify-center font-medium underline"
        >
          Επιστροφή στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Πληκτρολογήστε το email του λογαριασμού σας και θα σας στείλουμε σύνδεσμο για επαναφορά κωδικού.
      </p>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {status === "offline" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="inline-flex items-center justify-center min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {submitting ? "Αποστολή…" : "Αποστολή συνδέσμου επαναφοράς"}
      </button>

      <Link
        href="/login"
        onClick={() => playSound("button")}
        className="flex min-h-12 items-center justify-center text-sm font-medium underline"
      >
        Επιστροφή στη σύνδεση
      </Link>
    </form>
  );
}
