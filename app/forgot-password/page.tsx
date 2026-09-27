import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthIconBadge, EnvelopeIcon } from "@/components/auth/AuthIconBadge";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-stone-50 px-4 py-12 dark:bg-stone-950">
      <AuthIconBadge>
        <EnvelopeIcon />
      </AuthIconBadge>
      <h1 className="text-2xl font-semibold">Επαναφορά κωδικού</h1>
      <ForgotPasswordForm />
    </main>
  );
}
