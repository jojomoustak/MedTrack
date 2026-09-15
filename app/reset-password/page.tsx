import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-12 dark:bg-black">
      <h1 className="text-2xl font-semibold">Ορισμός νέου κωδικού</h1>
      <ResetPasswordForm token={token ?? null} />
    </main>
  );
}
