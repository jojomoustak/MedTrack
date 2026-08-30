"use client";

import { createContext, useContext } from "react";

interface CurrentProfileValue {
  profileId: string;
  accountId: string;
}

const CurrentProfileContext = createContext<CurrentProfileValue | null>(null);

export function CurrentProfileProvider({ profileId, accountId, children }: { profileId: string; accountId: string; children: React.ReactNode }) {
  return <CurrentProfileContext.Provider value={{ profileId, accountId }}>{children}</CurrentProfileContext.Provider>;
}

/** Only valid inside the authenticated `(app)` layout, which redirects before rendering children if there's no session. */
export function useProfileId(): string {
  const value = useContext(CurrentProfileContext);
  if (!value) {
    throw new Error("useProfileId() called outside the authenticated app shell.");
  }
  return value.profileId;
}

/** Phase 10: Snooze needs `UserPreferencesRecord.reminderDefaultSnoozeMinutes`, which is account-scoped, not profile-scoped (Phase 2 §2.3). */
export function useAccountId(): string {
  const value = useContext(CurrentProfileContext);
  if (!value) {
    throw new Error("useAccountId() called outside the authenticated app shell.");
  }
  return value.accountId;
}
