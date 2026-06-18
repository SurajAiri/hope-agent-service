import { Router } from "express";
import { ApiController } from "./api.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { authMiddleware } from "../../../middlewares/auth.middleware";
import { requireOrganizationRole } from "../../../middlewares/org.middleware";
import { createApiKeySchema } from "./api.validation";

const router = Router({ mergeParams: true });
const apiController = new ApiController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/apikeys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: API key created successfully
 *       400:
 *         description: Invalid input
 */
router.post(
  "/",
  requireOrganizationRole(["owner", "admin"]),
  validate(createApiKeySchema),
  apiController.createApiKey,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/apikeys:
 *   get:
 *     summary: List all API keys for organization
 *     tags: [API Keys]
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
 *         description: List of API keys
 */
router.get(
  "/",
  requireOrganizationRole(["owner", "admin", "member"]),
  apiController.listApiKeys,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/apikeys/{keyId}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *       404:
 *         description: API key not found
 */
router.delete(
  "/:keyId",
  requireOrganizationRole(["owner", "admin"]),
  apiController.revokeApiKey,
);

export default router;
