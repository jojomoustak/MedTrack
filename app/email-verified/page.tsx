import { EmailConfirmedIllustration, ForgotPasswordIllustration } from "@/components/auth/AuthIllustrations";
import { ButtonLink } from "@/components/ui/Button";
import { LanguageToggle } from "@/components/shell/LanguageToggle";
import { T } from "@/lib/i18n/client";

interface EmailVerifiedPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * Where the email-verification link lands (`EMAIL_VERIFIED_PATH`). It opens
 * in the phone's browser, not the app, and starts no session there
 * (`lib/auth/config.ts`), so this only says what happened and points back:
 * the app's "check your email" screen signs in by itself on return, and
 * the button here signs in from the browser instead.
 *
 * Better Auth sends `?error=TOKEN_EXPIRED` / `INVALID_TOKEN` /
 * `USER_NOT_FOUND` when the link didn't work; every one gets the same
 * "ask for a new link" answer.
 */
export default async function EmailVerifiedPage({ searchParams }: EmailVerifiedPageProps) {
  const { error } = await searchParams;
  const confirmed = !error;

  return (
    <main className="relative min-h-dvh bg-[#F8F5EE] px-7 pb-6 pt-10">
      <LanguageToggle className="absolute top-3 right-3" />
      <div className="mx-auto flex w-full max-w-sm flex-col">
        {confirmed ? <EmailConfirmedIllustration className="size-40 self-center" /> : <ForgotPasswordIllustration className="size-40 self-center" />}
        <h1 className="mt-7 text-[29px] font-bold leading-tight tracking-tight text-stone-900">
          <T>{confirmed ? "Το email σας επιβεβαιώθηκε" : "Ο σύνδεσμος δεν λειτούργησε"}</T>
        </h1>
        {confirmed ? (
          <p className="mt-3 text-lg leading-snug text-stone-600">
            <T>Ο λογαριασμός σας είναι έτοιμος. Γυρίστε στην εφαρμογή MedTrack για να συνεχίσετε.</T>
          </p>
        ) : (
          <p className="mt-3 text-lg leading-snug text-stone-600">
            <T>Ίσως έληξε (ισχύει για 1 ώρα). Συνδεθείτε με το email και τον κωδικό σας και θα σας προτείνουμε να σας στείλουμε νέο.</T>
          </p>
        )}
        <ButtonLink href="/login" size="lg" fullWidth className="mt-8">
          <T>{confirmed ? "Σύνδεση από εδώ" : "Σύνδεση"}</T>
        </ButtonLink>
      </div>
    </main>
  );
}
