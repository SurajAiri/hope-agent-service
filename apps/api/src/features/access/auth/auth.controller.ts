import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ApiResponse } from "@/shared/utils/ApiResponse";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { registerSchema, loginSchema } from "./auth.validation";

const authService = new AuthService();

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    console.log("[AuthController] register called with body:", req.body.email);
    const data = await authService.register(req.body);
    console.log("[AuthController] register success for user:", data.user.email);
    res
      .status(201)
      .json(new ApiResponse(201, data, "User registered successfully"));
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    console.log("[AuthController] login called with email:", req.body.email);
    const data = await authService.login(req.body);
    console.log("[AuthController] login success for user:", data.user.email);
    res.status(200).json(new ApiResponse(200, data, "Logged in successfully"));
  });

  getMe = asyncHandler(async (req: Request, res: Response) => {
    console.log("[AuthController] getMe called for userId:", req.user?.id);
    res
      .status(200)
      .json(new ApiResponse(200, req.user, "Current user fetched"));
  });
}
