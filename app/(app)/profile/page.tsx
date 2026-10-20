"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import { clearAllLocalProfileData, hasPendingLocalWork } from "@/lib/db-client/clear-local-profile-data";
import { cancelAllNativeReminders } from "@/lib/reminders/client/native-reminder-sync";
import { getDefaultMobilePlatform } from "@/lib/platform/get-mobile-platform";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { Button } from "@/components/ui/Button";
import { EmailVerificationBanner } from "@/components/profile/EmailVerificationBanner";
import { ProfilePhoto } from "@/components/profile/ProfilePhoto";
import { ReminderPermissionToggle } from "@/components/profile/ReminderPermissionToggle";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import { playSound } from "@/lib/sound/client/play-sound";

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-700">
      {children}
    </svg>
  );
}

const ROW = "flex min-h-16 w-full items-center gap-4 px-4 text-left text-[17px] font-medium text-stone-900";

/**
 * Phase 3 §2.8 Profile/settings, laid out after the reference mockup's
 * screen 21: avatar, name and email, then a menu. Only real features
 * appear — the reference's "Health information" and "Help & Support" rows
 * have no screen behind them in this app, and a row that goes nowhere is
 * worse than an honest absence.
 *
 * - Reminder permission (Phase 11) is a contextual request, not a stored
 *   preference (see `ReminderPermissionToggle`).
 * - "Link Google account" (ADR-003 addendum A.5) is an authenticated
 *   `linkSocial()` — the only way a Google identity can be attached to an
 *   existing account.
 * - "Report for the doctor" (`/profile/report`) is a PDF made on the phone.
 *   The JSON data download that used to sit beside it was removed at the
 *   owner's request (2026-10-17); `/api/account/export` stays for when a
 *   self-service GDPR export (Art. 15/20) is wanted again.
 * - "Delete account / health data" (CLAUDE.md rule 9) stays visually
 *   distinct from routine rows — red, a warning icon AND explicit text,
 *   never color alone — and leads to the multi-step flow at
 *   `/profile/delete`.
 */
export default function ProfilePage() {
  const { data } = authClient.useSession();
  const router = useRouter();
  const profileId = useProfileId();
  /** Changes not sent yet: signing out asks first (2026-10-16). */
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  /**
   * Changes not sent yet stay on this phone after signing out (see below)
   * and go out once this person signs in again, but nothing used to say so:
   * now they're told first, and choose (owner's request, 2026-10-16).
   */
  async function requestSignOut() {
    playSound("button");
    if (await hasPendingLocalWork()) {
      setConfirmingSignOut(true);
      return;
    }
    await handleSignOut();
  }

  async function handleSignOut() {
    // Cleared locally first, unconditionally: this is what
    // useCurrentProfile's offline fallback reads, so if the signOut()
    // network call below fails (offline right after tapping this), a
    // stale cached profile must not be left behind to render this user's
    // data to whoever opens the app next on this device (security review,
    // 2026-08-29 — see clearCachedProfile's doc). This alone gates the app
    // shell from rendering again without a fresh login; wiping Dexie below
    // is a second, best-effort layer.
    clearCachedProfile();

    // Reminders live natively and kept firing after signing out, showing this
    // person's medicines (owner-reported, 2026-10-16): stop every one on this
    // phone. Local, so it works offline too; never holds signing out up.
    await cancelAllNativeReminders(getDefaultMobilePlatform());

    // Offline audit (2026-08-29): wiping local data unconditionally would
    // silently discard any not-yet-synced write — and once signOut()
    // succeeds, nothing still queued could ever be delivered. Only wipe
    // when nothing is at risk (see hasPendingLocalWork's doc).
    if (!(await hasPendingLocalWork())) {
      await clearAllLocalProfileData();
    }

    try {
      await authClient.signOut();
    } catch {
      // Best-effort: the local state above already stopped this device
      // from showing this user's data.
    }
    router.replace("/welcome");
  }

  const name = data?.user?.name?.trim();
  const email = data?.user?.email;
  const image = data?.user?.image;
  const initial = (name?.charAt(0) || email?.charAt(0) || "?").toUpperCase();

  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <ProfilePhoto profileId={profileId} fallbackImage={image ?? null} initial={initial} />
        <h1 className="text-[24px] font-bold tracking-tight text-stone-900">{name || "Προφίλ"}</h1>
        {email && <p className="text-base text-stone-600">{email}</p>}
      </div>

      <EmailVerificationBanner email={email ?? null} />

      <div className="surface-card p-4">
        <ReminderPermissionToggle profileId={profileId} />
      </div>

      <nav aria-label="Ρυθμίσεις" className="surface-card divide-y divide-stone-100 overflow-hidden">
        <Link href="/profile/report" onClick={() => playSound("button")} className={ROW}>
          <RowIcon>
            <path d="M6.5 3.5h7l4 4V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5Z" />
            <path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" />
          </RowIcon>
          <span className="flex-1">Αναφορά για τον γιατρό</span>
          <ChevronIcon />
        </Link>
        <Link href="/privacy" onClick={() => playSound("button")} className={ROW}>
          <RowIcon>
            <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6Z" />
            <path d="m9.5 12 2 2 3.5-4" />
          </RowIcon>
          <span className="flex-1">Πολιτική απορρήτου</span>
          <ChevronIcon />
        </Link>
      </nav>

      <section className="surface-card flex flex-col gap-3 p-4" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-[17px] font-semibold text-stone-900">
          Λογαριασμός
        </h2>
        <GoogleAuthButton mode="link" callbackURL="/profile" label="Σύνδεση λογαριασμού Google" />
      </section>

      {confirmingSignOut ? (
        <section className="surface-card flex flex-col gap-3 p-4" aria-labelledby="unsent-heading">
          <h2 id="unsent-heading" className="text-[17px] font-semibold text-stone-900">
            Κάποιες αλλαγές σας δεν έχουν σταλεί ακόμα
          </h2>
          <p className="text-[15px] leading-relaxed text-stone-700">
            Αν αποσυνδεθείτε τώρα, θα μείνουν σε αυτό το κινητό, χωρίς να τις βλέπει κανείς άλλος, και θα σταλούν μόλις ξανασυνδεθείτε με αυτόν τον λογαριασμό. Αν συνδεθείτε πρώτα στο διαδίκτυο, θα σταλούν σε λίγα δευτερόλεπτα.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                playSound("button");
                setConfirmingSignOut(false);
              }}
            >
              Πίσω
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                playSound("button");
                void handleSignOut();
              }}
            >
              Αποσύνδεση
            </Button>
          </div>
        </section>
      ) : (
      <button
        type="button"
        onClick={() => void requestSignOut()}
        className="flex min-h-16 w-full items-center gap-4 rounded-2xl bg-red-50 px-4 text-left text-[17px] font-semibold text-red-700 transition-transform active:scale-[0.99]"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
          <path d="M10 8 6 12l4 4M6 12h10" />
        </svg>
        Αποσύνδεση
      </button>
      )}

      <Link
        href="/profile/delete"
        onClick={() => playSound("button")}
        className="flex min-h-16 items-center gap-4 rounded-2xl border-2 border-red-300 px-4 py-3 text-red-800"
      >
        <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" focusable="false" fill="currentColor" className="shrink-0">
          <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
        </svg>
        <span className="flex-1">
          <span className="block text-[17px] font-semibold">Διαγραφή λογαριασμού και δεδομένων υγείας</span>
          <span className="block text-sm">Μη αναστρέψιμη ενέργεια</span>
        </span>
        <ChevronIcon />
      </Link>
    </div>
  );
}
