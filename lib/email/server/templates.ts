/**
 * Auth-only transactional email bodies (Greek, calm tone — matches this
 * app's established copy style in `RegisterForm.tsx`/`LoginForm.tsx`/
 * `DeleteAccountFlow.tsx`: plain, direct, never alarmist). CLAUDE.md rule 8:
 * these are auth-only notices — nothing health-related (medication name,
 * dose, schedule) ever belongs in an email, and none of the templates here
 * accept or interpolate any such field.
 *
 * Each template returns both `html` and `text` bodies — `sendEmail()`
 * (`lib/email/server/resend-client.ts`) always sends both, so a client that
 * can't render HTML (or a user who prefers plain text) still gets a usable
 * message.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = "MedTracking";

function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="el">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 16px;font-size:16px;font-weight:600;">${BRAND}</p>
        ${bodyHtml}
        <p style="margin:24px 0 0;font-size:12px;color:#71717a;">
          Αυτό είναι ένα αυτόματο μήνυμα σχετικά με τον λογαριασμό σας στο ${BRAND}. Αν δεν αναγνωρίζετε αυτό το αίτημα, μπορείτε να αγνοήσετε αυτό το email με ασφάλεια.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** (a) Email verification link — sent on every sign-up (ADR-003 §5), and on demand via the in-app "resend" action. */
export function verificationEmail(params: { url: string }): EmailContent {
  const subject = `Επιβεβαιώστε το email σας στο ${BRAND}`;
  const html = wrapHtml(`
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Για να επιβεβαιώσετε ότι αυτό το email σας ανήκει, πατήστε τον παρακάτω σύνδεσμο.</p>
    <p style="margin:0 0 24px;">
      <a href="${params.url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-size:14px;font-weight:600;">Επιβεβαίωση email</a>
    </p>
    <p style="margin:0;font-size:13px;color:#52525b;">Αν το κουμπί δεν λειτουργεί, αντιγράψτε αυτόν τον σύνδεσμο στον περιηγητή σας:<br />${params.url}</p>
  `);
  const text = `Επιβεβαιώστε το email σας στο ${BRAND}\n\nΓια να επιβεβαιώσετε ότι αυτό το email σας ανήκει, ανοίξτε τον παρακάτω σύνδεσμο:\n${params.url}\n\nΑν δεν αναγνωρίζετε αυτό το αίτημα, μπορείτε να αγνοήσετε αυτό το email με ασφάλεια.`;
  return { subject, html, text };
}

/** (b) Password-reset link — only sent for an already-verified account (see `lib/auth/config.ts`'s `sendResetPassword`, ADR-003 §5 bullet 4). */
export function passwordResetEmail(params: { url: string }): EmailContent {
  const subject = `Επαναφορά κωδικού πρόσβασης — ${BRAND}`;
  const html = wrapHtml(`
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Λάβαμε ένα αίτημα επαναφοράς κωδικού πρόσβασης για τον λογαριασμό σας. Πατήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό.</p>
    <p style="margin:0 0 24px;">
      <a href="${params.url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-size:14px;font-weight:600;">Ορισμός νέου κωδικού</a>
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#52525b;">Ο σύνδεσμος ισχύει για περιορισμένο χρονικό διάστημα. Αν δεν αναγνωρίζετε αυτό το αίτημα, ο κωδικός σας παραμένει ασφαλής — απλώς αγνοήστε αυτό το email.</p>
    <p style="margin:0;font-size:13px;color:#52525b;">Αν το κουμπί δεν λειτουργεί, αντιγράψτε αυτόν τον σύνδεσμο στον περιηγητή σας:<br />${params.url}</p>
  `);
  const text = `Επαναφορά κωδικού πρόσβασης — ${BRAND}\n\nΛάβαμε ένα αίτημα επαναφοράς κωδικού πρόσβασης για τον λογαριασμό σας. Ανοίξτε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό:\n${params.url}\n\nΟ σύνδεσμος ισχύει για περιορισμένο χρονικό διάστημα. Αν δεν αναγνωρίζετε αυτό το αίτημα, ο κωδικός σας παραμένει ασφαλής — απλώς αγνοήστε αυτό το email.`;
  return { subject, html, text };
}

