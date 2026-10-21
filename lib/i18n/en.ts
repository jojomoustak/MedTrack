/**
 * English for every Greek text (owner's request, 2026-10-21). The key is
 * the Greek exactly as written in the code (`t("…")` / `<T>…</T>`), so a
 * change to the Greek needs the same change here — `lib/i18n/coverage.test.ts`
 * fails until it's made. `{name}` placeholders are kept as they are.
 *
 * Same voice as the Greek: plain, warm, for someone who may be unwell —
 * never pressure («take control», «never miss a dose»).
 */
export const EN: Record<string, string> = {
  // --- Shell: header, menu, banners, loading ---------------------------------
  "Πίσω": "Back",
  "Κύρια πλοήγηση": "Main navigation",
  "Σήμερα": "Today",
  "Φάρμακα": "Medicines",
  "Ημερολόγιο": "Calendar",
  "Λίστες": "Lists",
  "Προφίλ": "Profile",
  "Κατάσταση συγχρονισμού": "Sync status",
  "Σημερινές δόσεις": "Today's doses",
  "Λεπτομέρειες δόσης": "Dose details",
  "Απόκρυψη": "Hide",
  "Φόρτωση…": "Loading…",
  "Είστε εκτός σύνδεσης. Οι αλλαγές σας αποθηκεύονται στη συσκευή και θα συγχρονιστούν αυτόματα.":
    "You're offline. Your changes are saved on this device and will sync automatically.",
  "Δυσκολευόμαστε να συνδεθούμε με τους διακομιστές του MedTrack. Τα δεδομένα σας είναι ασφαλή σε αυτή τη συσκευή και θα συγχρονιστούν αυτόματα.":
    "We're having trouble reaching MedTrack's servers. Your data is safe on this device and will sync automatically.",
  "Δοκιμάστε ξανά": "Try again",

  // --- Sync status (components/sync/sync-state-config.ts) ------------------
  "Αποθηκεύτηκε στη συσκευή": "Saved on this device",
  "Αποθηκευμένο μόνο σε αυτή τη συσκευή, δεν έχει συγχρονιστεί ακόμα.": "Saved only on this device, not synced yet.",
  "Σε αναμονή συγχρονισμού": "Waiting to sync",
  "Σε αναμονή συγχρονισμού.": "Waiting to sync.",
  "Συγχρονίζεται…": "Syncing…",
  "Συγχρονίζεται τώρα.": "Syncing now.",
  "Χρειάζεται έλεγχος — πατήστε": "Needs a look — tap",
  "Χρειάζεται έλεγχος: υπάρχει διένεξη συγχρονισμού. Πατήστε για λεπτομέρειες.": "Needs a look: there's a sync conflict. Tap for details.",
  "Απέτυχε — πατήστε για επανάληψη": "Failed — tap to retry",
  "Ο συγχρονισμός απέτυχε. Πατήστε για επανάληψη.": "Sync failed. Tap to retry.",
  "Διαγράφεται…": "Deleting…",
  "Διαγράφεται, σε αναμονή επιβεβαίωσης από τον διακομιστή.": "Deleting, waiting for the server to confirm.",

  // --- Today ------------------------------------------------------------------
  "Καλημέρα": "Good morning",
  "Καλησπέρα": "Good evening",
  "Μείνετε συνεπείς. Τα πάτε καλά!": "Keep it up — you're doing well!",
  "{name} — χαμηλό απόθεμα.": "{name} — running low.",
  "{count} φάρμακα με χαμηλό απόθεμα: {names}.": "{count} medicines running low: {names}.",
  "Απόκρυψη ειδοποίησης χαμηλού αποθέματος για τώρα": "Hide the low-stock notice for now",
  "Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.": "You haven't added any medicines yet.",
  "Προσθέστε το πρώτο σας φάρμακο και το πρόγραμμά του, για να εμφανίζονται εδώ οι δόσεις της ημέρας.":
    "Add your first medicine and its schedule, and the day's doses will show up here.",
  "Προσθήκη φαρμάκου": "Add medicine",
  "Καμία προγραμματισμένη δόση σήμερα.": "No doses scheduled today.",
  "Όλες οι δόσεις καταγράφηκαν.": "All doses recorded.",
  "{taken} από {total} ελήφθησαν": "{taken} of {total} taken",
  "Δείτε τα φάρμακά σας": "See your medicines",
  "Να καταγραφούν ως ελήφθησαν οι {count} δόσεις που είναι για τώρα; Οι επόμενες δόσεις της ημέρας δεν αλλάζουν.":
    "Record the {count} doses due now as taken? Later doses today stay as they are.",
  "Ακύρωση": "Cancel",
  "Καταγραφή…": "Recording…",
  "Ελήφθησαν": "Taken",
  "Καταγραφή {count} δόσεων ως ελήφθησαν": "Record {count} doses as taken",
  "Επόμενες ημέρες": "Next days",
  "Σήμερα, {date}": "Today, {date}",

  // --- Dose status and rows ----------------------------------------------------
  "Ελήφθη {time}": "Taken {time}",
  "Ελήφθη αργότερα, {time}": "Taken late, {time}",
  "Αναβολή έως {time}": "Snoozed until {time}",
  "Παραλείφθηκε": "Skipped",
  "Χάθηκε": "Missed",
  "Ακυρώθηκε": "Cancelled",
  "προγραμματισμένη": "scheduled",
  "Αναίρεση": "Undo",
  "Σήμανση ως ελήφθη: {title}, {time}": "Mark as taken: {title}, {time}",
  "Το πήρα αργότερα: {title}, {time}": "Took it late: {title}, {time}",

  // --- Welcome ----------------------------------------------------------------
  "Δίπλα σας,": "By your side,",
  "κάθε μέρα": "every day",
  "Σας θυμίζουμε πότε είναι η ώρα για κάθε φάρμακο και κρατάμε το πρόγραμμά σας τακτοποιημένο, ώστε να έχετε ένα πράγμα λιγότερο να σκέφτεστε.":
    "We remind you when it's time for each medicine and keep your schedule in order, so you have one less thing to worry about.",
  "Ας ξεκινήσουμε": "Let's get started",

  // --- Sign in / create account -------------------------------------------------
  "Καλώς ήρθατε ξανά": "Welcome back",
  "Συνδεθείτε για να συνεχίσετε στο MedTrack.": "Sign in to continue to MedTrack.",
  "Δεν έχετε λογαριασμό;": "Don't have an account?",
  "Εγγραφή": "Sign up",
  "Έχετε ήδη λογαριασμό;": "Already have an account?",
  "Σύνδεση": "Sign in",
  "Σύνδεση…": "Signing in…",
  "ή": "or",
  "Κωδικός πρόσβασης": "Password",
  "Ξεχάσατε τον κωδικό;": "Forgot your password?",
  "Λανθασμένο email ή κωδικός πρόσβασης.": "Wrong email or password.",
  "Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.":
    "Couldn't connect to the internet. Check your connection and try again.",
  "Το email σας δεν έχει επιβεβαιωθεί ακόμα. Πατήστε τον σύνδεσμο που σας στείλαμε στο": "Your email isn't confirmed yet. Tap the link we sent to",
  "και δοκιμάστε ξανά.": "and try again.",
  "Απόκρυψη κωδικού πρόσβασης": "Hide password",
  "Εμφάνιση κωδικού πρόσβασης": "Show password",
  " — εντάξει": " — done",
  " — δεν πληρείται ακόμα": " — not met yet",
  "Δημιουργία λογαριασμού": "Create account",
  "Δημιουργία λογαριασμού…": "Creating account…",
  "Λίγα στοιχεία μόνο, και θα σας βοηθάμε να θυμάστε τα φάρμακά σας.": "Just a few details, and we'll help you remember your medicines.",
  "Ονοματεπώνυμο": "Full name",
  "Τουλάχιστον {count} χαρακτήρες": "At least {count} characters",
  "Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 8 χαρακτήρες.": "The password must be at least 8 characters.",
  "Κάτι πήγε στραβά. Δοκιμάστε ξανά.": "Something went wrong. Please try again.",
  "Δημιουργώντας λογαριασμό, συμφωνείτε με την": "By creating an account, you agree to the",
  "Πολιτική Απορρήτου": "Privacy Policy",
  "Σύνδεση με Google": "Sign in with Google",
  "Σύνδεση λογαριασμού Google": "Link Google account",
  "Συνέχεια με Google": "Continue with Google",
  "Η σύνδεση με Google απέτυχε. Δοκιμάστε ξανά.": "Signing in with Google failed. Please try again.",
  "Η σύνδεση με Google δεν είναι ακόμα διαθέσιμη σε αυτή την έκδοση της εφαρμογής.": "Signing in with Google isn't available in this version of the app yet.",
  "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε με τον κωδικό πρόσβασής σας και, στη συνέχεια, συνδέστε το Google από τις Ρυθμίσεις.":
    "There's already an account with this email. Sign in with your password, then link Google from Settings.",
  "Η σύνδεσή σας έληξε. Παρακαλούμε συνδεθείτε ξανά.": "Your session has expired. Please sign in again.",

  // --- Check your email / confirmation --------------------------------------------
  "Ελέγξτε το email σας": "Check your email",
  "Στείλαμε έναν σύνδεσμο στο": "We sent a link to",
  "Πατήστε τον για να ενεργοποιηθεί ο λογαριασμός σας και μετά γυρίστε εδώ.": "Tap it to activate your account, then come back here.",
  "Δεν έχει επιβεβαιωθεί ακόμα. Πατήστε τον σύνδεσμο στο email και δοκιμάστε ξανά.": "Not confirmed yet. Tap the link in the email and try again.",
  "Δεν ήταν δυνατή η σύνδεση από εδώ.": "Couldn't sign in from here.",
  "Συνδεθείτε από την οθόνη σύνδεσης": "Sign in from the sign-in screen",
  "Έλεγχος…": "Checking…",
  "Συνέχεια": "Continue",
  "Δεν το βλέπετε; Κοιτάξτε και στα ανεπιθύμητα (spam).": "Can't see it? Check your spam folder too.",
  "Λάθος email; Διορθώστε το": "Wrong email? Fix it",
  "Αποστολή…": "Sending…",
  "Στείλτε νέο σύνδεσμο": "Send a new link",
  "Στάλθηκε ξανά": "Sent again",
  "Στείλαμε νέο σύνδεσμο. Ελέγξτε το email σας.": "We sent a new link. Check your email.",
  "Η αποστολή δεν έγινε. Δοκιμάστε ξανά σε λίγα λεπτά.": "It couldn't be sent. Try again in a few minutes.",
  "Το email σας επιβεβαιώθηκε": "Your email is confirmed",
  "Ο σύνδεσμος δεν λειτούργησε": "The link didn't work",
  "Ο λογαριασμός σας είναι έτοιμος. Γυρίστε στην εφαρμογή MedTrack για να συνεχίσετε.": "Your account is ready. Go back to the MedTrack app to continue.",
  "Ίσως έληξε (ισχύει για 1 ώρα). Συνδεθείτε με το email και τον κωδικό σας και θα σας προτείνουμε να σας στείλουμε νέο.":
    "It may have expired (links last 1 hour). Sign in with your email and password and we'll offer to send you a new one.",
  "Σύνδεση από εδώ": "Sign in here",

  // --- Forgot / reset password ------------------------------------------------------
  "Επιστροφή στη σύνδεση": "Back to sign in",
  "Πληκτρολογήστε το email σας και θα σας στείλουμε σύνδεσμο για επαναφορά του κωδικού σας.": "Enter your email and we'll send you a link to reset your password.",
  "Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς κωδικού σε λίγα λεπτά.":
    "If there's an account with this email, you'll get a password reset link in a few minutes.",
  "Αποστολή συνδέσμου": "Send link",
  "Επαναφορά κωδικού": "Reset password",
  "Πληκτρολογήστε τον νέο σας κωδικό παρακάτω.": "Enter your new password below.",
  "Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.": "This reset link isn't valid or has expired.",
  "Οι κωδικοί δεν ταιριάζουν.": "The passwords don't match.",
  "Ο κωδικός σας άλλαξε. Μεταφορά στη σύνδεση…": "Your password has changed. Taking you to sign in…",
  "Νέος κωδικός πρόσβασης": "New password",
  "Επιβεβαίωση νέου κωδικού": "Confirm new password",
  "Επιβεβαίωση νέου κωδικού πρόσβασης": "Confirm new password",
  "Οι δύο κωδικοί ταιριάζουν": "The two passwords match",
  "Ζητήστε νέο σύνδεσμο": "Ask for a new link",
  "Αποθήκευση…": "Saving…",
};
