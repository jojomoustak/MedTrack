"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { Button } from "@/components/ui/Button";
import { T } from "@/lib/i18n/client";

function BackToSignIn() {
  return (
    <Link
      href="/login"
      onClick={() => playSound("button")}
      className="self-center py-2 text-[17px] font-semibold text-accent-700"
    >
      <T>Επιστροφή στη σύνδεση</T>
    </Link>
  );
}

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
      <div role="status" className="flex w-full flex-col gap-6">
        <p className="text-lg leading-snug text-stone-600">
          <T>Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού σε λίγα λεπτά.</T>
        </p>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
      <p className="mb-4 text-lg leading-snug text-stone-600">
        <T>Πληκτρολογήστε το email σας και θα σας στείλουμε σύνδεσμο για επαναφορά του κωδικού σας.</T>
      </p>

      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

      {status === "offline" && (
        <p role="alert" className="text-sm text-red-700">
          <T>Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.</T>
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting} className="mt-4">
        <T>{submitting ? "Αποστολή…" : "Αποστολή συνδέσμου"}</T>
      </Button>

      <BackToSignIn />
    </form>
  );
}
