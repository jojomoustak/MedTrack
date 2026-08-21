"use client";

import { createContext, useContext } from "react";

const CurrentProfileContext = createContext<string | null>(null);

export function CurrentProfileProvider({ profileId, children }: { profileId: string; children: React.ReactNode }) {
  return <CurrentProfileContext.Provider value={profileId}>{children}</CurrentProfileContext.Provider>;
}

/** Only valid inside the authenticated `(app)` layout, which redirects before rendering children if there's no session. */
export function useProfileId(): string {
  const profileId = useContext(CurrentProfileContext);
  if (!profileId) {
    throw new Error("useProfileId() called outside the authenticated app shell.");
  }
  return profileId;
}
