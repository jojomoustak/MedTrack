"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import { clearAllLocalProfileData, hasPendingLocalWork } from "@/lib/db-client/clear-local-profile-data";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { EmailVerificationBanner } from "@/components/profile/EmailVerificationBanner";
import { ReminderPermissionToggle } from "@/components/profile/ReminderPermissionToggle";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import { playSound } from "@/lib/sound/client/play-sound";

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-700 dark:text-stone-300">
      {children}
    </svg>
  );
}

const ROW = "flex min-h-16 w-full items-center gap-4 px-4 text-left text-[17px] font-medium text-stone-900 dark:text-stone-100";

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
 * - Data export (GDPR Art. 15/20) is a one-shot download.
 * - "Delete account / health data" (CLAUDE.md rule 9) stays visually
 *   distinct from routine rows — red, a warning icon AND explicit text,
 *   never color alone — and leads to the multi-step flow at
 *   `/profile/delete`.
 */
export default function ProfilePage() {
  const { data } = authClient.useSession();
  const router = useRouter();
  const profileId = useProfileId();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    playSound("button");
    setExportError(null);
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("export request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medtrack-export-${profileId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Η λήψη απέτυχε. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSignOut() {
    playSound("button");
    // Cleared locally first, unconditionally: this is what
    // useCurrentProfile's offline fallback reads, so if the signOut()
    // network call below fails (offline right after tapping this), a
    // stale cached profile must not be left behind to render this user's
    // data to whoever opens the app next on this device (security review,
    // 2026-08-29 — see clearCachedProfile's doc). This alone gates the app
    // shell from rendering again without a fresh login; wiping Dexie below
    // is a second, best-effort layer.
    clearCachedProfile();

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
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- the account's own Google profile photo URL; not worth routing through image optimization
          <img src={image} alt="" referrerPolicy="no-referrer" className="mb-2 size-24 rounded-full object-cover shadow-[0_2px_10px_rgba(28,25,23,.12)]" />
        ) : (
          <div aria-hidden="true" className="mb-2 flex size-24 items-center justify-center rounded-full bg-accent-100 text-4xl font-bold text-accent-800 dark:bg-accent-900/40 dark:text-accent-400">
            {initial}
          </div>
        )}
        <h1 className="text-[24px] font-bold tracking-tight text-stone-900 dark:text-stone-50">{name || "Προφίλ"}</h1>
        {email && <p className="text-base text-stone-600 dark:text-stone-400">{email}</p>}
      </div>

      <EmailVerificationBanner email={email ?? null} />

      <div className="surface-card p-4">
        <ReminderPermissionToggle profileId={profileId} />
      </div>

      <nav aria-label="Ρυθμίσεις" className="surface-card divide-y divide-stone-100 overflow-hidden dark:divide-stone-800">
        <button type="button" onClick={handleExport} disabled={exporting} aria-busy={exporting} className={`${ROW} disabled:opacity-60`}>
          <RowIcon>
            <path d="M12 4v11m0 0-4-4m4 4 4-4" />
            <path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
          </RowIcon>
          <span className="flex-1">{exporting ? "Λήψη…" : "Λήψη των δεδομένων μου"}</span>
          <ChevronIcon />
        </button>
        <Link href="/privacy" onClick={() => playSound("button")} className={ROW}>
          <RowIcon>
            <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6Z" />
            <path d="m9.5 12 2 2 3.5-4" />
          </RowIcon>
          <span className="flex-1">Πολιτική απορρήτου</span>
          <ChevronIcon />
        </Link>
      </nav>
      {exportError && (
        <p role="alert" className="-mt-2 text-[15px] font-medium text-red-700 dark:text-red-400">
          {exportError}
        </p>
      )}

      <section className="surface-card flex flex-col gap-3 p-4" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-[17px] font-semibold text-stone-900 dark:text-stone-100">
          Λογαριασμός
        </h2>
        <GoogleAuthButton mode="link" callbackURL="/profile" label="Σύνδεση λογαριασμού Google" />
      </section>

      <button
        type="button"
        onClick={handleSignOut}
        className="flex min-h-16 w-full items-center gap-4 rounded-2xl bg-red-50 px-4 text-left text-[17px] font-semibold text-red-700 transition-transform active:scale-[0.99] dark:bg-red-950/50 dark:text-red-300"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
          <path d="M10 8 6 12l4 4M6 12h10" />
        </svg>
        Αποσύνδεση
      </button>

      <Link
        href="/profile/delete"
        onClick={() => playSound("button")}
        className="flex min-h-16 items-center gap-4 rounded-2xl border-2 border-red-300 px-4 py-3 text-red-800 dark:border-red-800 dark:text-red-300"
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
