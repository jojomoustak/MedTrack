import Link from "next/link";

/**
 * Public route (outside the `(app)` auth-gated group, same tier as
 * `/welcome`/`/login`/`/register`) — required to exist at a stable URL
 * before the Google OAuth consent screen can leave "Testing" status
 * (ADR-003 addendum A.8) and before this app can be submitted to the Play
 * Store. Content is a DRAFT reflecting what this codebase actually does
 * today (verified against `lib/account/server/delete-account.ts`,
 * `lib/account/server/export-account-data.ts`, `lib/logging/redact.ts`,
 * `lib/db/rls.ts`, and the processor list in `docs/product/
 * phase-0-product-definition.md` §10/§12) — NOT a finalized legal
 * document. `docs/product/phase-0-product-definition.md` §12 explicitly
 * tracks retention periods and a full processor inventory as open,
 * not-yet-legally-reviewed decisions; this page must be reviewed by the
 * user (and, before a real public launch, by a lawyer) before the
 * placeholder contact details below are filled in and the draft notice is
 * removed.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex flex-col gap-2">
        <Link href="/welcome" className="flex min-h-12 w-fit items-center text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Αρχική
        </Link>
        <h1 className="text-2xl font-semibold">Πολιτική Απορρήτου</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Τελευταία ενημέρωση: 15 Σεπτεμβρίου 2026</p>
      </div>

      <div
        role="note"
        className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      >
        <strong>Προσχέδιο.</strong> Αυτό το κείμενο περιγράφει με ακρίβεια τι κάνει η εφαρμογή σήμερα, αλλά δεν έχει
        ακόμα ελεγχθεί από νομικό σύμβουλο και τα στοιχεία επικοινωνίας παρακάτω είναι προσωρινά. Πρέπει να
        αντικατασταθούν πριν η εφαρμογή γίνει διαθέσιμη σε πραγματικούς χρήστες πέρα από δοκιμαστική χρήση.
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Τι είναι το MedTracking</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Το MedTracking είναι μια εφαρμογή διαχείρισης φαρμάκων: σας βοηθά να θυμάστε πότε να πάρετε τα φάρμακά σας,
          να παρακολουθείτε το απόθεμά σας και το ιστορικό λήψης. <strong>Δεν παρέχει ιατρικές συμβουλές, διάγνωση ή
          συστάσεις δοσολογίας</strong> — καταγράφει μόνο όσα εσείς δηλώνετε ότι σας έχουν συνταγογραφηθεί.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Ποια δεδομένα συλλέγουμε</h2>
        <ul className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Στοιχεία λογαριασμού:</strong> email, όνομα (προαιρετικό), κρυπτογραφημένος κωδικός πρόσβασης
            (ποτέ ο ίδιος ο κωδικός σε απλό κείμενο) ή σύνδεση μέσω λογαριασμού Google.
          </li>
          <li>
            <strong>Δεδομένα φαρμάκων:</strong> τα φάρμακα, τα προγράμματα λήψης, το ιστορικό δόσεων, το απόθεμα και
            οι λίστες αγορών που καταχωρείτε εσείς οι ίδιοι.
          </li>
          <li>
            <strong>Φωτογραφίες φαρμάκων</strong> (προαιρετικό): αν επιλέξετε να προσθέσετε φωτογραφία σε ένα φάρμακο.
          </li>
          <li>
            <strong>Τεχνικά δεδομένα ασφαλείας:</strong> ένα κρυπτογραφημένο (όχι το πραγματικό) αποτύπωμα της
            διεύθυνσης IP και το είδος συσκευής/browser, χρησιμοποιούνται αποκλειστικά για ανίχνευση κατάχρησης και
            προστασία του λογαριασμού σας — ποτέ για διαφημίσεις ή στατιστικά χρήσης.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Γιατί τα χρησιμοποιούμε</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Αποκλειστικά για να λειτουργήσει η εφαρμογή: να σας υπενθυμίζουμε τις δόσεις σας, να συγχρονίζουμε τα
          δεδομένα σας ανάμεσα σε συσκευές και να προστατεύουμε τον λογαριασμό σας. Δεν πουλάμε, ενοικιάζουμε ή
          χρησιμοποιούμε τα δεδομένα υγείας σας για διαφημίσεις, μάρκετινγκ ή οποιονδήποτε σκοπό πέρα από τη λειτουργία
          της εφαρμογής.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Με ποιους μοιραζόμαστε δεδομένα</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Χρησιμοποιούμε τους παρακάτω τρίτους αποκλειστικά ως πάροχοι υποδομής (όχι ως αποδέκτες για δικούς τους
          σκοπούς):
        </p>
        <ul className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Vercel</strong> — φιλοξενία της εφαρμογής και (προαιρετικά) αποθήκευση φωτογραφιών φαρμάκων.
          </li>
          <li>
            <strong>Neon</strong> — η βάση δεδομένων όπου αποθηκεύονται τα δεδομένα σας.
          </li>
          <li>
            <strong>Google</strong> — μόνο αν επιλέξετε σύνδεση μέσω λογαριασμού Google.
          </li>
          <li>
            <strong>Resend</strong> — αποστολή email επιβεβαίωσης λογαριασμού και επαναφοράς κωδικού πρόσβασης.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Πόσο καιρό κρατάμε τα δεδομένα σας</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Όσο διατηρείτε ενεργό τον λογαριασμό σας. Αν διαγράψετε τον λογαριασμό σας, τα δεδομένα σας διαγράφονται
          πραγματικά από τον διακομιστή — δεν πρόκειται για απλό τοπικό καθαρισμό. Για τεχνικούς λόγους αντιγράφων
          ασφαλείας της βάσης δεδομένων, ένα αντίγραφο μπορεί να παραμείνει ανακτήσιμο για έως 7 ημέρες μετά τη
          διαγραφή, πριν διαγραφεί οριστικά κι από εκεί.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Τα δικαιώματά σας</h2>
        <ul className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Πρόσβαση/Φορητότητα:</strong> μπορείτε να κατεβάσετε όλα τα δεδομένα σας ανά πάσα στιγμή από το{" "}
            <Link href="/profile" className="underline">
              Προφίλ
            </Link>
            .
          </li>
          <li>
            <strong>Διόρθωση:</strong> μπορείτε να επεξεργαστείτε τα φάρμακα και τα στοιχεία σας απευθείας μέσα στην
            εφαρμογή.
          </li>
          <li>
            <strong>Διαγραφή:</strong> μπορείτε να διαγράψετε μόνιμα τον λογαριασμό σας και όλα τα δεδομένα σας από το{" "}
            <Link href="/profile" className="underline">
              Προφίλ
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Πώς προστατεύουμε τα δεδομένα σας</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Όλη η επικοινωνία γίνεται κρυπτογραφημένα (HTTPS). Οι κωδικοί πρόσβασης αποθηκεύονται πάντα κρυπτογραφημένοι,
          ποτέ σε απλό κείμενο. Η βάση δεδομένων επιβάλλει τεχνικά όρια ώστε ο λογαριασμός σας να βλέπει μόνο τα δικά
          του δεδομένα. Τα αρχεία καταγραφής του συστήματος (logs) δεν περιέχουν ποτέ τα πραγματικά δεδομένα υγείας
          σας.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Επικοινωνία</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Για ερωτήσεις σχετικά με το απόρρητο ή για να ασκήσετε τα δικαιώματά σας:{" "}
          <span className="font-medium">[προσωρινό placeholder email επικοινωνίας]</span>.
        </p>
      </section>
    </main>
  );
}
