import { db } from "@/db";
import { ApiKeyTable } from "@/db/api.schema";
import { ApiError } from "@/shared/utils/ApiError";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import {
  getRedis,
  REDIS_API_KEY_PREFIX,
  REDIS_API_KEY_TTL_SECONDS,
} from "@/configs/redis";

// ── Redis value helpers ────────────────────────────────────────────────────

/** Encode an API-key entry for Redis storage. */
function encodeRedisValue(orgId: string, expiresAt: Date | null): string {
  const expiry = expiresAt ? expiresAt.getTime().toString() : "never";
  return `${orgId}|${expiry}`;
}

/**
 * Decode and validate a Redis-cached API-key entry.
 * Returns `orgId` if valid, throws ApiError if expired, returns `null` if
 * the value is malformed (caller should fall back to DB).
 */
function decodeRedisValue(raw: string): string {
  const [orgId, expiry] = raw.split("|");
  if (!orgId || !expiry) return null as unknown as string; // malformed

  if (expiry !== "never") {
    const expiryMs = parseInt(expiry, 10);
    if (Number.isNaN(expiryMs)) return null as unknown as string;
    if (Date.now() > expiryMs) {
      throw new ApiError(401, "This API key has expired");
    }
  }

  return orgId;
}

// ── ApiService ─────────────────────────────────────────────────────────────

export class ApiService {
  // ── Key lifecycle ──────────────────────────────────────────────────────

  /**
   * Resolve the organisation ID for a raw API key.
   *
   * Strategy (no constant DB hits):
   *   1. SHA-256 hash the raw key.
   *   2. Check Redis: `hope:apikey:<hash>` → `"<orgId>|<expiryMs|never>"`
   *      - Hit: parse inline expiry, return orgId immediately.
   *   3. Miss: query Postgres, validate status + expiry.
   *   4. Write result to Redis with 7-day TTL (safety-net; inline expiry is
   *      the authority).
   *
   * Revocation (`revokeApiKey`) deletes the Redis key immediately so a
   * revoked token is rejected on the next request with zero TTL lag.
   *
   * Natural expiry: decoded expiry timestamp caught inline; key then
   * lazily deleted from Redis.
   */
  async resolveApiKeyOrg(rawKey: string): Promise<string> {
    const keyHash = crypto
      .createHash("sha256")
      .update(rawKey)
      .digest("hex");

    const redis = getRedis();
    const redisKey = `${REDIS_API_KEY_PREFIX}${keyHash}`;

    // ── 1. Redis cache lookup ──────────────────────────────────────────
    const cached = await redis.get(redisKey);
    if (cached !== null) {
      let orgId: string;
      try {
        orgId = decodeRedisValue(cached);
      } catch (err) {
        // Token is expired — delete stale key and bubble the error up
        await redis.del(redisKey);
        throw err;
      }

      if (!orgId) {
        // Malformed entry — fall through to DB
        await redis.del(redisKey);
      } else {
        return orgId;
      }
    }

    // ── 2. Postgres fallback ───────────────────────────────────────────
    const apiKey = await db.query.ApiKeyTable.findFirst({
      where: and(
        eq(ApiKeyTable.keyHash, keyHash),
        eq(ApiKeyTable.status, "active"),
      ),
    });

    if (!apiKey) {
      throw new ApiError(401, "Invalid API key");
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new ApiError(401, "This API key has expired");
    }

    // ── 3. Write to Redis (7-day TTL safety-net) ───────────────────────
    const value = encodeRedisValue(apiKey.organizationId, apiKey.expiresAt ?? null);
    await redis.setex(redisKey, REDIS_API_KEY_TTL_SECONDS, value);

    return apiKey.organizationId;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  async createApiKey(
    orgId: string,
    name: string,
    creatorId: string,
    expiresAt: Date | null = null,
  ) {
    // Generate a secure random API key
    const rawKey = `ak_${crypto.randomBytes(24).toString("hex")}`;

    // Hash the key for storage (we only show it once)
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [apiKey] = await db
      .insert(ApiKeyTable)
      .values({
        organizationId: orgId,
        name,
        keyHash,
        createdBy: creatorId,
        expiresAt,
      })
      .returning();

    // We return the raw key ONLY upon creation.
    return {
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      key: rawKey,
    };
  }

  async listApiKeys(orgId: string) {
    const keys = await db.query.ApiKeyTable.findMany({
      where: and(
        eq(ApiKeyTable.organizationId, orgId),
        eq(ApiKeyTable.status, "active"),
      ),
      columns: {
        id: true,
        name: true,
        createdAt: true,
        createdBy: true,
        expiresAt: true,
      },
    });

    return keys;
  }

  /**
   * Revoke an API key:
   *   1. Mark as deleted in Postgres.
   *   2. Immediately remove from Redis — zero stale-window for revoked keys.
   */
  async revokeApiKey(orgId: string, keyId: string, revokerId: string) {
    const [updated] = await db
      .update(ApiKeyTable)
      .set({
        status: "deleted",
        deletedBy: revokerId,
        deletedAt: new Date(),
      })
      .where(
        and(eq(ApiKeyTable.id, keyId), eq(ApiKeyTable.organizationId, orgId)),
      )
      .returning();

    if (!updated) {
      throw new ApiError(
        404,
        "API Key not found or does not belong to this organization",
      );
    }

    // Delete from Redis so the key is rejected on the very next request
    const redis = getRedis();
    const redisKey = `${REDIS_API_KEY_PREFIX}${updated.keyHash}`;
    await redis.del(redisKey);

    return true;
  }
}
