import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "@/shared/utils/ApiError";
import { asyncHandler } from "@/shared/utils/asyncHandler";

export const authMiddleware = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");

      if (!token) {
        throw new ApiError(401, "Unauthorized request");
      }

      const decodedToken = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as jwt.JwtPayload;

      req.user = decodedToken;
      next();
    } catch (error: any) {
      throw new ApiError(401, error?.message || "Invalid access token");
    }
  },
);
