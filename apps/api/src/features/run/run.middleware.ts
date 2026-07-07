import { Request, Response, NextFunction } from "express";
import { ApiError } from "@/shared/utils/ApiError";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ApiService } from "@/features/access/api/api.service";

const apiService = new ApiService();

/**
 * Middleware for the flat developer run endpoints (/api/v1/run/*).
 *
 * Reads X-Hope-Token from the request header, resolves the organization
 * via the Redis-backed ApiService.resolveApiKeyOrg(), and sets
 * req.organizationId on success.
 *
 * No organizationId in the URL — the token carries that context.
 */
export const apiTokenMiddleware = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const rawToken = req.headers["x-hope-token"] as string | undefined;

    if (!rawToken) {
      throw new ApiError(
        401,
        "Missing X-Hope-Token header. Provide your API token to authenticate.",
      );
    }

    // resolveApiKeyOrg handles Redis cache, inline expiry, and DB fallback
    const orgId = await apiService.resolveApiKeyOrg(rawToken);

    req.organizationId = orgId;
    next();
  },
);
