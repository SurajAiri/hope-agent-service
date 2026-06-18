import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
});
