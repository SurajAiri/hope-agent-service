import { Router } from "express";
import { MembershipController } from "./membership.controller";
import { validate } from "@/middlewares/validate.middleware";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { requireOrganizationRole } from "@/middlewares/org.middleware";
import { addMemberSchema } from "./membership.validation";

const router = Router({ mergeParams: true }); // allows getting :organizationId from parent router
const membershipController = new MembershipController();

router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/members:
 *   post:
 *     summary: Add a member to organization
 *     tags: [Memberships]
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
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [owner, admin, member]
 *     responses:
 *       201:
 *         description: Member added successfully
 *       400:
 *         description: Invalid input
 */
router.post(
  "/",
  requireOrganizationRole(["owner", "admin"]),
  validate(addMemberSchema),
  membershipController.addMember,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/members:
 *   get:
 *     summary: Get all members of organization
 *     tags: [Memberships]
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
 *         description: List of organization members
 */
router.get(
  "/",
  requireOrganizationRole(["owner", "admin", "member"]),
  membershipController.getMembers,
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/members/{userId}:
 *   delete:
 *     summary: Remove a member from organization
 *     tags: [Memberships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       404:
 *         description: Member not found
 */
router.delete(
  "/:userId",
  requireOrganizationRole(["owner", "admin"]),
  membershipController.removeMember,
);

router.patch(
  "/:userId",
  requireOrganizationRole(["owner", "admin"]),
  membershipController.updateRole,
);

router.post(
  "/leave",
  requireOrganizationRole(["admin", "member"]), // Owner cannot leave
  membershipController.leaveOrganization,
);

// Note: Accept/Reject endpoints don't need requireOrganizationRole since they are pending members.
// They just need the authMiddleware, which is already applied to this router.
// But wait, they are accessing an organization resource. We can allow anyone authenticated to call it,
// and the service will check if the user has a pending invite for that org.
router.post("/accept", membershipController.acceptInvite);

router.post("/reject", membershipController.rejectInvite);

export default router;
