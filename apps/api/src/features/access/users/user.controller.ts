import { Request, Response } from "express";

import { UserService } from "./user.service";
import { ApiError } from "@/shared/utils/ApiError";
import { ApiResponse } from "@/shared/utils/ApiResponse";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { createUserSchema, updateUserSchema, updatePasswordSchema } from "./user.schema";

const userService = new UserService();

export class UserController {
  /**
   * POST / (internal — not exposed in routes, kept for completeness)
   */
  create = asyncHandler(async (req: Request, res: Response) => {
    const body = createUserSchema.parse(req.body);
    const user = await userService.createUser(body);
    res.status(201).json(new ApiResponse(201, user, "User created successfully"));
  });

  /**
   * GET /api/v1/users
   * Get the current authenticated user's profile.
   */
  getMe = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[UserController] getMe called for userId: ${userId}`);
    const user = await userService.getUser(userId);
    res.status(200).json(new ApiResponse(200, user, "User profile fetched successfully"));
  });

  /**
   * PUT /api/v1/users
   * Update the current authenticated user's profile.
   */
  update = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[UserController] update called for userId: ${userId}`);
    const body = updateUserSchema.parse(req.body);
    const user = await userService.updateUser(userId, body);
    res.status(200).json(new ApiResponse(200, user, "User profile updated successfully"));
  });

  /**
   * PATCH /api/v1/users/password
   * Update the current authenticated user's password.
   */
  updatePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[UserController] updatePassword called for userId: ${userId}`);
    const body = updatePasswordSchema.parse(req.body);
    await userService.updatePassword(userId, body);
    res.status(200).json(new ApiResponse(200, null, "Password updated successfully"));
  });

  /**
   * DELETE /api/v1/users
   * Soft-delete the current authenticated user's account.
   */
  delete = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[UserController] delete called for userId: ${userId}`);
    await userService.deleteUser(userId);
    res.status(200).json(new ApiResponse(200, null, "User account deleted successfully"));
  });

  /**
   * GET /api/v1/users/me/invitations
   * Get all pending organization invitations for the current user.
   */
  getInvitations = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[UserController] getInvitations called for userId: ${userId}`);
    const invites = await userService.getInvitations(userId);
    res.status(200).json(new ApiResponse(200, invites, "Invitations fetched successfully"));
  });
}
