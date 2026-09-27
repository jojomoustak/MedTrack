"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button, ButtonLink } from "@/components/ui/Button";

/**
 * Reads `token` from the URL query string. Better Auth's reset-link shape
 * is server-side `/reset-password/:token?callbackURL=...`, which redirects
 * to `callbackURL` (this app configures `/reset-password`, see
 * `ForgotPasswordForm.tsx`'s `redirectTo`) with `?token=...` appended —
 * confirmed against `requestPasswordResetCallback`'s `redirectCallback()`
 * call in the pinned version's own source
 * (`node_modules/better-auth/.../api/routes/password.mjs`).
 *
 * `authClient.resetPassword({newPassword, token})` — existing sessions
 * elsewhere are NOT revoked by this (Better Auth's `revokeSessionsOnPassword
 * Reset` default is `false`, left at its default per this task's own
 * scope — no specific reason to override it here).
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    playSound("button");
    setError(null);

    if (!token) {
      setError("Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει. Ζητήστε νέο σύνδεσμο.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Οι κωδικοί δεν ταιριάζουν.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword, token });
      if (resetError) {
        setError("Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει. Ζητήστε νέο σύνδεσμο.");
        return;
      }
      setDone(true);
      playSound("success");
      setTimeout(() => router.replace("/login"), 2000);
    } catch {
      setError("Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-stone-700 dark:text-stone-300">
        Ο κωδικός σας άλλαξε. Μεταφορά στη σύνδεση…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <PasswordInput
        label="Νέος κωδικός πρόσβασης"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        required
        minLength={8}
        ariaLabel="Νέος κωδικός πρόσβασης"
      />

      <PasswordInput
        label="Επιβεβαίωση κωδικού"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
        minLength={8}
        ariaLabel="Επιβεβαίωση νέου κωδικού πρόσβασης"
      />

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Αποθήκευση…" : "Ορισμός νέου κωδικού"}
      </Button>

      <ButtonLink href="/forgot-password" onClick={() => playSound("button")} variant="tertiary" className="underline">
        Ζητήστε νέο σύνδεσμο
      </ButtonLink>
    </form>
  );
}
