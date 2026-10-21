"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
import { EMAIL_VERIFIED_PATH } from "@/lib/auth/client/email-verification";
import { useAppAutofill } from "@/components/auth/use-app-autofill";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordRule } from "@/components/auth/PasswordRule";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { Button } from "@/components/ui/Button";

const MIN_PASSWORD_LENGTH = 8;

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
}

/**
 * Phase 3 §2.1 "Register". Calls Better Auth's client SDK (ADR-003). A
 * sign-up starts no session: the account waits for its email to be
 * confirmed (2026-10-20, `lib/auth/config.ts`), so success hands the
 * values to `onRegistered` (`RegisterScreen` shows "check your email").
 * `initial` refills the form when the person goes back to fix the email.
 */
export function RegisterForm({ initial, onRegistered }: { initial?: RegisterValues; onRegistered: (values: RegisterValues) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  // Google's strong-password pop-up kept closing the keyboard here (`use-app-autofill.ts`).
  useAppAutofill(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    // A phone keyboard's suggestion often leaves a trailing space.
    const address = email.trim();
    try {
      const { error: signUpError } = await authClient.signUp.email({ name, email: address, password, callbackURL: EMAIL_VERIFIED_PATH });
      if (signUpError) {
        setError(translateAuthError(signUpError.message ?? ""));
        return;
      }
      onRegistered({ name, email: address, password });
    } catch {
      setError("Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Ονοματεπώνυμο</span>
        <input
          type="text"
          autoComplete="name"
          placeholder="Όνομα χρήστη"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Ονοματεπώνυμο"
          className={`${FIELD_INPUT} pr-4`}
        />
      </label>

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
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        ariaLabel="Κωδικός πρόσβασης"
      />

      {/* The reference lists three live password rules; this app only
          enforces one (length — Better Auth's server-side minimum). */}
      <PasswordRule met={password.length >= MIN_PASSWORD_LENGTH} label={`Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`} />

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting} className="mt-2">
        {submitting ? "Δημιουργία λογαριασμού…" : "Δημιουργία λογαριασμού"}
      </Button>
    </form>
  );
}

/**
 * Never shows a raw Better Auth/server error string (CLAUDE.md rule 8) — a
 * small, honest translation layer.
 *
 * No "already exists" branch (security audit follow-up, 2026-09-15: that
 * told a visitor whether an email is registered). Since 2026-10-20 the
 * server doesn't fail that case at all: with email verification required,
 * Better Auth answers an existing email exactly like a new one and emails
 * the owner instead (`lib/auth/config.ts`'s `onExistingUserSignUp`).
 */
function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("password")) {
    return "Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 8 χαρακτήρες.";
  }
  return "Κάτι πήγε στραβά. Δοκιμάστε ξανά.";
}
