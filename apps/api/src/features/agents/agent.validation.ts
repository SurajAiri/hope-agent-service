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
  // Arbitrary first-run state for the agent (e.g. domain fields a LangGraph
  // state schema needs beyond `messages`). Only consulted on the first run
  // of a session — see agent_sdk.agent.BaseAgent.validate_input /
  // agent_sdk.input_validator on the GenAI side. Ignored on resume.
  initial_state: z.record(z.string(), z.any()).default({}),
  extras: z.record(z.string(), z.any()).default({}),
});

/**
 * Schema for submitting HITL (human-in-the-loop) responses.
 * The body is JUST the answer(s) — action_id + response for whichever
 * pending action(s) a human just answered (mirrors agent_sdk.hitl.
 * HitlResponseInput on the GenAI side), NOT the full action list.
 */
const hitlResponseItemSchema = z.object({
  action_id: z.string().min(1, "action_id is required"),
  response: z.unknown(),
});

export const hitlResponseSchema = z.array(hitlResponseItemSchema).min(1);

export type AgentRunInput = z.infer<typeof agentRunSchema>;
export type HitlResponseInput = z.infer<typeof hitlResponseSchema>;
