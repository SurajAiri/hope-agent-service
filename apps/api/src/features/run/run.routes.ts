import { Router } from "express";
import { RunController } from "./run.controller";
import { apiTokenMiddleware } from "./run.middleware";
import { validate } from "@/middlewares/validate.middleware";
import { runSchema } from "./run.validation";

/**
 * Flat developer run routes — mounted at: /api/v1/run
 *
 * Authentication: X-Hope-Token header (org API token)
 * The organizationId is resolved from the token — not in the URL.
 *
 * These endpoints are the primary integration surface for developers.
 * The browser playground continues to use the org-scoped JWT routes.
 */
const router = Router();
const runController = new RunController();

router.use(apiTokenMiddleware);

/**
 * @swagger
 * /api/v1/run:
 *   post:
 *     summary: "[Developer] Fire-and-forget agent run"
 *     description: |
 *       Queues an agent run and returns a `session_id` immediately.
 *       Authenticate with your API token in the `X-Hope-Token` header.
 *       The organization is resolved from the token — no org ID in the URL.
 *     tags: [Developer API]
 *     security:
 *       - hopeToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agent_id, messages]
 *             properties:
 *               agent_id:
 *                 type: string
 *                 example: my-agent
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [user, assistant, tool] }
 *                     content: { type: string }
 *               thread_id:
 *                 type: string
 *               extras:
 *                 type: object
 *     responses:
 *       202:
 *         description: Run queued — poll the session status endpoint for progress
 *       401:
 *         description: Missing or invalid X-Hope-Token
 */
router.post("/", validate(runSchema), runController.triggerRun);

/**
 * @swagger
 * /api/v1/run/sync:
 *   post:
 *     summary: "[Developer] Synchronous agent run"
 *     description: Blocks until the agent completes and returns the full result.
 *     tags: [Developer API]
 *     security:
 *       - hopeToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RunRequest'
 *     responses:
 *       200:
 *         description: Agent run result
 *       401:
 *         description: Missing or invalid X-Hope-Token
 */
router.post("/sync", validate(runSchema), runController.triggerRunSync);

/**
 * @swagger
 * /api/v1/run/stream:
 *   post:
 *     summary: "[Developer] Streaming agent run (SSE)"
 *     description: |
 *       Streams token-by-token output as Server-Sent Events.
 *       Connect with EventSource or any SSE-capable HTTP client.
 *     tags: [Developer API]
 *     security:
 *       - hopeToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RunRequest'
 *     responses:
 *       200:
 *         description: SSE stream (text/event-stream)
 *       401:
 *         description: Missing or invalid X-Hope-Token
 */
router.post("/stream", validate(runSchema), runController.triggerRunStream);

export default router;
