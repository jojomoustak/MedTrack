"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordRule } from "@/components/auth/PasswordRule";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { Button } from "@/components/ui/Button";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Phase 3 §2.1 "Register". Calls Better Auth's client SDK (ADR-003) —
 * `autoSignIn: true` (Phase 4 config) means a successful sign-up already
 * has a session, so this redirects straight to Today rather than to a
 * separate login step.
 */
export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await authClient.signUp.email({ name, email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(translateAuthError(signUpError.message ?? ""));
      return;
    }
    router.push("/today");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4" noValidate>
      <label className={FIELD_WRAPPER}>
        <span className={FIELD_LABEL}>Ονοματεπώνυμο</span>
        <input
          type="text"
          autoComplete="name"
          placeholder="π.χ. Μαρία Παπαδοπούλου"
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
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
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
 * Account-enumeration partial mitigation (security audit follow-up,
 * 2026-09-15): the previous version of this function had an explicit
 * "already exists" branch that told an unauthenticated visitor, in plain
 * UI text, whether a given email is already registered — a textbook
 * enumeration oracle. Removed; an existing-email sign-up now falls into
 * the same generic branch as every other failure, so the rendered UI text
 * no longer confirms existence either way. This does NOT close the
 * underlying HTTP-level distinguishability (different status code / no
 * session cookie for the existing-email case) — closing that would require
 * Better Auth's own generic-duplicate-response mechanism, which is
 * structurally incompatible with ADR-003 §5's grace-period policy
 * (`autoSignIn: true`/`requireEmailVerification: false`) at this app's
 * current config; see `lib/auth/config.ts`'s doc comment for the full
 * reachability finding. That remaining gap is tracked, not silently
 * accepted as fixed.
 */
function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("password")) {
    return "Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 8 χαρακτήρες.";
  }
  return "Κάτι πήγε στραβά. Δοκιμάστε ξανά.";
}
