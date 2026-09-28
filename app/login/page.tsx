import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { OrDivider } from "@/components/auth/OrDivider";
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
 * Design pass (2026-09-28, reference mockup comparison — user flagged this
 * screen specifically): the reference's Login is brand header + "Welcome
 * back" + subcopy + full-width form + a divider + social auth, not a bare
 * `<h1>Σύνδεση</h1>` over the form. Matched here, with one deliberate
 * departure: the reference shows Google *and* Apple side by side — Apple
 * Sign-In isn't a real provider this app supports (CLAUDE.md rule 4, no
 * unavailable integration), so only Google renders, full-width rather than
 * left orphaned at half-width next to a button that would go nowhere.
 *
 * Design pass 2 (2026-09-28, same day — user: "It doesnt look identical.
 * Be more careful"): cropping and upscaling the reference showed the brand
 * mark here is the bigger stacked lockup used on every entry screen
 * (`BrandLockup`, icon-above-wordmark, colored green), not the compact
 * inline header mark — and the bottom cross-link is two stacked lines
 * with a bold, non-underlined colored link, not one underlined line.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, reason } = await searchParams;
  const googleError = mapGoogleAuthError(error ?? null);
  const sessionExpiredMessage = mapSessionExpiredReason(reason ?? null);
  const message = googleError ?? sessionExpiredMessage;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-stone-50 px-6 py-12 dark:bg-stone-950">
      <BrandLockup />

      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">Καλώς ήρθατε ξανά</h1>
        <p className="text-stone-600 dark:text-stone-400">Συνδεθείτε για να συνεχίσετε στο MedTrack.</p>
      </div>

      {message && (
        <p role="alert" className="w-full max-w-sm text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      )}

      <LoginForm />

      <OrDivider label="ή συνεχίστε με" />

      <div className="w-full max-w-sm">
        <GoogleAuthButton mode="sign-in" callbackURL="/today" errorCallbackURL="/login" fullWidth />
      </div>

      <p className="text-center text-sm text-stone-600 dark:text-stone-400">
        Δεν έχετε λογαριασμό;
        <br />
        <Link href="/register" className="font-semibold text-accent-700 dark:text-accent-400">
          Δημιουργία λογαριασμού
        </Link>
      </p>
    </main>
  );
}
