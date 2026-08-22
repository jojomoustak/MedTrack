/**
 * Pseudonymizes an `account.id` for `deleted_profile_registry`/
 * `account_deletion_audit`'s `account_id_hash` column (Phase 2 §4,
 * CLAUDE.md rule 9): `deleted_profile_registry` outlives the account it
 * describes on purpose (no FK — it must keep rejecting late sync traffic
 * after everything else is gone), so it can never hold the raw
 * `account_id`, only a non-reversible derivative.
 *
 * Same construction as `account_session.ip_hash`
 * (HMAC-SHA256(value, server-side pepper), never a bare hash — ADR-003
 * "Additional findings": an unsalted hash of a low-entropy value is
 * brute-forceable, so "hashed" alone isn't real anonymization). An
 * account id is a random UUID (high entropy), so a bare hash would
 * already be practically non-reversible here — this is applied anyway
 * for consistency with the one HMAC-pepper pattern this project has
 * already established, not because a concrete weakness was found.
 *
 * A DEDICATED pepper (`ACCOUNT_ID_HASH_PEPPER`), not `IP_HASH_PEPPER`
 * reused — mixing two different HMAC purposes under one key is avoidable
 * here at negligible cost, so it's avoided. Flagged for
 * `security-privacy-reviewer` to confirm as the right call (see the
 * account-deletion report), same as every other reviewer-owned decision
 * in this codebase.
 */
import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/config/env";

export function hashAccountId(accountId: string): string {
  const { ACCOUNT_ID_HASH_PEPPER } = getEnv();
  return createHmac("sha256", ACCOUNT_ID_HASH_PEPPER).update(accountId, "utf8").digest("hex");
}
