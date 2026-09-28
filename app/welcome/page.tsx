import Link from "next/link";
import { BrandLockup } from "@/components/shell/BrandMark";
import { WelcomeIllustration } from "@/components/shell/WelcomeIllustration";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Phase 3 §2.1 "Welcome / intro" — value proposition, states Greek-only UI
 * at launch.
 *
 * Built to the reference mockup's measured proportions (2026-09-28): the
 * reference screen was cropped bezel-free and scaled to this app's 390px
 * width for a fair comparison (its phone frames are drawn far narrower
 * than a real phone, so matching by height had been hiding the real
 * differences). Measured at that width: centered logo lockup, then a
 * LEFT-aligned ~40px heading and ~19px subcopy, a full-bleed illustration,
 * circular step dots, a large rounded-rectangle button, and a centered
 * two-line sign-in prompt. The reference canvas is taller than any real
 * phone, so the illustration takes whatever height is left rather than a
 * fixed size — the one proportion that can't be copied 1:1.
 *
 * The dots are decorative (no swipe, no route change). Privacy is linked
 * from Register's fine print at the point of data collection; this
 * screen's extra line is the Greek-only notice §2.1 requires.
 */
export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#F8F5EE] px-7 pb-4 pt-6 dark:bg-stone-950">
      <BrandLockup iconSize={84} textClassName="text-[32px] leading-none" className="self-center" />

      <div className="mt-5 px-4">
        <h1 className="text-[40px] font-bold leading-[1.15] tracking-tight text-stone-900 dark:text-stone-50">
          Η υγεία σας
          <br />
          στα χέρια σας
        </h1>
        <p className="mt-4 text-[19px] leading-[1.6] text-stone-700 dark:text-stone-300">
          Καταγράψτε τα φάρμακά σας, μη χάνετε καμία δόση και πάρτε τον έλεγχο της υγείας σας.
        </p>
      </div>

      <WelcomeIllustration className="-mx-7 mt-2 max-h-[420px] min-h-[190px] flex-1" />

      <div className="mt-3 flex items-center justify-center gap-2.5" aria-hidden="true">
        <span className="size-3 rounded-full bg-[#0F5534] dark:bg-accent-500" />
        <span className="size-[9px] rounded-full bg-[#ADC6B6] dark:bg-stone-600" />
        <span className="size-[9px] rounded-full bg-[#D1D8CF] dark:bg-stone-700" />
      </div>

      <ButtonLink href="/register" size="lg" fullWidth className="mt-5">
        Ξεκινήστε τώρα
      </ButtonLink>

      <p className="mt-4 text-center text-[15px] text-stone-600 dark:text-stone-400">
        Έχετε ήδη λογαριασμό;
        <br />
        <Link href="/login" className="mt-1 inline-block text-[17px] font-semibold text-accent-700 dark:text-accent-400">
          Σύνδεση
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-stone-500">Διαθέσιμο προς το παρόν μόνο στα Ελληνικά.</p>
    </main>
  );
}
