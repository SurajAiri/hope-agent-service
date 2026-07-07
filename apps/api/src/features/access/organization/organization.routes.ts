import { Router } from "express";
import { OrganizationController } from "./organization.controller";
import { validate } from "@/middlewares/validate.middleware";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { requireOrganizationRole } from "@/middlewares/org.middleware";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./organization.validation";

const router = Router();
const orgController = new OrganizationController();

// Note: authMiddleware is applied per-route (not globally) to avoid interfering
// with nested routes (e.g. /agents) that use their own dual-auth middleware.

/**
 * @swagger
 * /api/v1/organizations:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Organization created successfully
 *       400:
 *         description: Invalid input
 */
router.post(
  "/",
  authMiddleware,
  validate(createOrganizationSchema),
  orgController.create,
);

/**
 * @swagger
 * /api/v1/organizations:
 *   get:
 *     summary: Get all organizations for current user
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations
 */
router.get("/", authMiddleware, orgController.getAll);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}:
 *   get:
 *     summary: Get organization by ID
 *     tags: [Organizations]
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
 *         description: Organization details
 *       404:
 *         description: Organization not found
 */
router.get(
  "/:organizationId",
  authMiddleware,
  requireOrganizationRole(["owner", "admin", "member"]),
  orgController.getById,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}:
 *   patch:
 *     summary: Update organization
 *     tags: [Organizations]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Organization updated successfully
 *       404:
 *         description: Organization not found
 */
router.patch(
  "/:organizationId",
  authMiddleware,
  requireOrganizationRole(["owner", "admin"]),
  validate(updateOrganizationSchema),
  orgController.update,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}:
 *   delete:
 *     summary: Delete organization
 *     tags: [Organizations]
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
 *         description: Organization deleted successfully
 *       404:
 *         description: Organization not found
 */
router.delete(
  "/:organizationId",
  authMiddleware,
  requireOrganizationRole(["owner"]),
  orgController.delete,
);

export default router;
