import { z } from "zod";
import { uuidSchema } from "@/lib/validation/common";
import { RECENTLY_USED_INTERACTION_TYPES } from "@/lib/domain/recently-used-event";

/** No `clientMutationId` field (`lib/domain/recently-used-event.ts`'s doc explains why) — the mutation envelope still carries one, this is just the entity payload. */
export const createRecentlyUsedEventSchema = z.object({
  id: uuidSchema,
  userMedicationId: uuidSchema,
  interactionType: z.enum(RECENTLY_USED_INTERACTION_TYPES),
  occurredAt: z.iso.datetime({ offset: true }),
});

export type CreateRecentlyUsedEventInput = z.infer<typeof createRecentlyUsedEventSchema>;
