import { db } from "../../../db";
import { ApiKeyTable } from "../../../db/api.schema";
import { ApiError } from "../../../shared/utils/ApiError";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export class ApiService {
  async createApiKey(orgId: string, name: string, creatorId: string, expiresAt: Date | null = null) {
    // Generate a secure random API key
    const rawKey = `ak_${crypto.randomBytes(24).toString("hex")}`;
    
    // Hash the key for storage (we only show it once)
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [apiKey] = await db.insert(ApiKeyTable)
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
        eq(ApiKeyTable.status, "active")
      ),
      columns: {
        id: true,
        name: true,
        createdAt: true,
        createdBy: true,
        expiresAt: true,
      }
    });

    return keys;
  }

  async revokeApiKey(orgId: string, keyId: string, revokerId: string) {
    const [updated] = await db.update(ApiKeyTable)
      .set({
        status: "deleted",
        deletedBy: revokerId,
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(ApiKeyTable.id, keyId),
          eq(ApiKeyTable.organizationId, orgId)
        )
      )
      .returning();

    if (!updated) {
      throw new ApiError(404, "API Key not found or does not belong to this organization");
    }

    return true;
  }
}
