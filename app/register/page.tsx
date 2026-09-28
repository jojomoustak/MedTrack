import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { OrDivider } from "@/components/auth/OrDivider";
import { BrandLockup } from "@/components/shell/BrandMark";
import { mapGoogleAuthError } from "@/lib/auth/client/google-auth-errors";

interface RegisterPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * A Google sign-in started from `/register` can still collide with an
 * existing account (ADR-003 addendum A.5) — same rejection, same
 * server-side `error` query param handling as `/login` (see that page's
 * doc comment). `errorCallbackURL` below points back to `/register` (not
 * `/login`) so the message shows on whichever page the user actually
 * started from.
 *
 * Design pass (2026-09-28): matches `/login`'s reference-mockup structure
 * (brand header, heading + subcopy, full-width form, divider, social auth)
 * — the same gap the user flagged on Login applied here too, and leaving
 * only one of the pair redone would read as broken rather than finished.
 * Same Apple-omission call as Login (see that page's doc comment).
 *
 * Design pass 2 (2026-09-28, same day — user: "It doesnt look identical.
 * Be more careful"): same `BrandLockup` swap and two-line, non-underlined
 * cross-link fix as Login (see that page's doc comment for how the crop
 * comparison found these).
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;
  const googleError = mapGoogleAuthError(error ?? null);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-stone-50 px-6 py-12 dark:bg-stone-950">
      <BrandLockup />

      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">Δημιουργία λογαριασμού</h1>
        <p className="text-stone-600 dark:text-stone-400">Εγγραφείτε στο MedTrack και αναλάβετε τον έλεγχο της υγείας σας.</p>
      </div>

      {googleError && (
        <p role="alert" className="w-full max-w-sm text-sm text-red-700 dark:text-red-400">
          {googleError}
        </p>
      )}

      <RegisterForm />

      <OrDivider label="ή συνεχίστε με" />

      <div className="w-full max-w-sm">
        <GoogleAuthButton mode="sign-in" callbackURL="/today" errorCallbackURL="/register" fullWidth />
      </div>

      <p className="text-center text-sm text-stone-600 dark:text-stone-400">
        Έχετε ήδη λογαριασμό;
        <br />
        <Link href="/login" className="font-bold text-accent-700 dark:text-accent-400">
          Σύνδεση
        </Link>
      </p>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Δημιουργώντας λογαριασμό, συμφωνείτε με την{" "}
        <Link href="/privacy" className="text-accent-700 underline dark:text-accent-400">
          Πολιτική Απορρήτου
        </Link>
        .
      </p>
    </main>
  );
}
