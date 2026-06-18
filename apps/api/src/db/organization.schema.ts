import { pgTable, varchar, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { UserTable } from "./user.schema";

export const organizationStatusEnum = pgEnum("organization_status", [
  "active",
  "suspended",
  "deleted",
]);

export const OrganizationTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),

  status: organizationStatusEnum("status").notNull().default("active"),

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

export type Organization = typeof OrganizationTable.$inferSelect;
export type NewOrganization = typeof OrganizationTable.$inferInsert;
