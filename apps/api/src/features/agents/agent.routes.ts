import { Router } from "express";
import { AgentController } from "./agent.controller";
import { agentAuthMiddleware } from "./agent.middleware";
import { validate } from "@/middlewares/validate.middleware";
import { agentRunSchema, hitlResponseSchema } from "./agent.validation";

/**
 * Agent proxy routes — mounted at:
 *   /api/v1/organizations/:organizationId/agents
 *
 * Authentication (both modes supported, checked in agentAuthMiddleware):
 *   - Bearer <JWT>   → browser / web-app clients
 *   - X-API-Key: <raw org API key>  → programmatic / SDK clients
 */
const router = Router({ mergeParams: true }); // mergeParams exposes :organizationId
const agentController = new AgentController();

// All agent routes require authentication
router.use(agentAuthMiddleware);

// ── Agent listing ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents:
 *   get:
 *     summary: List all available agents
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of registered agent IDs
 *       401:
 *         description: Unauthorized
 *       502:
 *         description: GenAI service unavailable
 */
router.get("/", agentController.listAgents);

// ── Agent run triggers ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/run:
 *   post:
 *     summary: Fire-and-forget agent run (returns session_id immediately)
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               agent_id:
 *                 type: string
 *                 default: echo
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, tool]
 *                     content:
 *                       type: string
 *               thread_id:
 *                 type: string
 *               session_id:
 *                 type: string
 *               webhook:
 *                 type: boolean
 *               extras:
 *                 type: object
 *     responses:
 *       202:
 *         description: Agent run queued — poll GET /session/{sessionId}/status for progress
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/run", validate(agentRunSchema), agentController.triggerRun);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/run/sync:
 *   post:
 *     summary: Blocking agent run (waits for completion before responding)
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgentRunRequest'
 *     responses:
 *       200:
 *         description: Agent run result
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/run/sync",
  validate(agentRunSchema),
  agentController.triggerRunSync,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/run/stream:
 *   post:
 *     summary: Streaming agent run (Server-Sent Events)
 *     description: |
 *       Streams token-by-token agent output as SSE events.
 *       Connect with EventSource or any SSE client.
 *       Event format: `event: message\ndata: {"content":"...","is_final":false}\n\n`
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgentRunRequest'
 *     responses:
 *       200:
 *         description: SSE stream (text/event-stream)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/run/stream",
  validate(agentRunSchema),
  agentController.triggerRunStream,
);

// ── Session management ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/session/{sessionId}/status:
 *   get:
 *     summary: Poll session status
 *     tags: [Agent Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session status (queue | wip | done | fail | hitl)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.get(
  "/session/:sessionId/status",
  agentController.getSessionStatus,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/session/{sessionId}:
 *   get:
 *     summary: Get session result
 *     tags: [Agent Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full session result and state
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.get("/session/:sessionId", agentController.getSessionResult);

// ── HITL (Human-in-the-Loop) ───────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/session/{sessionId}/hitl:
 *   get:
 *     summary: Get pending HITL actions for a paused run
 *     tags: [Agent Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of pending HITL actions
 *       401:
 *         description: Unauthorized
 */
router.get("/session/:sessionId/hitl", agentController.getHitlActions);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/agents/session/{sessionId}/hitl:
 *   post:
 *     summary: Submit human responses to resume a paused HITL run
 *     description: |
 *       Send the full action list (from GET .../hitl) with 'response' fields
 *       filled in on the completed actions. This re-triggers the paused run.
 *     tags: [Agent Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       200:
 *         description: HITL response recorded, run will resume
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/session/:sessionId/hitl",
  validate(hitlResponseSchema),
  agentController.submitHitlResponse,
);

export default router;
