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
  // Arbitrary first-run state for the agent — only consulted on the first
  // run of a session (see agent_sdk.input_validator on the GenAI side).
  initial_state: z.record(z.string(), z.unknown()).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for submitting HITL (human-in-the-loop) responses.
 * JUST the answer(s) — action_id + response — not the full action list.
 */
const hitlResponseItemSchema = z.object({
  action_id: z.string().min(1, "action_id is required"),
  response: z.unknown(),
});

export const hitlResponseSchema = z.array(hitlResponseItemSchema).min(1);
