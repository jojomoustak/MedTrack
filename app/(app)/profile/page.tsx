"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import { clearAllLocalProfileData, hasPendingLocalWork } from "@/lib/db-client/clear-local-profile-data";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

/**
 * Phase 3 §2.8 Profile/settings — most of it (accessibility,
 * notifications, Sync & Data detail, export) is later-phase UI; sign-out
 * is real and functional since it's needed to demo register/login end to
 * end. "Link Google account" (ADR-003 addendum A.5) is an authenticated
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

  async function handleSignOut() {
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
      <h1 className="text-xl font-semibold">Προφίλ</h1>
      {data?.user?.email && <p className="text-zinc-600 dark:text-zinc-400">{data.user.email}</p>}

      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Ρυθμίσεις, προσβασιμότητα, ειδοποιήσεις και κατάσταση συγχρονισμού έρχονται σύντομα.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Σύνδεση λογαριασμών</h2>
        <GoogleAuthButton mode="link" callbackURL="/profile" label="Σύνδεση λογαριασμού Google" />
      </section>

      <button
        type="button"
        onClick={handleSignOut}
        className="min-h-12 self-start rounded-full border border-zinc-300 px-5 py-3 font-medium dark:border-zinc-700"
      >
        Αποσύνδεση
      </button>

      <section className="mt-6 flex flex-col gap-2 rounded-lg border-2 border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
          <WarningIcon />
          <span className="font-medium">Μη αναστρέψιμη ενέργεια</span>
        </div>
        <Link href="/profile/delete" className="min-h-12 rounded-full bg-red-700 px-5 py-3 text-center font-medium text-white">
          Διαγραφή λογαριασμού / Διαγραφή δεδομένων υγείας
        </Link>
      </section>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M10 2 1 18h18L10 2Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 10 15Z" />
    </svg>
  );
}
