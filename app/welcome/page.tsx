import { BrandWordmark } from "@/components/shell/BrandMark";
import { WelcomeIllustration } from "@/components/shell/WelcomeIllustration";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Phase 3 §2.1 "Welcome / intro" — value proposition, states Greek-only UI
 * at launch. Design pass (2026-09-28, reference mockup comparison): this
 * screen was text-and-two-buttons only, missing the reference's actual
 * centerpiece (a real illustration) and its hierarchy — one primary
 * "Get started"-equivalent action plus a quieter "already have an
 * account" path, not two equal-weight buttons. Restructured to match;
 * the illustration reuses BrandMark's own leaf silhouette rather than
 * introducing a second visual vocabulary.
 */
export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-stone-50 px-6 py-10 text-center dark:bg-stone-950">
      <BrandWordmark className="text-sm" />

      <WelcomeIllustration />

      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-semibold">Η υγεία σας στα χέρια σας</h1>
        <p className="max-w-sm text-stone-600 dark:text-stone-400">
          Παρακολουθήστε τα φάρμακά σας, το πρόγραμμα λήψης και το απόθεμά σας — ακόμα και χωρίς σύνδεση στο διαδίκτυο.
        </p>
        <p className="text-sm text-stone-500 dark:text-stone-400">Διαθέσιμο προς το παρόν μόνο στα Ελληνικά.</p>
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

      <ButtonLink href="/privacy" variant="tertiary" className="px-0 text-stone-500 underline dark:text-stone-500">
        Πολιτική Απορρήτου
      </ButtonLink>
    </main>
  );
}
