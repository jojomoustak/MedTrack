"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordRule } from "@/components/auth/PasswordRule";
import { Button } from "@/components/ui/Button";

const MIN_PASSWORD_LENGTH = 8;

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
 *
 * The live checks show only the two rules this form actually enforces —
 * the server's minimum length and the confirm field matching — not the
 * reference mockup's "number"/"special character" rules, which nothing
 * enforces.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    playSound("button");
    setError(null);
    setLinkInvalid(false);

    if (!token) {
      setError("Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.");
      setLinkInvalid(true);
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
        setError("Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.");
        setLinkInvalid(true);
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
      <p role="status" className="text-lg leading-snug text-stone-700 dark:text-stone-300">
        Ο κωδικός σας άλλαξε. Μεταφορά στη σύνδεση…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
      <PasswordInput
        label="Νέος κωδικός πρόσβασης"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        ariaLabel="Νέος κωδικός πρόσβασης"
      />

      <PasswordInput
        label="Επιβεβαίωση νέου κωδικού"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        ariaLabel="Επιβεβαίωση νέου κωδικού πρόσβασης"
      />

      <div className="flex flex-col gap-2.5">
        <PasswordRule met={newPassword.length >= MIN_PASSWORD_LENGTH} label={`Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`} />
        <PasswordRule met={confirmPassword.length > 0 && confirmPassword === newPassword} label="Οι δύο κωδικοί ταιριάζουν" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}{" "}
          {linkInvalid && (
            <Link href="/forgot-password" onClick={() => playSound("button")} className="font-semibold text-accent-700 underline dark:text-accent-400">
              Ζητήστε νέο σύνδεσμο
            </Link>
          )}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting} className="mt-2">
        {submitting ? "Αποθήκευση…" : "Επαναφορά κωδικού"}
      </Button>

      <Link
        href="/login"
        onClick={() => playSound("button")}
        className="self-center py-2 text-[17px] font-semibold text-accent-700 dark:text-accent-400"
      >
        Επιστροφή στη σύνδεση
      </Link>
    </form>
  );
}
