import { db } from "../../../db";
import { MembershipTable } from "../../../db/membership.schema";
import { UserTable } from "../../../db/user.schema";
import { ApiError } from "../../../shared/utils/ApiError";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { addMemberSchema, updateMemberRoleSchema } from "./membership.validation";

export class MembershipService {
  async addMember(orgId: string, inviterId: string, input: z.infer<typeof addMemberSchema>) {
    // 1. Check if user exists
    const userToInvite = await db.query.UserTable.findFirst({
      where: eq(UserTable.email, input.email),
    });

    if (!userToInvite) {
      throw new ApiError(404, "User with this email not found");
    }

    // 2. Check if already a member
    const existingMembership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, userToInvite.id),
        eq(MembershipTable.organizationId, orgId)
      ),
    });

    if (existingMembership) {
      if (existingMembership.status === "active") {
        throw new ApiError(400, "User is already a member of this organization");
      } else {
        // Reactivate membership
        const [updated] = await db.update(MembershipTable)
          .set({ status: "active", role: input.role as any, updatedAt: new Date() })
          .where(eq(MembershipTable.id, existingMembership.id))
          .returning();
        return updated;
      }
    }

    // 3. Create membership
    const [membership] = await db.insert(MembershipTable)
      .values({
        userId: userToInvite.id,
        organizationId: orgId,
        role: input.role as any,
        createdBy: inviterId,
      })
      .returning();

    return membership;
  }

  async getMembers(orgId: string) {
    const members = await db
      .select({ 
        membership: MembershipTable,
        user: {
          id: UserTable.id,
          firstName: UserTable.firstName,
          lastName: UserTable.lastName,
          email: UserTable.email
        }
      })
      .from(MembershipTable)
      .innerJoin(UserTable, eq(MembershipTable.userId, UserTable.id))
      .where(
        and(
          eq(MembershipTable.organizationId, orgId),
          eq(MembershipTable.status, "active")
        )
      );

    return members;
  }

  async removeMember(orgId: string, targetUserId: string, removerId: string) {
    await db.update(MembershipTable)
      .set({
        status: "deleted",
        deletedBy: removerId,
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(MembershipTable.organizationId, orgId),
          eq(MembershipTable.userId, targetUserId)
        )
      );

    return true;
  }
}
