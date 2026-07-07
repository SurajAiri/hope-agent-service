import { Router } from "express";
import { TracesController } from "./traces.controller";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { requireOrganizationRole } from "@/middlewares/org.middleware";

/**
 * Traces routes — mounted at:
 *   /api/v1/organizations/:organizationId/traces
 */
const router = Router({ mergeParams: true });
const tracesController = new TracesController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/traces:
 *   get:
 *     summary: List run traces for an organization
 *     tags: [Traces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: agentId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [queued, running, done, failed, hitl] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated list of run traces
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/",
  requireOrganizationRole(["owner", "admin", "member"]),
  tracesController.listRuns,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/traces/{id}:
 *   get:
 *     summary: Get a single run trace by ID
 *     tags: [Traces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Single trace detail
 *       404:
 *         description: Trace not found
 */
router.get(
  "/:id",
  requireOrganizationRole(["owner", "admin", "member"]),
  tracesController.getRun,
);

export default router;
