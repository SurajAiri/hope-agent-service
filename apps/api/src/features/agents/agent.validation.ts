import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
});

/**
 * Schema for firing an agent run (fire-and-forget, sync, or stream).
 * Mirrors the Python FastAPI SessionRequest model.
 */
export const agentRunSchema = z.object({
  agent_id: z.string().default("echo"),
  messages: z.array(messageSchema).min(1, "At least one message is required"),
  thread_id: z.string().optional(),
  session_id: z.string().optional(),
  webhook: z.boolean().default(true),
  webhook_config: z.any().optional().nullable(),
  extras: z.record(z.string(), z.any()).default({}),
});

/**
 * Schema for submitting HITL (human-in-the-loop) responses.
 * The body is the full action list returned by GET .../hitl, with
 * 'response' fields filled in for each completed action.
 */
export const hitlResponseSchema = z.array(z.record(z.string(), z.unknown()));

export type AgentRunInput = z.infer<typeof agentRunSchema>;
export type HitlResponseInput = z.infer<typeof hitlResponseSchema>;
