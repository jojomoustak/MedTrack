"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { playSound } from "@/lib/sound/client/play-sound";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { MobilePlatformUnavailableError, type MobilePlatform } from "@/lib/platform/mobile-platform";
import { mapGoogleAuthErrorFromNativeSignIn } from "@/lib/auth/client/google-auth-errors";

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
   * (only meaningful for `mode="sign-in"`, and only for the plain-browser
   * redirect path below — see `google-auth-errors.ts`).
   * Defaults to the current page.
   */
  errorCallbackURL?: string;
  label?: string;
  /** Test-only injection point — real callers always get `MedianMobilePlatform`. */
  platform?: MobilePlatform;
}

/**
 * Two entirely different flows depending on where this renders (found
 * 2026-09-08: a real user's Google sign-in failed inside the Median app,
 * worked fine in a plain browser):
 *
 * - **Plain browser** (`platform.isAvailable() === false`): the original
 *   full-page-redirect flow — `signIn.social()`/`linkSocial()` navigate
 *   the browser to Google's consent screen and back through
 *   `/api/auth/callback/google`. No loading/error state to manage here;
 *   a successful call never returns to this component's JS.
 * - **Inside Median's WebView shell** (`platform.isAvailable() === true`):
 *   the redirect flow above is blocked by Google's own policy against
 *   OAuth in an embedded WebView (`disallowed_useragent`). Uses Median's
 *   native Social Login plugin instead (`platform.signInWithGoogle()` —
 *   Android's real Credential Manager / account picker, never a
 *   WebView-hosted Google page), which returns a Google ID token, then
 *   completes sign-in via Better Auth's `idToken`-based `signIn.social`/
 *   `linkSocial` (a plain `fetch`, not a redirect — Better Auth verifies
 *   the JWT server-side against the same `GOOGLE_CLIENT_ID` already
 *   configured, per `docs/adr/ADR-003-authentication.md`'s Google
 *   addendum). This branch genuinely returns to this component's JS on
 *   both success and failure, so — unlike the redirect branch — it owns
 *   real loading/error/navigation handling.
 */
export function GoogleAuthButton({ mode, callbackURL, errorCallbackURL, label, platform = new MedianMobilePlatform() }: GoogleAuthButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);

  async function handleClick() {
    playSound("button");
    setNativeError(null);
    setPending(true);

    if (platform.isAvailable()) {
      try {
        const result = await platform.signInWithGoogle();
        if (result.status !== "ok") {
          setNativeError("Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.");
          return;
        }
        const idToken = { token: result.idToken };
        const { error: authError } =
          mode === "sign-in"
            ? await authClient.signIn.social({ provider: "google", idToken, callbackURL, errorCallbackURL })
            : await authClient.linkSocial({ provider: "google", idToken, callbackURL });
        if (authError) {
          setNativeError(mapGoogleAuthErrorFromNativeSignIn(authError));
          return;
        }
        router.push(callbackURL);
      } catch (err) {
        setNativeError(
          err instanceof MobilePlatformUnavailableError
            ? "Η σύνδεση με Google δεν είναι ακόμα διαθέσιμη σε αυτή την έκδοση της εφαρμογής."
            : "Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.",
        );
      } finally {
        setPending(false);
      }
      return;
    }

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
    <div className="flex flex-col gap-2">
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
      {nativeError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {nativeError}
        </p>
      )}
    </div>
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
