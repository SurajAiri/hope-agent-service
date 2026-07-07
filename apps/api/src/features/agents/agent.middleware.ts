import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "@/shared/utils/ApiError";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { db } from "@/db";
import { MembershipTable } from "@/db/membership.schema";
import { and, eq } from "drizzle-orm";
import { ApiService } from "@/features/access/api/api.service";

const apiService = new ApiService();

/**
 * Dual-auth middleware for agent proxy routes.
 *
 * Supports two authentication modes:
 *
 * 1. JWT Bearer token  (Authorization: Bearer <token>)
 *    - Validates the JWT, checks the user is an active member of the org.
 *    - Intended for browser / web-app clients that already have a session.
 *
 * 2. Org API key  (X-API-Key: <raw_key>)
 *    - Resolves orgId via the Redis-backed ApiService.resolveApiKeyOrg().
 *    - First call: Postgres lookup + Redis cache (7-day TTL safety-net).
 *    - Subsequent calls: Redis hit only — zero DB round-trips.
 *    - Revocation takes effect immediately (redis.del called on revoke).
 *    - Intended for programmatic / SDK access (CI, backend clients, etc.).
 *
 * In both cases, sets req.organizationId after successful validation.
 */
export const agentAuthMiddleware = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // ── Resolve org ID from URL ─────────────────────────────────────────
    const orgIdRaw = req.params.organizationId;
    const orgId = Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw;

    if (!orgId) {
      throw new ApiError(
        400,
        "Organization ID is required in the URL path (:organizationId)",
      );
    }

    const authHeader = req.headers.authorization;
    const rawApiKey = req.headers["x-api-key"] as string | undefined;

    // ── Mode 1: JWT Bearer token ────────────────────────────────────────
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(
          token,
          process.env.JWT_SECRET as string,
        ) as jwt.JwtPayload;
      } catch {
        throw new ApiError(401, "Invalid or expired access token");
      }

      req.user = decoded;
      const userId = decoded.id as string;

      // Verify the user is an active member of the requested org
      const membership = await db.query.MembershipTable.findFirst({
        where: and(
          eq(MembershipTable.userId, userId),
          eq(MembershipTable.organizationId, orgId),
          eq(MembershipTable.status, "active"),
        ),
      });

      if (!membership) {
        throw new ApiError(403, "You are not an active member of this organization");
      }

      req.organizationId = orgId;
      req.membershipRole = membership.role;
      return next();
    }

    // ── Mode 2: Org API key (Redis-cached, zero DB lookups after first hit) ─
    if (rawApiKey) {
      // resolveApiKeyOrg validates expiry + active status inline
      const resolvedOrgId = await apiService.resolveApiKeyOrg(rawApiKey);

      // The key must belong to the org in the URL path
      if (resolvedOrgId !== orgId) {
        throw new ApiError(403, "This API key does not belong to the requested organization");
      }

      req.organizationId = orgId;
      return next();
    }

    // ── No credentials ──────────────────────────────────────────────────
    throw new ApiError(
      401,
      "Authentication required — provide a Bearer token (Authorization header) or an org API key (X-API-Key header)",
    );
  },
);
