import { BrandWordmark } from "@/components/shell/BrandMark";
import { WelcomeIllustration } from "@/components/shell/WelcomeIllustration";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Phase 3 §2.1 "Welcome / intro" — value proposition, states Greek-only UI
 * at launch.
 *
 * Design pass (2026-09-28, reference mockup comparison — user flagged this
 * screen a second time: "not the same as the reference photo"). The first
 * pass added the illustration but kept the wrong composition — the
 * reference reads logo -> heading -> subcopy -> illustration -> CTA ->
 * sign-in link, not illustration-then-text. Reordered to match, and the
 * heading is now the actual visual lead (bigger, bolder) rather than a
 * standard h1 sitting under the picture.
 *
 * Two deliberate departures from the reference, both judgment calls rather
 * than oversights:
 * - The reference shows a row of pagination dots under the illustration.
 *   This app has exactly one welcome message, not a swipeable multi-step
 *   carousel — dots would imply more screens to swipe to that don't exist,
 *   the same "UI that goes nowhere" problem already avoided elsewhere
 *   (no fake Apple Sign-In button, no dead-end settings rows). Omitted.
 * - The standalone "Privacy Policy" link this screen used to have at the
 *   bottom isn't in the reference either — Register's fine print already
 *   links Privacy at the actual point of data collection, so it's not
 *   dropped, just not duplicated here. Its place is now the real,
 *   non-mockup fact this app still needs to state up front: Greek-only UI
 *   at launch.
 */
export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-stone-50 px-6 py-10 text-center dark:bg-stone-950">
      <BrandWordmark className="text-sm" />

      <div className="flex flex-col items-center gap-3">
        <h1 className="max-w-[15ch] text-3xl font-bold text-balance">Η υγεία σας στα χέρια σας</h1>
        <p className="max-w-sm text-stone-600 dark:text-stone-400">
          Παρακολουθήστε τα φάρμακά σας, το πρόγραμμα λήψης και το απόθεμά σας — ακόμα και χωρίς σύνδεση στο διαδίκτυο.
        </p>
      </div>

      <WelcomeIllustration />

      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <ButtonLink href="/register" fullWidth>
          Ξεκινήστε τώρα
        </ButtonLink>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Έχετε ήδη λογαριασμό;{" "}
          <ButtonLink href="/login" variant="tertiary" className="px-0 underline">
            Σύνδεση
          </ButtonLink>
        </p>
      </div>

      <p className="text-xs text-stone-500 dark:text-stone-500">Διαθέσιμο προς το παρόν μόνο στα Ελληνικά.</p>
    </main>
  );
}
