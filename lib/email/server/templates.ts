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
 *
 * Look (2026-10-15 redesign, the app's own identity): the logo and wordmark
 * on the app's cream background, a white card with a heading, the action
 * as a full-width emerald button like the app's primary buttons, then the
 * small print. Light only, like the app. Built the way email clients need
 * it: tables, inline styles, no web fonts or SVG, and the logo embedded as
 * an inline attachment rather than fetched from a server.
 */
import { LOGO_CONTENT_ID, LOGO_PNG_BASE64 } from "@/lib/email/server/logo-png";

/** Sent with the email and shown in place (`cid:`), never linked. */
export interface EmailAttachment {
  filename: string;
  /** Base64. */
  content: string;
  contentId: string;
  contentType: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

export const BRAND = "MedTrack";

/**
 * Both links last Better Auth's default hour (`resetPasswordTokenExpiresIn`
 * and `emailVerification.expiresIn`, neither set in `lib/auth/config.ts`).
 * Change this with them.
 */
const LINK_VALID_FOR = "1 ώρα";

const LOGO_ATTACHMENT: EmailAttachment = { filename: "medtrack.png", content: LOGO_PNG_BASE64, contentId: LOGO_CONTENT_ID, contentType: "image/png" };

// The app's palette (app/globals.css).
const COLOR = {
  cream: "#F8F5EE",
  card: "#FFFFFF",
  cardBorder: "#ECE6DA",
  divider: "#F0EBE1",
  heading: "#1C1917",
  body: "#44403C",
  muted: "#78716C",
  footer: "#57534E",
  accent: "#047857",
};
const FONT = "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${COLOR.body};">${html}</p>`;
}

interface Layout {
  /** The inbox's preview line, hidden in the email itself. */
  preheader: string;
  heading: string;
  /** Paragraphs, already HTML. */
  body: string[];
  action?: { label: string; url: string; note: string };
}

function layout({ preheader, heading, body, action }: Layout): string {
  const url = action ? escapeHtml(action.url) : "";
  const actionHtml = action
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
          <tr><td align="center" bgcolor="${COLOR.accent}" style="border-radius:16px;background:${COLOR.accent};">
            <a href="${url}" target="_blank" style="display:block;padding:16px 24px;font-family:${FONT};font-size:17px;font-weight:700;line-height:1.3;color:#FFFFFF;text-decoration:none;border-radius:16px;">${action.label}</a>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:${COLOR.muted};text-align:center;">${action.note}</p>
        <div style="margin:28px 0 20px;border-top:1px solid ${COLOR.divider};line-height:0;font-size:0;">&nbsp;</div>
        <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${COLOR.muted};">Αν το κουμπί δεν λειτουργεί, αντιγράψτε αυτόν τον σύνδεσμο στον περιηγητή σας:</p>
        <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${url}" target="_blank" style="color:${COLOR.accent};text-decoration:underline;">${url}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="el">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(heading)}</title>
    <style>
      :root { color-scheme: light only; }
      @media (max-width: 480px) { .card { padding: 28px 22px !important; } .outer { padding: 24px 12px !important; } }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${COLOR.cream};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.cream};">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.cream}" style="background:${COLOR.cream};">
      <tr><td class="outer" align="center" style="padding:40px 16px;font-family:${FONT};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr><td align="center" style="padding:0 0 24px;">
            <img src="cid:${LOGO_CONTENT_ID}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border:0;" />
            <div style="margin:6px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.3px;color:${COLOR.accent};">${BRAND}</div>
          </td></tr>
          <tr><td class="card" bgcolor="${COLOR.card}" style="background:${COLOR.card};border:1px solid ${COLOR.cardBorder};border-radius:20px;padding:36px 32px;">
            <h1 style="margin:0 0 14px;font-size:23px;font-weight:700;line-height:1.3;letter-spacing:-0.3px;color:${COLOR.heading};">${heading}</h1>
            ${body.map(paragraph).join("\n            ")}
            ${actionHtml}
          </td></tr>
          <tr><td align="center" style="padding:24px 12px 0;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${COLOR.footer};">Αυτό είναι ένα αυτόματο μήνυμα για τον λογαριασμό σας στο ${BRAND}.<br />Αν δεν το ζητήσατε εσείς, μπορείτε απλώς να το αγνοήσετε.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

const TEXT_FOOTER = `—\nΑυτό είναι ένα αυτόματο μήνυμα για τον λογαριασμό σας στο ${BRAND}. Αν δεν το ζητήσατε εσείς, μπορείτε απλώς να το αγνοήσετε.`;

/** (a) Email verification link — sent on every sign-up and on request (ADR-003 §5); the account can't be signed in to until it's opened. */
export function verificationEmail(params: { url: string }): EmailContent {
  const subject = `Επιβεβαιώστε το email σας στο ${BRAND}`;
  const html = layout({
    preheader: `Ένα πάτημα και ο λογαριασμός σας είναι έτοιμος. Ο σύνδεσμος ισχύει για ${LINK_VALID_FOR}.`,
    heading: "Επιβεβαιώστε το email σας",
    body: [
      "Πατήστε το παρακάτω κουμπί για να επιβεβαιώσετε ότι αυτό το email σας ανήκει. Ο λογαριασμός σας ενεργοποιείται αμέσως.",
      `Μετά γυρίστε στην εφαρμογή ${BRAND} για να συνεχίσετε.`,
      // Security review 2026-10-20: someone who registered this address first could get its owner to confirm it for them.
      `Αν δεν δημιουργήσατε εσείς τώρα λογαριασμό στο ${BRAND}, μην πατήσετε το κουμπί.`,
    ],
    action: { label: "Επιβεβαίωση email", url: params.url, note: `Ο σύνδεσμος ισχύει για ${LINK_VALID_FOR}.` },
  });
  const text = `Επιβεβαιώστε το email σας\n\nΑνοίξτε τον παρακάτω σύνδεσμο για να επιβεβαιώσετε ότι αυτό το email σας ανήκει. Ο λογαριασμός σας ενεργοποιείται αμέσως.\n\n${params.url}\n\nΟ σύνδεσμος ισχύει για ${LINK_VALID_FOR}. Μετά γυρίστε στην εφαρμογή ${BRAND} για να συνεχίσετε.\n\nΑν δεν δημιουργήσατε εσείς τώρα λογαριασμό στο ${BRAND}, μην ανοίξετε τον σύνδεσμο.\n\n${TEXT_FOOTER}`;
  return { subject, html, text, attachments: [LOGO_ATTACHMENT] };
}

/** (b) Password-reset link — for any account; using it also confirms the email (`lib/auth/config.ts`'s `onPasswordReset`). */
export function passwordResetEmail(params: { url: string }): EmailContent {
  const subject = `Επαναφορά κωδικού πρόσβασης — ${BRAND}`;
  const html = layout({
    preheader: `Ορίστε νέο κωδικό πρόσβασης. Ο σύνδεσμος ισχύει για ${LINK_VALID_FOR}.`,
    heading: "Ορίστε νέο κωδικό πρόσβασης",
    body: [
      `Λάβαμε αίτημα επαναφοράς του κωδικού πρόσβασης για τον λογαριασμό σας στο ${BRAND}. Πατήστε το παρακάτω κουμπί για να ορίσετε νέο κωδικό.`,
      "Αν δεν το ζητήσατε εσείς, ο κωδικός σας δεν αλλάζει: απλώς αγνοήστε αυτό το email.",
    ],
    action: { label: "Ορισμός νέου κωδικού", url: params.url, note: `Ο σύνδεσμος ισχύει για ${LINK_VALID_FOR}.` },
  });
  const text = `Ορίστε νέο κωδικό πρόσβασης\n\nΛάβαμε αίτημα επαναφοράς του κωδικού πρόσβασης για τον λογαριασμό σας στο ${BRAND}. Ανοίξτε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό:\n\n${params.url}\n\nΟ σύνδεσμος ισχύει για ${LINK_VALID_FOR}. Αν δεν το ζητήσατε εσείς, ο κωδικός σας δεν αλλάζει: απλώς αγνοήστε αυτό το email.\n\n${TEXT_FOOTER}`;
  return { subject, html, text, attachments: [LOGO_ATTACHMENT] };
}

/**
 * (c) "Someone tried to create an account with your email" notice — sent
 * instead of a verification link when a sign-up uses an email that already
 * has an account (`lib/auth/config.ts`'s `onExistingUserSignUp`). The app
 * shows that sign-up the same "check your email" screen as a new one, so
 * this is how the real owner finds out why.
 */
export function existingAccountSignUpNoticeEmail(): EmailContent {
  const subject = `Κάποιος προσπάθησε να δημιουργήσει λογαριασμό με το email σας — ${BRAND}`;
  const html = layout({
    preheader: "Υπάρχει ήδη λογαριασμός με αυτό το email.",
    heading: "Έχετε ήδη λογαριασμό",
    body: [
      `Κάποιος προσπάθησε να δημιουργήσει νέο λογαριασμό ${BRAND} με αυτή τη διεύθυνση email, αλλά υπάρχει ήδη λογαριασμός με αυτό το email.`,
      "Αν ήσασταν εσείς, απλώς συνδεθείτε με τον κωδικό που έχετε. Αν δεν τον θυμάστε, πατήστε «Ξεχάσατε τον κωδικό;» στην οθόνη σύνδεσης.",
      `Αν δεν δημιουργήσατε ποτέ εσείς λογαριασμό στο ${BRAND}, κάποιος άλλος μπορεί να χρησιμοποίησε τη διεύθυνσή σας. Πατήστε κι εσείς «Ξεχάσατε τον κωδικό;» και ορίστε δικό σας κωδικό: ο λογαριασμός περνά σε εσάς και όποιος ήταν συνδεδεμένος αποσυνδέεται.`,
      "Αν έχετε ήδη λογαριασμό και δεν ήσασταν εσείς, δεν χρειάζεται να κάνετε τίποτα: ο λογαριασμός σας παραμένει ασφαλής.",
    ],
  });
  const text = `Έχετε ήδη λογαριασμό\n\nΚάποιος προσπάθησε να δημιουργήσει νέο λογαριασμό ${BRAND} με αυτή τη διεύθυνση email, αλλά υπάρχει ήδη λογαριασμός με αυτό το email.\n\nΑν ήσασταν εσείς, απλώς συνδεθείτε με τον κωδικό που έχετε. Αν δεν τον θυμάστε, πατήστε «Ξεχάσατε τον κωδικό;» στην οθόνη σύνδεσης.\n\nΑν δεν δημιουργήσατε ποτέ εσείς λογαριασμό στο ${BRAND}, κάποιος άλλος μπορεί να χρησιμοποίησε τη διεύθυνσή σας. Πατήστε κι εσείς «Ξεχάσατε τον κωδικό;» και ορίστε δικό σας κωδικό: ο λογαριασμός περνά σε εσάς και όποιος ήταν συνδεδεμένος αποσυνδέεται.\n\nΑν έχετε ήδη λογαριασμό και δεν ήσασταν εσείς, δεν χρειάζεται να κάνετε τίποτα: ο λογαριασμός σας παραμένει ασφαλής.\n\n${TEXT_FOOTER}`;
  return { subject, html, text, attachments: [LOGO_ATTACHMENT] };
}

