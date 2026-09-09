import { z } from "zod";
import { clientMutationIdSchema, uuidSchema } from "@/lib/validation/common";

/**
 * The mutation payload for a favorite toggle — always an upsert (Phase
 * 2 §2.10's LWW-on-`clientUpdatedAt` conflict strategy), so create and
 * re-toggle share one schema, same convention as `userPreferences`'s
 * single upsert shape (`lib/sync/server/mutations.ts`'s
 * `applyUserPreferencesMutation`).
 */
export const toggleFavoriteSchema = z.object({
  id: uuidSchema,
  clientMutationId: clientMutationIdSchema,
  userMedicationId: uuidSchema,
  removedAt: z.iso.datetime({ offset: true }).nullable(),
  clientUpdatedAt: z.iso.datetime({ offset: true }),
});

export type ToggleFavoriteInput = z.infer<typeof toggleFavoriteSchema>;
