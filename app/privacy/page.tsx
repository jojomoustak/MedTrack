import Link from "next/link";
import { BackButton } from "@/components/shell/BackButton";
import { BrandWordmark } from "@/components/shell/BrandMark";

/**
 * Public route (outside the `(app)` auth-gated group, same tier as
 * `/welcome`/`/login`/`/register`) — required to exist at a stable URL
 * before the Google OAuth consent screen can leave "Testing" status
 * (ADR-003 addendum A.8) and before this app can be submitted to the Play
 * Store. Content reflects what this codebase actually does today
 * (verified against `lib/account/server/delete-account.ts`,
 * `lib/account/server/export-account-data.ts`, `lib/logging/redact.ts`,
 * `lib/db/rls.ts`, and the processor list in `docs/product/
 * phase-0-product-definition.md` §10/§12). The owner reviewed it, removed
 * the "draft" notice and gave the contact address (2026-10-15); it has not
 * had a legal review, which a wider public launch should still get
 * (retention periods and the full processor inventory remain open in
 * phase-0 §12).
 *
 * Presentation matched to the reference mockup (2026-10-04): back arrow
 * beside the compact wordmark, a large bold title, larger body text,
 * numbered section headings, green bullets. Content deliberately NOT
 * taken from the reference — its body is placeholder text; this page's
 * wording reflects what the app actually does and stays as written.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#F8F5EE] px-7 pb-12 pt-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col">
          <div className="relative flex items-center justify-center">
            <BackButton fallback="/welcome" className="absolute -left-3" />
            <BrandWordmark className="text-xl" />
          </div>
          <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-tight text-stone-900">
            Πολιτική Απορρήτου
          </h1>
          <p className="mt-1 text-lg text-stone-500">
            Τελευταία ενημέρωση: 15 Οκτ 2026
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            Τι είναι το MedTrack
          </h2>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Το MedTrack είναι μια εφαρμογή διαχείρισης φαρμάκων: σας βοηθά να
            θυμάστε πότε να πάρετε τα φάρμακά σας, να παρακολουθείτε το απόθεμά
            σας και το ιστορικό λήψης.{" "}
            <strong>
              Δεν παρέχει ιατρικές συμβουλές, διάγνωση ή συστάσεις δοσολογίας
            </strong>{" "}
            — καταγράφει μόνο όσα εσείς δηλώνετε ότι σας έχουν συνταγογραφηθεί.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            1. Ποια δεδομένα συλλέγουμε
          </h2>
          <ul className="flex flex-col gap-3 [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.62em] [&>li]:before:size-2 [&>li]:before:rounded-full [&>li]:before:bg-accent-600 text-[17px] leading-relaxed text-stone-700">
            <li>
              <strong>Στοιχεία λογαριασμού:</strong> email, όνομα (προαιρετικό),
              κρυπτογραφημένος κωδικός πρόσβασης (ποτέ ο ίδιος ο κωδικός σε απλό
              κείμενο) ή σύνδεση μέσω λογαριασμού Google.
            </li>
            <li>
              <strong>Δεδομένα φαρμάκων:</strong> τα φάρμακα, τα προγράμματα
              λήψης, το ιστορικό δόσεων, το απόθεμα και οι λίστες αγορών που
              καταχωρείτε εσείς οι ίδιοι.
            </li>
            <li>
              <strong>Φωτογραφίες φαρμάκων</strong> (προαιρετικό): αν επιλέξετε
              να προσθέσετε φωτογραφία σε ένα φάρμακο.
            </li>
            <li>
              <strong>Τεχνικά δεδομένα ασφαλείας:</strong> ένα κρυπτογραφημένο
              (όχι το πραγματικό) αποτύπωμα της διεύθυνσης IP και το είδος
              συσκευής/browser, χρησιμοποιούνται αποκλειστικά για ανίχνευση
              κατάχρησης και προστασία του λογαριασμού σας — ποτέ για
              διαφημίσεις ή στατιστικά χρήσης.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            2. Γιατί τα χρησιμοποιούμε
          </h2>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Αποκλειστικά για να λειτουργήσει η εφαρμογή: να σας υπενθυμίζουμε
            τις δόσεις σας, να συγχρονίζουμε τα δεδομένα σας ανάμεσα σε συσκευές
            και να προστατεύουμε τον λογαριασμό σας. Δεν πουλάμε, ενοικιάζουμε ή
            χρησιμοποιούμε τα δεδομένα υγείας σας για διαφημίσεις, μάρκετινγκ ή
            οποιονδήποτε σκοπό πέρα από τη λειτουργία της εφαρμογής.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            3. Με ποιους μοιραζόμαστε δεδομένα
          </h2>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Χρησιμοποιούμε τους παρακάτω τρίτους αποκλειστικά ως πάροχοι
            υποδομής (όχι ως αποδέκτες για δικούς τους σκοπούς):
          </p>
          <ul className="flex flex-col gap-3 [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.62em] [&>li]:before:size-2 [&>li]:before:rounded-full [&>li]:before:bg-accent-600 text-[17px] leading-relaxed text-stone-700">
            <li>
              <strong>Vercel</strong> — φιλοξενία της εφαρμογής και
              (προαιρετικά) αποθήκευση φωτογραφιών φαρμάκων.
            </li>
            <li>
              <strong>Neon</strong> — η βάση δεδομένων όπου αποθηκεύονται τα
              δεδομένα σας.
            </li>
            <li>
              <strong>Google</strong> — μόνο αν επιλέξετε σύνδεση μέσω
              λογαριασμού Google.
            </li>
            <li>
              <strong>Resend</strong> — αποστολή email επιβεβαίωσης λογαριασμού
              και επαναφοράς κωδικού πρόσβασης.
            </li>
          </ul>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Επίσης, όταν αναγνωρίζετε εσείς μια συσκευασία που ο κατάλογος δεν
            γνωρίζει (από την ετικέτα ή βρίσκοντάς τη στον κατάλογο), ποιο
            φάρμακο αντιστοιχεί σε αυτό το barcode προτείνεται σε άλλους
            χρήστες του MedTrack που σαρώνουν την ίδια συσκευασία, χωρίς το
            όνομά σας ή άλλο στοιχείο σας. Εκείνοι πρέπει πάντα να το
            επιβεβαιώσουν. Αν διαγράψετε τον λογαριασμό σας, διαγράφεται κι
            αυτό.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            4. Πόσο καιρό κρατάμε τα δεδομένα σας
          </h2>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Όσο διατηρείτε ενεργό τον λογαριασμό σας. Αν διαγράψετε τον
            λογαριασμό σας, τα δεδομένα σας διαγράφονται πραγματικά από τον
            διακομιστή — δεν πρόκειται για απλό τοπικό καθαρισμό. Για τεχνικούς
            λόγους αντιγράφων ασφαλείας της βάσης δεδομένων, ένα αντίγραφο
            μπορεί να παραμείνει ανακτήσιμο για έως 7 ημέρες μετά τη διαγραφή,
            πριν διαγραφεί οριστικά κι από εκεί.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            5. Τα δικαιώματά σας
          </h2>
          <ul className="flex flex-col gap-3 [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.62em] [&>li]:before:size-2 [&>li]:before:rounded-full [&>li]:before:bg-accent-600 text-[17px] leading-relaxed text-stone-700">
            <li>
              <strong>Πρόσβαση/Φορητότητα:</strong> μπορείτε να κατεβάσετε όλα
              τα δεδομένα σας ανά πάσα στιγμή από το{" "}
              <Link
                href="/profile"
                className="font-semibold text-accent-700"
              >
                Προφίλ
              </Link>
              .
            </li>
            <li>
              <strong>Διόρθωση:</strong> μπορείτε να επεξεργαστείτε τα φάρμακα
              και τα στοιχεία σας απευθείας μέσα στην εφαρμογή.
            </li>
            <li>
              <strong>Διαγραφή:</strong> μπορείτε να διαγράψετε μόνιμα τον
              λογαριασμό σας και όλα τα δεδομένα σας από το{" "}
              <Link
                href="/profile"
                className="font-semibold text-accent-700"
              >
                Προφίλ
              </Link>
              .
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            6. Πώς προστατεύουμε τα δεδομένα σας
          </h2>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Όλη η επικοινωνία γίνεται κρυπτογραφημένα (HTTPS). Οι κωδικοί
            πρόσβασης αποθηκεύονται πάντα κρυπτογραφημένοι, ποτέ σε απλό
            κείμενο. Η βάση δεδομένων επιβάλλει τεχνικά όρια ώστε ο λογαριασμός
            σας να βλέπει μόνο τα δικά του δεδομένα. Τα αρχεία καταγραφής του
            συστήματος (logs) δεν περιέχουν ποτέ τα πραγματικά δεδομένα υγείας
            σας.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[21px] font-bold leading-snug tracking-tight text-stone-900">
            7. Επικοινωνία
          </h2>
          <p className="text-[17px] leading-relaxed text-stone-700">
            Για ερωτήσεις σχετικά με το απόρρητο ή για να ασκήσετε τα δικαιώματά
            σας:{" "}
            <a href="mailto:jojomoustak@gmail.com" className="font-semibold text-accent-700 underline underline-offset-2">
              jojomoustak@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
