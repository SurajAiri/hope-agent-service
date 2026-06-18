import { pgTable, varchar, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { OrganizationTable } from "./organization.schema";
import { UserTable } from "./user.schema";

export const apiKeyStatusEnum = pgEnum("api_key_status", [
  "active",
  "suspended",
  "deleted",
]);

export const ApiKeyTable = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => OrganizationTable.id),

  name: varchar("name", { length: 255 }).notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull().unique(), // We store a hash of the key

  status: apiKeyStatusEnum("status").notNull().default("active"),

  createdBy: uuid("created_by").references(() => UserTable.id),
  deletedBy: uuid("deleted_by").references(() => UserTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ApiKey = typeof ApiKeyTable.$inferSelect;
export type NewApiKey = typeof ApiKeyTable.$inferInsert;
