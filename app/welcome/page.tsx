import { BrandMark } from "@/components/shell/BrandMark";
import { ButtonLink } from "@/components/ui/Button";

/** Phase 3 §2.1 "Welcome / intro" — value proposition, states Greek-only UI at launch. */
export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-stone-50 px-6 py-12 text-center dark:bg-stone-950">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={40} className="text-accent-700 dark:text-accent-500" />
        <h1 className="text-3xl font-semibold">MedTrack</h1>
        <p className="max-w-sm text-stone-600 dark:text-stone-400">
          Παρακολουθήστε τα φάρμακά σας, το πρόγραμμα λήψης και το απόθεμά σας — ακόμα και χωρίς σύνδεση στο διαδίκτυο.
        </p>
        <p className="text-sm text-stone-500 dark:text-stone-400">Διαθέσιμο προς το παρόν μόνο στα Ελληνικά.</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <ButtonLink href="/register" fullWidth>
          Δημιουργία λογαριασμού
        </ButtonLink>
        <ButtonLink href="/login" variant="secondary" fullWidth>
          Σύνδεση
        </ButtonLink>
      </div>

      <ButtonLink href="/privacy" variant="tertiary" className="px-0 text-stone-500 underline dark:text-stone-500">
        Πολιτική Απορρήτου
      </ButtonLink>
    </main>
  );
}
