"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client/auth-client";

interface GoogleAuthButtonProps {
  /**
   * "sign-in": unauthenticated `signIn.social()` — used on `/login` and
   * `/register` (ADR-003 addendum A.4/A.5). "link": authenticated
   * `linkSocial()` — used from Profile settings, requires an active
   * session (addendum A.5's "explicit, session-authenticated linking
   * only").
   */
  mode: "sign-in" | "link";
  /** Where Better Auth redirects on success. */
  callbackURL: string;
  /**
   * Where Better Auth redirects on failure, with `?error=<code>` appended
   * (only meaningful for `mode="sign-in"` — see `google-auth-errors.ts`).
   * Defaults to the current page.
   */
  errorCallbackURL?: string;
  label?: string;
}

/**
 * Both `signIn.social()` and `linkSocial()` are full-page-redirect flows
 * (the browser leaves this app for Google's consent screen) — there is no
 * loading/error state to manage after the call starts, since a
 * successful call never returns to this component's JS (the tab
 * navigates away). The only client-side state worth tracking is
 * "already clicked," to avoid a double-submit while the redirect is in
 * flight.
 */
export function GoogleAuthButton({ mode, callbackURL, errorCallbackURL, label }: GoogleAuthButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    if (mode === "sign-in") {
      await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL });
    } else {
      await authClient.linkSocial({ provider: "google", callbackURL });
    }
    // If we're still here, the redirect didn't happen (e.g. offline) —
    // let the user try again rather than staying disabled forever.
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-zinc-300 px-5 py-3 font-medium disabled:opacity-60 dark:border-zinc-700"
    >
      <GoogleGlyph />
      {label ?? (mode === "sign-in" ? "Σύνδεση με Google" : "Σύνδεση λογαριασμού Google")}
    </button>
  );
}

/** Minimal, dependency-free "G" glyph — avoids pulling in an icon package for one icon. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
