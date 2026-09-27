"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import { clearAllLocalProfileData, hasPendingLocalWork } from "@/lib/db-client/clear-local-profile-data";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { EmailVerificationBanner } from "@/components/profile/EmailVerificationBanner";
import { ReminderPermissionToggle } from "@/components/profile/ReminderPermissionToggle";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { Card, CardLink } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";

/**
 * Phase 3 §2.8 Profile/settings — most of it (accessibility, Sync & Data
 * detail, export) is later-phase UI; sign-out is real and functional
 * since it's needed to demo register/login end to end. Reminder
 * notification permission (Phase 11, `ReminderPermissionToggle`) is real
 * too — a contextual request, not a stored preference (see that
 * component's doc). "Link Google account" (ADR-003 addendum A.5) is an authenticated
 * `linkSocial()` call, requiring an active `account_session` (same
 * authorization model as every other authenticated mutation in this app)
 * — the *only* way a Google identity can be attached to an existing
 * account, per the addendum's "safest tier" decision (no implicit
 * linking, ever). "Delete Account / Delete My Health Data" (CLAUDE.md
 * rule 9, Phase 3 §2.9) is deliberately its own separated section at the
 * bottom, visually distinct (red border/background, warning icon PLUS
 * explicit label text — never color alone) rather than styled like a
 * normal settings row, so it can never be mistaken for routine
 * navigation — the actual multi-step flow lives at `/profile/delete`
 * (`components/account/DeleteAccountFlow.tsx`).
 */
export default function ProfilePage() {
  const { data } = authClient.useSession();
  const router = useRouter();
  const profileId = useProfileId();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // GDPR Art. 15/20 (security review, Phase 15 Hardening, 2026-09-15) — a
  // plain download rather than a new route/screen: this is a one-shot
  // fetch-and-save action, not a flow with steps.
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
    // 2026-08-29 -- see the doc comment on clearCachedProfile). This
    // alone is what actually gates the app shell from ever rendering
    // again without a fresh login (see use-current-profile.ts) --
    // wiping Dexie below is a second, best-effort layer on top of that,
    // not the thing doing the real work.
    clearCachedProfile();

    // Offline audit (2026-08-29): wiping local medication/dose/etc. data
    // here unconditionally would silently discard any not-yet-synced
    // local write -- and once signOut() below succeeds, the session
    // cookie every sync call depends on is gone, so anything still
    // queued could NEVER be delivered anyway. Only wipe when nothing is
    // actually at risk of being lost (see hasPendingLocalWork's doc).
    if (!(await hasPendingLocalWork())) {
      await clearAllLocalProfileData();
    }

    try {
      await authClient.signOut();
    } catch {
      // Best-effort: the server-side session cookie may not get cleared
      // until the next successful request, but the local state above
      // already stopped this device from showing this user's data.
    }
    router.replace("/welcome");
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3.5">
        <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-100 text-2xl font-bold text-accent-800 dark:bg-accent-900/40 dark:text-accent-400">
          {(data?.user?.name?.trim().charAt(0) || data?.user?.email?.charAt(0) || "?").toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{data?.user?.name?.trim() || "Προφίλ"}</h1>
          {data?.user?.email && <p className="text-sm text-stone-600 dark:text-stone-400">{data.user.email}</p>}
        </div>
      </div>

      <EmailVerificationBanner email={data?.user?.email ?? null} />

      {/* UX feedback (2026-09-22): flat, ungrouped rows read as an
          unfinished checklist rather than a real settings screen — each
          topic now sits in its own card, the same shared `Card` surface
          every list/detail screen uses, so this screen finally looks like
          it belongs to the same app. */}
      <Card>
        <ReminderPermissionToggle profileId={profileId} />
      </Card>

      <Card as="section" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Λογαριασμός</h2>
        <GoogleAuthButton mode="link" callbackURL="/profile" label="Σύνδεση λογαριασμού Google" />
        {/* Design pass (2026-09-27): demoted from a bordered button to
            text-only — sign-out is a routine, low-stakes action that
            shouldn't visually compete with "Σύνδεση λογαριασμού Google"
            for attention in the same card (button-hierarchy audit). */}
        <Button variant="tertiary" onClick={handleSignOut} className="self-start px-0">
          Αποσύνδεση
        </Button>
      </Card>

      <Card as="section" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">Τα δεδομένα μου</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Κατεβάστε ένα αντίγραφο όλων των δεδομένων του λογαριασμού σας — φάρμακα, προγράμματα, δόσεις, απόθεμα και λίστες.
        </p>
        {exportError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {exportError}
          </p>
        )}
        <Button variant="tertiary" onClick={handleExport} disabled={exporting} aria-busy={exporting} className="self-start px-0 text-accent-700 dark:text-accent-400">
          {exporting ? "Λήψη…" : "Λήψη των δεδομένων μου"}
        </Button>
      </Card>

      {/* Design pass (2026-09-28, reference mockup comparison): the
          reference's Profile is a real settings menu (Account/
          Notifications/Health information/Privacy/Help & Support) — this
          app already has a real Privacy page (`/privacy`) that was never
          actually linked from Profile until now. "Health information" and
          "Help & Support" are deliberately NOT added here: neither
          corresponds to any real screen or feature in this app, and a
          settings row that goes nowhere is worse than one that's honestly
          absent. */}
      <CardLink href="/privacy" onClick={() => playSound("button")} className="justify-between">
        <span className="font-medium">Πολιτική Απορρήτου</span>
        <ChevronRightIcon />
      </CardLink>

      <section className="flex flex-col gap-2 rounded-2xl border-2 border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
          <WarningIcon />
          <span className="font-medium">Μη αναστρέψιμη ενέργεια</span>
        </div>
        <ButtonLink href="/profile/delete" variant="danger" fullWidth className="text-center">
          Διαγραφή λογαριασμού / Διαγραφή δεδομένων υγείας
        </ButtonLink>
      </section>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-400">
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
    </svg>
  );
}
