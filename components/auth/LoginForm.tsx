"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { Button } from "@/components/ui/Button";

/**
 * Phase 3 §2.1 "Login" / §8: wrong-credentials and no-connection are two
 * genuinely distinct messages, never the same generic one, so a user
 * isn't told "wrong password" when the real cause is offline.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        setError("Λανθασμένο email ή κωδικός πρόσβασης.");
        return;
      }
      router.push("/today");
    } catch {
      // A thrown (not returned) error from the client SDK means the
      // request itself never reached the server — offline/backend
      // unreachable, not "wrong password" (Phase 3 §8).
      setError("Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
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

      <PasswordInput
        label="Κωδικός πρόσβασης"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
        ariaLabel="Κωδικός πρόσβασης"
      />

      <Link
        href="/forgot-password"
        onClick={() => playSound("button")}
        className="-mt-1 self-end text-[15px] font-semibold text-accent-700 dark:text-accent-400"
      >
        Ξεχάσατε τον κωδικό;
      </Link>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting} className="mt-2">
        {submitting ? "Σύνδεση…" : "Σύνδεση"}
      </Button>
    </form>
  );
}
