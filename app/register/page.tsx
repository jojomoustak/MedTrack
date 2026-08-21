import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
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
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;
  const googleError = mapGoogleAuthError(error ?? null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-12 dark:bg-black">
      <h1 className="text-2xl font-semibold">Δημιουργία λογαριασμού</h1>
      {googleError && (
        <p role="alert" className="w-full max-w-sm text-sm text-red-700 dark:text-red-400">
          {googleError}
        </p>
      )}
      <RegisterForm />
      <GoogleAuthButton mode="sign-in" callbackURL="/today" errorCallbackURL="/register" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Έχετε ήδη λογαριασμό;{" "}
        <Link href="/login" className="font-medium underline">
          Σύνδεση
        </Link>
      </p>
    </main>
  );
}
