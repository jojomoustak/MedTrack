import { AuthBackLink } from "@/components/auth/AuthBackLink";
import { ResetPasswordIllustration } from "@/components/auth/AuthIllustrations";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Matched to the reference mockup's "Reset your password" screen
 * (compared bezel-free at the same width, 2026-10-04): back arrow, large
 * padlock illustration, LEFT-aligned heading and subcopy, two tall white
 * password fields with live checks, a large button, and a green "back to
 * sign in" link.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="min-h-dvh bg-[#F8F5EE] px-7 pb-6 pt-4 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <AuthBackLink href="/login" />
        <ResetPasswordIllustration className="size-36 self-center" />
        <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-50">Επαναφορά κωδικού</h1>
        <p className="mb-6 mt-2 text-lg leading-snug text-stone-600 dark:text-stone-400">Πληκτρολογήστε τον νέο σας κωδικό παρακάτω.</p>
        <ResetPasswordForm token={token ?? null} />
      </div>
    </main>
  );
}
