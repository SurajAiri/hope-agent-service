import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
});

/**
 * Shared validation schema for all /api/v1/run/* developer endpoints.
 * Mirrors the agent run schema but without organizationId (resolved from token).
 */
export const runSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  messages: z
    .array(messageSchema)
    .min(1, "At least one message is required"),
  thread_id: z.string().optional(),
  session_id: z.string().optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});

export const hitlResponseSchema = z.array(z.record(z.string(), z.unknown()));
