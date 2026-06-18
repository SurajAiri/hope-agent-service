import express from "express";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { UserController } from "./user.controller";

const router = express.Router();
const userController = new UserController();

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", authMiddleware, userController.getMe);

/**
 * @swagger
 * /api/v1/users:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put("/", authMiddleware, userController.update);

/**
 * @swagger
 * /api/v1/users:
 *   delete:
 *     summary: Delete current user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User account deleted successfully
 *       401:
 *         description: Unauthorized
 */
router.delete("/", authMiddleware, userController.delete);

/**
 * @swagger
 * /api/v1/users/me/invitations:
 *   get:
 *     summary: Get pending organization invitations
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully
 */
router.get("/me/invitations", authMiddleware, userController.getInvitations);

export default router;
