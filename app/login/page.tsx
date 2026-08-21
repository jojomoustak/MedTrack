import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { mapGoogleAuthError } from "@/lib/auth/client/google-auth-errors";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * `error` arrives here as a query param on the redirect back from
 * `/api/auth/callback/google` (ADR-003 addendum A.5) — read server-side
 * (Next.js App Router passes `searchParams` to page components) rather
 * than via a client hook, since the message is static once known and
 * doesn't need a `Suspense` boundary for this.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const googleError = mapGoogleAuthError(error ?? null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-12 dark:bg-black">
      <h1 className="text-2xl font-semibold">Σύνδεση</h1>
      {googleError && (
        <p role="alert" className="w-full max-w-sm text-sm text-red-700 dark:text-red-400">
          {googleError}
        </p>
      )}
      <LoginForm />
      <GoogleAuthButton mode="sign-in" callbackURL="/today" errorCallbackURL="/login" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Δεν έχετε λογαριασμό;{" "}
        <Link href="/register" className="font-medium underline">
          Δημιουργία λογαριασμού
        </Link>
      </p>
    </main>
  );
}
