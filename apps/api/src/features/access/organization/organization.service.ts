import { db } from "../../../db";
import { OrganizationTable } from "../../../db/organization.schema";
import { MembershipTable } from "../../../db/membership.schema";
import { ApiError } from "../../../shared/utils/ApiError";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { createOrganizationSchema, updateOrganizationSchema } from "./organization.validation";

export class OrganizationService {
  async createOrganization(userId: string, input: z.infer<typeof createOrganizationSchema>) {
    // Check if slug is unique
    const existingOrg = await db.query.OrganizationTable.findFirst({
      where: eq(OrganizationTable.slug, input.slug),
    });

    if (existingOrg) {
      throw new ApiError(409, "Organization with this slug already exists");
    }

    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(OrganizationTable)
        .values({
          name: input.name,
          slug: input.slug,
          createdBy: userId,
        })
        .returning();

      await tx.insert(MembershipTable).values({
        userId,
        organizationId: org.id,
        role: "owner",
        createdBy: userId,
      });

      return org;
    });
  }

  async getMyOrganizations(userId: string) {
    // Instead of using `with: { organization: true }` which requires relation definitions,
    // let's do a join or standard query
    const orgs = await db
      .select({ org: OrganizationTable, role: MembershipTable.role })
      .from(OrganizationTable)
      .innerJoin(MembershipTable, eq(OrganizationTable.id, MembershipTable.organizationId))
      .where(
        and(
          eq(MembershipTable.userId, userId),
          eq(MembershipTable.status, "active"),
          eq(OrganizationTable.status, "active")
        )
      );

    return orgs;
  }

  async getOrganizationById(orgId: string) {
    const org = await db.query.OrganizationTable.findFirst({
      where: and(
        eq(OrganizationTable.id, orgId),
        eq(OrganizationTable.status, "active")
      ),
    });

    if (!org) throw new ApiError(404, "Organization not found");

    return org;
  }

  async updateOrganization(orgId: string, input: z.infer<typeof updateOrganizationSchema>) {
    const org = await this.getOrganizationById(orgId);

    const [updated] = await db
      .update(OrganizationTable)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(OrganizationTable.id, orgId))
      .returning();

    return updated;
  }

  async deleteOrganization(orgId: string, userId: string) {
    await db
      .update(OrganizationTable)
      .set({
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(OrganizationTable.id, orgId));
    
    return true;
  }
}
