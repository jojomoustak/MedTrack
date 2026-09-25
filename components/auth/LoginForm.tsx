"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { PasswordInput } from "@/components/auth/PasswordInput";

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
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
          className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
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
        className="self-end text-sm font-medium underline"
      >
        Ξεχάσατε τον κωδικό;
      </Link>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="inline-flex items-center justify-center min-h-12 rounded-full bg-accent-700 px-5 py-3 font-medium text-white transition-transform duration-150 active:scale-95 disabled:opacity-60 disabled:active:scale-100 dark:bg-accent-500 dark:text-stone-950"
      >
        {submitting ? "Σύνδεση…" : "Σύνδεση"}
      </button>
    </form>
  );
}
