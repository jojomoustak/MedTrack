"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

/**
 * Phase 3 §2.8 Profile/settings — most of it (accessibility,
 * notifications, Sync & Data detail, export, deletion) is later-phase UI;
 * sign-out is real and functional since it's needed to demo register/login
 * end to end. "Link Google account" (ADR-003 addendum A.5) is the first
 * real content beyond sign-out: an authenticated `linkSocial()` call,
 * requiring an active `account_session` (same authorization model as
 * every other authenticated mutation in this app) — the *only* way a
 * Google identity can be attached to an already-existing account, per the
 * addendum's "safest tier" decision (no implicit/auto-linking, ever).
 */
export default function ProfilePage() {
  const { data } = authClient.useSession();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.replace("/welcome");
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Προφίλ</h1>
      {data?.user?.email && <p className="text-zinc-600 dark:text-zinc-400">{data.user.email}</p>}

      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Ρυθμίσεις, προσβασιμότητα, ειδοποιήσεις, κατάσταση συγχρονισμού και διαγραφή λογαριασμού έρχονται σύντομα.
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
    </div>
  );
}
