import Link from "next/link";
import { AuthBackLink } from "@/components/auth/AuthBackLink";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { BrandLockup } from "@/components/shell/BrandMark";

/**
 * Layout matched to the reference mockup's Register, compared bezel-free
 * at the same width (2026-10-04): a back arrow to Welcome, centered logo
 * lockup, LEFT-aligned large heading and subcopy, tall white fields, a
 * large primary button, the consent line, then a single-line sign-in
 * prompt. The reference has no social sign-in here — Google sign-in on
 * Login creates an account too, so nothing is lost by matching that.
 *
 * Two deliberate departures: the reference's consent line also links a
 * "Terms of Service" page this app doesn't have (so only Privacy is
 * linked), and its three live password rules become the one this app
 * actually enforces (see `RegisterForm`).
 */
export default function RegisterPage() {
  return (
    <main className="min-h-dvh bg-[#F8F5EE] px-7 pb-6 pt-4 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <AuthBackLink href="/welcome" />

        <BrandLockup iconSize={72} textClassName="text-[30px] leading-none" className="self-center" />

        <h1 className="mt-7 text-[27px] font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-50">Δημιουργία λογαριασμού</h1>
        <p className="mt-2 text-lg leading-snug text-stone-600 dark:text-stone-400">Εγγραφείτε στο MedTrack και αναλάβετε τον έλεγχο της υγείας σας.</p>

        <div className="mt-6">
          <RegisterForm />
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Δημιουργώντας λογαριασμό, συμφωνείτε με την{" "}
          <Link href="/privacy" className="font-semibold text-accent-700 dark:text-accent-400">
            Πολιτική Απορρήτου
          </Link>
          .
        </p>

        <p className="mt-6 text-center text-[15px] text-stone-600 dark:text-stone-400">
          Έχετε ήδη λογαριασμό;{" "}
          <Link href="/login" className="font-semibold text-accent-700 dark:text-accent-400">
            Σύνδεση
          </Link>
        </p>
      </div>
    </main>
  );
}
