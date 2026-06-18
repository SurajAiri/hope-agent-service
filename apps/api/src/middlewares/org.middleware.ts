import { Request, Response, NextFunction } from "express";
import { ApiError } from "../shared/utils/ApiError";
import { asyncHandler } from "../shared/utils/asyncHandler";
import { db } from "../db";
import { MembershipTable } from "../db/membership.schema";
import { and, eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      organizationId?: string;
      membershipRole?: string;
    }
  }
}

export const requireOrganizationRole = (
  allowedRoles: ("owner" | "admin" | "member")[],
) => {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // 1. Get organization ID from header or params
      let orgIdRaw =
        req.headers["x-organization-id"] || req.params.organizationId;
      const orgId = Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw;

      const userId = req.user?.id as string;

      if (!orgId) {
        throw new ApiError(
          400,
          "Organization ID is required in headers (x-organization-id) or path params",
        );
      }

      if (!userId) {
        throw new ApiError(401, "Unauthorized");
      }

      // 2. Find membership
      const membership = await db.query.MembershipTable.findFirst({
        where: and(
          eq(MembershipTable.userId, userId),
          eq(MembershipTable.organizationId, orgId),
          eq(MembershipTable.status, "active"),
        ),
      });

      if (!membership) {
        throw new ApiError(403, "You are not a member of this organization");
      }

      // 3. Check role
      if (!allowedRoles.includes(membership.role as any)) {
        throw new ApiError(
          403,
          "You do not have the required role to perform this action",
        );
      }

      // 4. Attach to request
      req.organizationId = orgId;
      req.membershipRole = membership.role;

      next();
    },
  );
};
