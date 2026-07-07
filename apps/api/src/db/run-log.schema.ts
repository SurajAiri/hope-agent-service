import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { OrganizationTable } from "./organization.schema";
import { ApiKeyTable } from "./api.schema";

export const runModeEnum = pgEnum("run_mode", ["async", "sync", "stream"]);

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "done",
  "failed",
  "hitl",
]);

export const runTriggeredByEnum = pgEnum("run_triggered_by", [
  "api_token",
  "playground",
]);

export const RunLogTable = pgTable(
  "run_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orgId: uuid("org_id")
      .notNull()
      .references(() => OrganizationTable.id),

    agentId: varchar("agent_id", { length: 255 }).notNull(),

    /** session_id assigned by the GenAI service. Nullable for sync runs that error before one is assigned. */
    sessionId: varchar("session_id", { length: 255 }),

    runMode: runModeEnum("run_mode").notNull(),

    status: runStatusEnum("status").notNull(),

    /** The messages[] payload sent to the agent. */
    input: jsonb("input"),

    /** The result object returned by the GenAI service. */
    output: jsonb("output"),

    /** Input token count from GenAI response metadata (if available). */
    tokensIn: integer("tokens_in"),

    /** Output token count from GenAI response metadata (if available). */
    tokensOut: integer("tokens_out"),

    /** Wall-clock duration measured in Node (ms) from request start to response end. */
    durationMs: integer("duration_ms"),

    /** Error message when status='failed'. */
    error: text("error"),

    /** Whether this run was triggered by an API token or the dashboard playground. */
    triggeredBy: runTriggeredByEnum("triggered_by").notNull().default("api_token"),

    /** FK to the API key used (null when triggered from playground via JWT). */
    apiKeyId: uuid("api_key_id").references(() => ApiKeyTable.id),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Primary access pattern: org's runs sorted by newest first
    index("run_logs_org_created_idx").on(t.orgId, t.createdAt),
    // Session lookups (status polling links to traces)
    index("run_logs_session_id_idx").on(t.sessionId),
    // Filter / group by agent
    index("run_logs_agent_id_idx").on(t.agentId),
  ],
);

export type RunLog = typeof RunLogTable.$inferSelect;
export type NewRunLog = typeof RunLogTable.$inferInsert;
