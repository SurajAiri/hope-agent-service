import { db } from "../../../db";
import { MembershipTable } from "../../../db/membership.schema";
import { UserTable } from "../../../db/user.schema";
import { ApiError } from "../../../shared/utils/ApiError";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  addMemberSchema,
  updateMemberRoleSchema,
} from "./membership.validation";

export class MembershipService {
  async addMember(
    orgId: string,
    inviterId: string,
    input: z.infer<typeof addMemberSchema>,
  ) {
    // Check inviter role
    const inviterMembership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, inviterId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "active"),
      ),
    });

    if (!inviterMembership) {
      throw new ApiError(403, "Inviter is not an active member");
    }

    if (input.role === "owner" && inviterMembership.role !== "owner") {
      throw new ApiError(403, "Only owners can invite other owners");
    }

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
        eq(MembershipTable.organizationId, orgId),
      ),
    });

    if (existingMembership) {
      if (existingMembership.status === "active") {
        throw new ApiError(
          400,
          "User is already a member of this organization",
        );
      } else if (existingMembership.status === "pending") {
        throw new ApiError(400, "User already has a pending invite");
      } else {
        // Reactivate membership as pending
        const [updated] = await db
          .update(MembershipTable)
          .set({
            status: "pending",
            role: input.role as any,
            updatedAt: new Date(),
          })
          .where(eq(MembershipTable.id, existingMembership.id))
          .returning();
        return updated;
      }
    }

    // 3. Create membership
    const [membership] = await db
      .insert(MembershipTable)
      .values({
        userId: userToInvite.id,
        organizationId: orgId,
        role: input.role as any,
        status: "pending",
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
          email: UserTable.email,
        },
      })
      .from(MembershipTable)
      .innerJoin(UserTable, eq(MembershipTable.userId, UserTable.id))
      .where(
        and(
          eq(MembershipTable.organizationId, orgId),
          inArray(MembershipTable.status, ["active", "pending"]),
        ),
      );

    return members;
  }

  async removeMember(orgId: string, targetUserId: string, removerId: string) {
    if (targetUserId === removerId) {
      throw new ApiError(
        400,
        "You cannot remove yourself. Leave the organization instead.",
      );
    }

    const removerMembership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, removerId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "active"),
      ),
    });

    const targetMembership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, targetUserId),
        eq(MembershipTable.organizationId, orgId),
        // eq(MembershipTable.status, "active")
        inArray(MembershipTable.status, ["active", "pending"]),
      ),
    });

    if (!removerMembership || !targetMembership) {
      throw new ApiError(404, "Membership not found");
    }

    // Hierarchy Logic
    if (targetMembership.role === "owner") {
      throw new ApiError(
        403,
        "Owners cannot be removed. They must transfer ownership or delete the organization.",
      );
    }

    if (
      removerMembership.role === "admin" &&
      targetMembership.role === "admin"
    ) {
      throw new ApiError(403, "Admins cannot remove other admins.");
    }

    if (removerMembership.role === "member") {
      throw new ApiError(403, "Members cannot remove anyone.");
    }

    await db
      .update(MembershipTable)
      .set({
        status: "deleted",
        deletedBy: removerId,
        deletedAt: new Date(),
      })
      .where(
        and(
          eq(MembershipTable.organizationId, orgId),
          eq(MembershipTable.userId, targetUserId),
        ),
      );

    return true;
  }

  async updateRole(
    orgId: string,
    targetUserId: string,
    updaterId: string,
    newRole: "admin" | "member",
  ) {
    if (targetUserId === updaterId) {
      throw new ApiError(400, "You cannot change your own role.");
    }

    const updaterMembership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, updaterId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "active"),
      ),
    });

    const targetMembership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, targetUserId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "active"),
      ),
    });

    if (!updaterMembership || !targetMembership) {
      throw new ApiError(404, "Membership not found or not active");
    }

    if (targetMembership.role === "owner") {
      throw new ApiError(403, "Owner's role cannot be changed");
    }

    if (
      updaterMembership.role === "admin" &&
      targetMembership.role === "admin"
    ) {
      throw new ApiError(403, "Admins cannot change the role of other admins");
    }

    if (updaterMembership.role === "member") {
      throw new ApiError(403, "Members cannot change roles");
    }

    const [updated] = await db
      .update(MembershipTable)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(MembershipTable.id, targetMembership.id))
      .returning();

    return updated;
  }

  async leaveOrganization(orgId: string, userId: string) {
    const membership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, userId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "active"),
      ),
    });

    if (!membership) {
      throw new ApiError(404, "Membership not found or not active");
    }

    if (membership.role === "owner") {
      throw new ApiError(
        403,
        "Owners cannot leave the organization. Transfer ownership or delete the organization instead.",
      );
    }

    await db
      .update(MembershipTable)
      .set({
        status: "deleted",
        deletedBy: userId, // left voluntarily
        deletedAt: new Date(),
      })
      .where(eq(MembershipTable.id, membership.id));

    return true;
  }

  async acceptInvite(orgId: string, userId: string) {
    const membership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, userId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "pending"),
      ),
    });

    if (!membership) {
      throw new ApiError(404, "Pending invite not found");
    }

    await db
      .update(MembershipTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(MembershipTable.id, membership.id));

    return true;
  }

  async rejectInvite(orgId: string, userId: string) {
    const membership = await db.query.MembershipTable.findFirst({
      where: and(
        eq(MembershipTable.userId, userId),
        eq(MembershipTable.organizationId, orgId),
        eq(MembershipTable.status, "pending"),
      ),
    });

    if (!membership) {
      throw new ApiError(404, "Pending invite not found");
    }

    await db
      .update(MembershipTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(MembershipTable.id, membership.id));

    return true;
  }
}
