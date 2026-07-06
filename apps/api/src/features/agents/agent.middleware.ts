import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ApiError } from "@/shared/utils/ApiError";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { db } from "@/db";
import { ApiKeyTable } from "@/db/api.schema";
import { MembershipTable } from "@/db/membership.schema";
import { and, eq } from "drizzle-orm";

/**
 * Dual-auth middleware for agent proxy routes.
 *
 * Supports two authentication modes:
 *
 * 1. JWT Bearer token  (Authorization: Bearer <token>)
 *    - Validates the JWT, checks the user is an active member of the org.
 *    - Intended for browser / web-app clients that already have a session.
 *
 * 2. Raw org API key   (X-API-Key: <raw_key>)
 *    - SHA-256 hashes the raw key, looks it up in the api_keys table.
 *    - Validates the key belongs to the requested org, is active, and not expired.
 *    - Intended for programmatic / SDK access (CI pipelines, backend clients, etc.).
 *
 * In both cases, sets req.organizationId after successful validation.
 */
export const agentAuthMiddleware = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // ── Resolve org ID from URL ─────────────────────────────────────────────
    const orgIdRaw = req.params.organizationId;
    const orgId = Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw;

    if (!orgId) {
      throw new ApiError(
        400,
        "Organization ID is required in the URL path (:organizationId)",
      );
    }

    const authHeader = req.headers.authorization;
    // X-API-Key from the client (their raw org API key — NOT the internal secret)
    const rawApiKey = req.headers["x-api-key"] as string | undefined;

    // ── Mode 1: JWT Bearer token ────────────────────────────────────────────
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

    // ── Mode 2: Raw org API key ─────────────────────────────────────────────
    if (rawApiKey) {
      const keyHash = crypto
        .createHash("sha256")
        .update(rawApiKey)
        .digest("hex");

      const apiKey = await db.query.ApiKeyTable.findFirst({
        where: and(
          eq(ApiKeyTable.keyHash, keyHash),
          eq(ApiKeyTable.organizationId, orgId),
          eq(ApiKeyTable.status, "active"),
        ),
      });

      if (!apiKey) {
        throw new ApiError(401, "Invalid API key");
      }

      // Check expiry (null = never expires)
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        throw new ApiError(401, "This API key has expired");
      }

      req.organizationId = orgId;
      return next();
    }

    // ── No credentials ──────────────────────────────────────────────────────
    throw new ApiError(
      401,
      "Authentication required — provide a Bearer token (Authorization header) or an org API key (X-API-Key header)",
    );
  },
);
