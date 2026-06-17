import {
  boolean,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
]);

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);

export const UserTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  email: varchar("email", {
    length: 255,
  })
    .notNull()
    .unique(),

  passwordHash: varchar("password_hash", {
    length: 255,
  }).notNull(),

  firstName: varchar("first_name", {
    length: 255,
  }).notNull(),

  lastName: varchar("last_name", {
    length: 255,
  }).notNull(),

  status: userStatusEnum("status").notNull().default("active"),
  role: userRoleEnum("role").notNull().default("user"), // admin meaning our portal admin access for now

  isVerified: boolean("is_verified").notNull().default(true), // for now let's just skip the verification

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export type User = typeof UserTable.$inferSelect;
export type NewUser = typeof UserTable.$inferInsert;