/**
 * (c) "Someone tried to create an account with your email" notice — for
 * the existing-email sign-up case. Built for completeness per this task's
 * spec, but NOT currently wired into `lib/auth/config.ts`: Better Auth's
 * `onExistingUserSignUp` callback only fires when
 * `requireEmailVerification: true` or `autoSignIn: false`
 * (`node_modules/better-auth/.../api/routes/sign-up.mjs`), and ADR-003 §5
 * requires neither be set — see `lib/auth/config.ts`'s doc comment for the
 * full reachability finding. Kept here, unused, so wiring it up is a
 * one-line change if that ADR constraint is ever revisited.
 */
export function existingAccountSignUpNoticeEmail(): EmailContent {
  const subject = `Κάποιος προσπάθησε να δημιουργήσει λογαριασμό με το email σας — ${BRAND}`;
  const html = wrapHtml(`
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Κάποιος προσπάθησε να δημιουργήσει έναν νέο λογαριασμό ${BRAND} χρησιμοποιώντας αυτή τη διεύθυνση email. Υπάρχει ήδη λογαριασμός με αυτό το email.</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Αν ήσασταν εσείς, απλώς συνδεθείτε κανονικά. Αν δεν ήσασταν εσείς, δεν χρειάζεται να κάνετε τίποτα — ο λογαριασμός σας παραμένει ασφαλής.</p>
  `);
  const text = `Κάποιος προσπάθησε να δημιουργήσει λογαριασμό με το email σας — ${BRAND}\n\nΚάποιος προσπάθησε να δημιουργήσει έναν νέο λογαριασμό ${BRAND} χρησιμοποιώντας αυτή τη διεύθυνση email. Υπάρχει ήδη λογαριασμός με αυτό το email.\n\nΑν ήσασταν εσείς, απλώς συνδεθείτε κανονικά. Αν δεν ήσασταν εσείς, δεν χρειάζεται να κάνετε τίποτα — ο λογαριασμός σας παραμένει ασφαλής.`;
  return { subject, html, text };
}

/**
 * (d) Sent instead of a real reset link when `sendResetPassword` is
 * invoked for an account whose email isn't verified yet (ADR-003 §5 bullet
 * 4: "unverified email means password-reset won't work yet"). Points the
 * user at the in-app "resend verification email" action rather than
 * minting a second token here.
 */
export function passwordResetBlockedPendingVerificationEmail(): EmailContent {
  const subject = `Δεν είναι δυνατή η επαναφορά κωδικού ακόμα — ${BRAND}`;
  const html = wrapHtml(`
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Λάβαμε ένα αίτημα επαναφοράς κωδικού πρόσβασης για τον λογαριασμό σας, αλλά το email σας δεν έχει επιβεβαιωθεί ακόμα — για λόγους ασφαλείας, η επαναφορά κωδικού λειτουργεί μόνο για επιβεβαιωμένα email.</p>
    <p style="margin:0;font-size:14px;line-height:1.6;">Συνδεθείτε στην εφαρμογή και χρησιμοποιήστε την επιλογή «Επαναποστολή email επιβεβαίωσης» στο προφίλ σας. Μόλις επιβεβαιώσετε το email σας, θα μπορείτε να ζητήσετε νέα επαναφορά κωδικού.</p>
  `);
  const text = `Δεν είναι δυνατή η επαναφορά κωδικού ακόμα — ${BRAND}\n\nΛάβαμε ένα αίτημα επαναφοράς κωδικού πρόσβασης για τον λογαριασμό σας, αλλά το email σας δεν έχει επιβεβαιωθεί ακόμα — για λόγους ασφαλείας, η επαναφορά κωδικού λειτουργεί μόνο για επιβεβαιωμένα email.\n\nΣυνδεθείτε στην εφαρμογή και χρησιμοποιήστε την επιλογή «Επαναποστολή email επιβεβαίωσης» στο προφίλ σας. Μόλις επιβεβαιώσετε το email σας, θα μπορείτε να ζητήσετε νέα επαναφορά κωδικού.`;
  return { subject, html, text };
}
