import { eq } from "drizzle-orm";
import { getEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/**
 * A gift (owner's request, 2026-10-20): hearts float up when one person
 * opens the app (`components/gift/GiftHearts.tsx`). Who gets them is the
 * `GIFT_HEARTS_EMAILS` setting, never the code: the repository is public,
 * so an email (or even a hash of one) written here would be published.
 * The app only ever learns a yes for the signed-in account itself.
 */

/** The emails in the setting, trimmed and lowercased. */
export function parseGiftEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function accountEmail(accountId: string): Promise<string | null> {
  const [row] = await getDb().select({ email: schema.account.email }).from(schema.account).where(eq(schema.account.id, accountId)).limit(1);
  return row?.email ?? null;
}

export interface GiftDeps {
  emails?: Set<string>;
  lookupEmail?: (accountId: string) => Promise<string | null>;
}

/** Whether this account gets the hearts. No setting, no lookup. Never throws: a failed lookup is just no hearts. */
export async function accountGetsHearts(accountId: string, deps: GiftDeps = {}): Promise<boolean> {
  try {
    const emails = deps.emails ?? parseGiftEmails(getEnv().GIFT_HEARTS_EMAILS);
    if (emails.size === 0) return false;
    const email = await (deps.lookupEmail ?? accountEmail)(accountId);
    return email !== null && emails.has(email.trim().toLowerCase());
  } catch {
    return false;
  }
}
