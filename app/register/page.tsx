import { AuthBackLink } from "@/components/auth/AuthBackLink";
import { RegisterScreen } from "@/components/auth/RegisterScreen";

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
 * actually enforces (see `RegisterForm`). After sign-up the content gives
 * way to "check your email" (`RegisterScreen`).
 */
export default function RegisterPage() {
  return (
    <main className="min-h-dvh bg-[#F8F5EE] px-7 pb-6 pt-4">
      <div className="mx-auto flex w-full max-w-sm flex-col">
        <AuthBackLink href="/welcome" />
        <RegisterScreen />
      </div>
    </main>
  );
}
