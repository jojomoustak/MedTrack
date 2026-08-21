import { z } from "zod";

/** GET /api/catalog/search?q=&limit=&offset= */
export const catalogSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Πληκτρολογήστε τουλάχιστον 2 χαρακτήρες.")
    .max(100),
  limit: z.coerce.number().int().positive().max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;
