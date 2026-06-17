import { z } from "zod";

export const createUserSchema = z.object({
  email: z.email(),

  password: z.string().min(8).max(100),

  firstName: z.string().trim().min(2).max(255),

  lastName: z.string().trim().min(2).max(255),
});

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(2).max(255).optional(),

  lastName: z.string().trim().min(2).max(255).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
