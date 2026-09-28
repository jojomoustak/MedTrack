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
 * Design pass 2 (2026-09-28, same day — user: "I want them identical"):
 * the dots below were reconsidered and added back. They're purely
 * decorative (no swipe handler, no route change) rather than a real
 * carousel control, which is a materially different case from the still-
 * declined fakes elsewhere (no Apple Sign-In button wired to nothing, no
 * settings row linking nowhere) — those implied a specific action that
 * would silently fail; a static dot row implies nothing actionable at all.
 *
 * One remaining deliberate departure from the reference:
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

      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-4 rounded-full bg-accent-600 dark:bg-accent-500" />
        <span className="h-1.5 w-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
        <span className="h-1.5 w-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
      </div>

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
