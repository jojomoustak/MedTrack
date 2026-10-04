import { AuthBackLink } from "@/components/auth/AuthBackLink";
import { ForgotPasswordIllustration } from "@/components/auth/AuthIllustrations";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

/**
 * Matched to the reference mockup's "Forgot password?" screen (compared
 * bezel-free at the same width, 2026-10-04): back arrow, large envelope
 * illustration, LEFT-aligned heading and subcopy, a tall white email
 * field, a large button, and a green "back to sign in" link.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="min-h-dvh bg-[#F8F5EE] px-7 pb-6 pt-4 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <AuthBackLink href="/login" />
        <ForgotPasswordIllustration className="mt-2 size-47 self-center" />
        <h1 className="mb-2 mt-8 text-[29px] font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-50">Ξεχάσατε τον κωδικό;</h1>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
