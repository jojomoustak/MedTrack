import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { BrandLockup } from "@/components/shell/BrandMark";
import { mapGoogleAuthError, mapSessionExpiredReason } from "@/lib/auth/client/google-auth-errors";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reason?: string }>;
}

/**
 * `error` arrives here as a query param on the redirect back from
 * `/api/auth/callback/google` (ADR-003 addendum A.5) — read server-side
 * (Next.js App Router passes `searchParams` to page components) rather
 * than via a client hook, since the message is static once known and
 * doesn't need a `Suspense` boundary for this. `reason=session_expired` is
 * a second, independent source of a `/login` message: `app/(app)/layout.tsx`
 * sets it when `lib/auth/client/session-expired-signal.ts` fires.
 *
 * Layout matched to the reference mockup's Login, compared bezel-free at
 * the same width (2026-10-04): centered logo lockup, then a LEFT-aligned
 * large heading and subcopy, tall white fields, a large primary button,
 * plain "or continue with" text (no rules), a white card button for
 * Google, and a single-line sign-up prompt. One deliberate departure: the
 * reference shows Google *and* Apple side by side — Apple Sign-In isn't a
 * provider this app supports (CLAUDE.md rule 4), so only Google renders,
 * full-width rather than half-width next to a button that would go nowhere.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, reason } = await searchParams;
  const googleError = mapGoogleAuthError(error ?? null);
  const sessionExpiredMessage = mapSessionExpiredReason(reason ?? null);
  const message = googleError ?? sessionExpiredMessage;

  return (
    <main className="min-h-dvh bg-[#F8F5EE] px-7 pb-5 pt-6 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <BrandLockup iconSize={72} textClassName="text-[30px] leading-none" className="self-center" />

        <h1 className="mt-7 text-[34px] font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-50">Καλώς ήρθατε ξανά</h1>
        <p className="mt-2 text-lg leading-snug text-stone-600 dark:text-stone-400">Συνδεθείτε για να συνεχίσετε στο MedTrack.</p>

        {message && (
          <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
            {message}
          </p>
        )}

        <div className="mt-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-base text-stone-500 dark:text-stone-400">ή συνεχίστε με</p>

        <div className="mt-4">
          <GoogleAuthButton
            mode="sign-in"
            callbackURL="/today"
            errorCallbackURL="/login"
            size="lg"
            fullWidth
            className="bg-white shadow-[0_1px_3px_rgba(28,25,23,0.06)] dark:bg-stone-900"
          />
        </div>

        <p className="mt-6 text-center text-[15px] text-stone-600 dark:text-stone-400">
          Δεν έχετε λογαριασμό;{" "}
          <Link href="/register" className="font-semibold text-accent-700 dark:text-accent-400">
            Εγγραφή
          </Link>
        </p>
      </div>
    </main>
  );
}
