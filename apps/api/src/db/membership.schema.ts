import { pgTable, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { UserTable } from "./user.schema";
import { OrganizationTable } from "./organization.schema";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "suspended",
  "deleted",
]);

export const MembershipTable = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => OrganizationTable.id),

  role: membershipRoleEnum("role").notNull().default("member"),
  status: membershipStatusEnum("status").notNull().default("active"),

  createdBy: uuid("created_by").references(() => UserTable.id),
  deletedBy: uuid("deleted_by").references(() => UserTable.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Membership = typeof MembershipTable.$inferSelect;
export type NewMembership = typeof MembershipTable.$inferInsert;
