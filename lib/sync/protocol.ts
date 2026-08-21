/**
 * Wire shapes for the sync API (`app/api/sync/mutations`,
 * `app/api/sync/changes`) — shared between client and server so the
 * outbox worker and the route handlers agree on exactly one contract.
 * Deliberately independent of `OutboxEntry` (the client's local storage
 * shape): this is what crosses the network, which is a narrower,
 * server-relevant subset.
 */
import { z } from "zod";
import { clientMutationIdSchema, uuidSchema } from "@/lib/validation/common";
import type { SyncEntityType } from "@/lib/domain/sync";

export const syncMutationRequestSchema = z.object({
  clientMutationId: clientMutationIdSchema,
  entityType: z.enum(["userPreferences", "purchaseList", "userMedication"] as const satisfies readonly SyncEntityType[]),
  entityId: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().positive().optional(),
});
export type SyncMutationRequest = z.infer<typeof syncMutationRequestSchema>;

export const syncMutationsRequestBodySchema = z.object({
  mutations: z.array(syncMutationRequestSchema).min(1).max(50),
});

export type SyncMutationOutcome = "applied" | "conflict" | "rejected" | "account_deleted";

export interface SyncMutationResult {
  clientMutationId: string;
  result: SyncMutationOutcome;
  /** Current server-side record, present for `applied` and `conflict` so the client can reconcile without a second round trip. */
  serverRecord?: Record<string, unknown>;
  error?: string;
}

export interface SyncMutationsResponseBody {
  results: SyncMutationResult[];
}

export const syncChangesQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export interface SyncChangeEntry {
  id: number;
  entityType: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  serverVersion: number | null;
  occurredAt: string;
  /** Hydrated full record — only populated for entity types this phase wires a pull-side reader for (see `lib/sync/server/changes.ts`); otherwise the client re-fetches later once that entity type has a repository. */
  record?: Record<string, unknown>;
}

export interface SyncChangesResponseBody {
  changes: SyncChangeEntry[];
  /** The cursor to pass as `?cursor=` on the next pull; equals the last returned change's `id`, or the input cursor unchanged if nothing new. */
  nextCursor: number;
}

/** UUID validators reused so the sync request schema matches domain conventions. */
export { uuidSchema };
