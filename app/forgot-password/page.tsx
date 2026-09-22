import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-12 dark:bg-black">
      <h1 className="text-2xl font-semibold">Επαναφορά κωδικού</h1>
      <ForgotPasswordForm />
    </main>
  );
}
