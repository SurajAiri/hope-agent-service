import { Router } from "express";
import { AnalyticsController } from "./analytics.controller";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { requireOrganizationRole } from "@/middlewares/org.middleware";

/**
 * Analytics routes — mounted at:
 *   /api/v1/organizations/:organizationId/analytics
 */
const router = Router({ mergeParams: true });
const analyticsController = new AnalyticsController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/analytics:
 *   get:
 *     summary: Get usage analytics for an organization
 *     description: |
 *       Returns all analytics in a single call: overview cards, runs over time,
 *       status distribution, top agents, token usage, and run-mode split.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         description: Start date (ISO 8601). Defaults to 30 days ago.
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         description: End date (ISO 8601). Defaults to now.
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: agentId
 *         description: Filter by a specific agent ID.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Analytics payload
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/",
  requireOrganizationRole(["owner", "admin", "member"]),
  analyticsController.getAll,
);

export default router;
