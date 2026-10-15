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
 * a large rounded-rectangle button, and a centered two-line sign-in
 * prompt. (The reference's slide dots were dropped, 2026-10-15: there are
 * no slides, so they promised something that wasn't there.) The reference canvas is taller than any real
 * phone, so the illustration takes whatever height is left rather than a
 * fixed size — the one proportion that can't be copied 1:1.
 *
 * Words (owner, 2026-10-15): written for someone who may be seriously
 * ill. "Your health in your hands" and "take control" put the weight on
 * them; the app is beside them and carries the remembering. No promise
 * the app can't keep, and nothing clinical (CLAUDE.md rule 1).
 *
 * Privacy is linked from Register's fine print at the point of data
 * collection; this screen's extra line is the Greek-only notice §2.1
 * requires.
 */
export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#F8F5EE] px-7 pb-4 pt-6">
      <BrandLockup iconSize={84} textClassName="text-[32px] leading-none" className="self-center" />

      <div className="mt-5 px-4">
        <h1 className="text-[40px] font-bold leading-[1.15] tracking-tight text-stone-900">
          Δίπλα σας,
          <br />
          κάθε μέρα
        </h1>
        <p className="mt-4 text-[19px] leading-[1.6] text-stone-700">
          Σας θυμίζουμε πότε είναι η ώρα για κάθε φάρμακο και κρατάμε το πρόγραμμά σας τακτοποιημένο, ώστε να έχετε ένα πράγμα λιγότερο να σκέφτεστε.
        </p>
      </div>

      <WelcomeIllustration className="-mx-7 mt-2 max-h-[420px] min-h-[190px] flex-1" />

      <ButtonLink href="/register" size="lg" fullWidth className="mt-6">
        Ας ξεκινήσουμε
      </ButtonLink>

      <p className="mt-4 text-center text-[15px] text-stone-600">
        Έχετε ήδη λογαριασμό;
        <br />
        <Link href="/login" className="mt-1 inline-block text-[17px] font-semibold text-accent-700">
          Σύνδεση
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-stone-500">Διαθέσιμο προς το παρόν μόνο στα Ελληνικά.</p>
    </main>
  );
}
