import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});
