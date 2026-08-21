import Link from "next/link";

/** Phase 3 §2.1 "Welcome / intro" — value proposition, states Greek-only UI at launch. */
export default function WelcomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-50 px-6 py-12 text-center dark:bg-black">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">MedTracking</h1>
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
          Παρακολουθήστε τα φάρμακά σας, το πρόγραμμα λήψης και το απόθεμά σας — ακόμα και χωρίς σύνδεση στο διαδίκτυο.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">Διαθέσιμο προς το παρόν μόνο στα Ελληνικά.</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/register"
          className="flex min-h-12 items-center justify-center rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Δημιουργία λογαριασμού
        </Link>
        <Link
          href="/login"
          className="flex min-h-12 items-center justify-center rounded-full border border-zinc-300 px-5 py-3 font-medium dark:border-zinc-700"
        >
          Σύνδεση
        </Link>
      </div>
    </main>
  );
}
