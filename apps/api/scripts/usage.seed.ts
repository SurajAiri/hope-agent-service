/**
 * Seed script — populates the DB with a realistic-looking tenant:
 * one organization, a few users with different roles, a couple of
 * API keys, and a month of run_logs with a believable distribution
 * of agents / statuses / tokens / durations / errors.
 *
 * Run with:
 *   cd apps/api
 *   npx tsx --env-file=.env src/scripts/seed.ts
 *
 * Safe to re-run: it deletes rows it previously inserted (matched by
 * the fixed org slug below) before re-inserting, so you don't get
 * duplicate orgs piling up every time you run it.
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../src/db";
import { UserTable } from "../src/db/user.schema";
import { OrganizationTable } from "../src/db/organization.schema";
import { MembershipTable } from "../src/db/membership.schema";
import { ApiKeyTable } from "../src/db/api.schema";
import { RunLogTable } from "../src/db/run-log.schema";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────
// Config — change these if you want different login creds
// ─────────────────────────────────────────────────────────────────────────

const ORG_SLUG = "nimbus-retail-demo";
const ORG_NAME = "Nimbus Retail Co";

// One password for every seeded user — keeps testing simple.
// Change this if your app enforces a stronger policy at signup.
const SEED_PASSWORD = "DemoPass!2026";

const SEED_USERS = [
  {
    email: "owner@nimbusretail.dev",
    firstName: "Dana",
    lastName: "Whitfield",
    role: "owner" as const,
  },
  {
    email: "admin@nimbusretail.dev",
    firstName: "Marcus",
    lastName: "Ito",
    role: "admin" as const,
  },
  {
    email: "member@nimbusretail.dev",
    firstName: "Priya",
    lastName: "Sundaram",
    role: "member" as const,
  },
];

// agent_id strings as they'd be registered in the Python GenAI runner —
// these are NOT DB rows, just free-text identifiers used consistently.
const AGENTS = [
  "support-triage-agent",
  "order-status-agent",
  "returns-refund-agent",
  "product-recommender-agent",
];

const DAYS_OF_HISTORY = 30;
const RUNS_PER_DAY_MIN = 12;
const RUNS_PER_DAY_MAX = 45;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of entries) {
    if (r < weight) return value;
    r -= weight;
  }
  return entries[entries.length - 1][0];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeApiKey() {
  const rawKey = `ak_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyHash };
}

const CUSTOMER_MESSAGES: Record<string, string[]> = {
  "support-triage-agent": [
    "My package says delivered but I never got it, what do I do?",
    "The item I received is damaged, can I get a replacement?",
    "I've been charged twice for the same order, please help.",
    "How long does standard shipping usually take?",
  ],
  "order-status-agent": [
    "Where is order #NR-58231 right now?",
    "Can you tell me the status of my last order?",
    "Has my order shipped yet? It's been 4 days.",
    "I need the tracking number for order #NR-77410.",
  ],
  "returns-refund-agent": [
    "I want to return these shoes, they don't fit.",
    "How do I start a refund for order #NR-61122?",
    "Can I exchange this for a different size instead of a refund?",
    "It's been 10 days since I requested my refund, where is it?",
  ],
  "product-recommender-agent": [
    "Can you suggest a running jacket for cold weather?",
    "I bought a yoga mat last month, what else would go well with it?",
    "Looking for a gift under $50 for a coffee lover.",
    "What's a good alternative to the item that's out of stock?",
  ],
};

const ASSISTANT_REPLIES: Record<string, string[]> = {
  "support-triage-agent": [
    "I'm sorry about that — I've flagged this as a lost-package case and looped in our fulfillment team.",
    "Thanks for the photo. I've approved a free replacement, it'll ship within 24 hours.",
    "I see the duplicate charge. I've submitted a refund for the extra charge, it should post in 3-5 business days.",
    "Standard shipping typically takes 5-7 business days depending on your region.",
  ],
  "order-status-agent": [
    "Order #NR-58231 is currently in transit and expected to arrive in 2 days.",
    "Your last order was delivered yesterday at 3:42 PM.",
    "It looks like the order is still being packed — it should ship out today.",
    "Here's the tracking number for #NR-77410: 1Z999AA10123456784.",
  ],
  "returns-refund-agent": [
    "I've started a return for those shoes — you'll get a prepaid label by email shortly.",
    "Your refund for #NR-61122 has been initiated and should reflect in 5-7 business days.",
    "Yes, I can process that as an exchange instead — what size would you like?",
    "I checked and your refund was processed 2 days ago, it may just be pending at your bank.",
  ],
  "product-recommender-agent": [
    "Based on your order history, I'd suggest the Alpine Shell Jacket — good for wind and light rain.",
    "A cork yoga block and resistance band set pair really well with that mat.",
    "The Ember Roast Sampler is a popular gift for coffee lovers, right at $42.",
    "The closest alternative in stock is the same model in matte black.",
  ],
};

const ERROR_MESSAGES = [
  "Upstream GenAI service timed out after 30000ms",
  "Rate limit exceeded for upstream model provider",
  "Invalid tool call arguments: missing required field 'order_id'",
  "Model returned malformed JSON in tool-call response",
  "Redis connection lost mid-session",
  "Upstream service returned 503 Service Unavailable",
];

function buildRunPayload(agentId: string) {
  const userMsg = pick(CUSTOMER_MESSAGES[agentId]);
  const assistantMsg = pick(ASSISTANT_REPLIES[agentId]);

  const input = [{ role: "user", content: userMsg }];

  const willUseTool = Math.random() < 0.35;
  const output = willUseTool
    ? {
        messages: [
          { role: "user", content: userMsg },
          {
            role: "tool",
            content: JSON.stringify({
              tool: "lookup_order",
              result: {
                status: pick([
                  "shipped",
                  "in_transit",
                  "delivered",
                  "processing",
                ]),
              },
            }),
          },
          { role: "assistant", content: assistantMsg },
        ],
        status: "done",
      }
    : {
        messages: [
          { role: "user", content: userMsg },
          { role: "assistant", content: assistantMsg },
        ],
        status: "done",
      };

  return { input, output };
}

// ─────────────────────────────────────────────────────────────────────────
// Seed logic
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding org "${ORG_NAME}" (slug: ${ORG_SLUG})...`);

  // Clean up a previous run of this same seed (idempotent re-seeding)
  const existingOrg = await db.query.OrganizationTable.findFirst({
    where: eq(OrganizationTable.slug, ORG_SLUG),
  });

  if (existingOrg) {
    console.log("Existing seeded org found — deleting its data first...");
    await db.delete(RunLogTable).where(eq(RunLogTable.orgId, existingOrg.id));
    await db
      .delete(ApiKeyTable)
      .where(eq(ApiKeyTable.organizationId, existingOrg.id));
    await db
      .delete(MembershipTable)
      .where(eq(MembershipTable.organizationId, existingOrg.id));
    await db
      .delete(OrganizationTable)
      .where(eq(OrganizationTable.id, existingOrg.id));
    // Note: we intentionally leave users in place in case they're referenced
    // elsewhere; we upsert by email below instead of hard-deleting.
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  // 1. Users (upsert by email so re-runs don't collide with unique constraint)
  const userRows: { id: string; email: string; role: string }[] = [];
  for (const u of SEED_USERS) {
    const existing = await db.query.UserTable.findFirst({
      where: eq(UserTable.email, u.email),
    });
    if (existing) {
      userRows.push({ id: existing.id, email: u.email, role: u.role });
      continue;
    }
    const [row] = await db
      .insert(UserTable)
      .values({
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
      })
      .returning();
    userRows.push({ id: row.id, email: u.email, role: u.role });
  }

  const owner = userRows.find((u) => u.role === "owner")!;

  // 2. Organization
  const [org] = await db
    .insert(OrganizationTable)
    .values({
      name: ORG_NAME,
      slug: ORG_SLUG,
      createdBy: owner.id,
    })
    .returning();

  // 3. Memberships
  for (const u of userRows) {
    await db.insert(MembershipTable).values({
      userId: u.id,
      organizationId: org.id,
      role: u.role as "owner" | "admin" | "member",
      createdBy: owner.id,
    });
  }

  // 4. API keys — one active (used for most runs), one suspended, one expired
  const activeKey = makeApiKey();
  const suspendedKey = makeApiKey();
  const expiredKey = makeApiKey();

  const [activeKeyRow] = await db
    .insert(ApiKeyTable)
    .values({
      organizationId: org.id,
      name: "Production key",
      keyHash: activeKey.keyHash,
      status: "active",
      createdBy: owner.id,
    })
    .returning();

  await db.insert(ApiKeyTable).values({
    organizationId: org.id,
    name: "Old staging key",
    keyHash: suspendedKey.keyHash,
    status: "suspended",
    createdBy: owner.id,
  });

  await db.insert(ApiKeyTable).values({
    organizationId: org.id,
    name: "Legacy integration key",
    keyHash: expiredKey.keyHash,
    status: "active",
    expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // expired 3 days ago
    createdBy: owner.id,
  });

  // 5. Run logs — the "traces" / usage data
  const now = Date.now();
  const runsToInsert: (typeof RunLogTable.$inferInsert)[] = [];

  for (let day = DAYS_OF_HISTORY; day >= 0; day--) {
    const runsToday = randInt(RUNS_PER_DAY_MIN, RUNS_PER_DAY_MAX);
    const dayStart = now - day * 24 * 60 * 60 * 1000;

    for (let i = 0; i < runsToday; i++) {
      const agentId = pick(AGENTS);
      const createdAt = new Date(dayStart + randInt(0, 23 * 60 * 60 * 1000));

      const runMode = weightedPick<"async" | "sync" | "stream">([
        ["async", 55],
        ["sync", 35],
        ["stream", 10],
      ]);

      const status = weightedPick<
        "done" | "failed" | "hitl" | "running" | "queued"
      >([
        ["done", 78],
        ["failed", 10],
        ["hitl", 5],
        ["running", 4],
        ["queued", 3],
      ]);

      const triggeredBy = weightedPick<"api_token" | "playground">([
        ["api_token", 85],
        ["playground", 15],
      ]);

      const { input, output } = buildRunPayload(agentId);

      const tokensIn = status === "queued" ? null : randInt(80, 900);
      const tokensOut =
        status === "done"
          ? randInt(40, 500)
          : status === "failed"
            ? null
            : randInt(0, 200);
      const durationMs =
        status === "queued"
          ? randInt(5, 40)
          : runMode === "stream"
            ? randInt(1500, 8000)
            : runMode === "sync"
              ? randInt(400, 4000)
              : randInt(50, 300);

      runsToInsert.push({
        orgId: org.id,
        agentId,
        sessionId: crypto.randomUUID(),
        threadId: Math.random() < 0.4 ? crypto.randomUUID() : null,
        runMode,
        status,
        input,
        output:
          status === "failed" || status === "queued" || status === "running"
            ? null
            : output,
        tokensIn,
        tokensOut,
        durationMs,
        error: status === "failed" ? pick(ERROR_MESSAGES) : null,
        triggeredBy,
        apiKeyId: triggeredBy === "api_token" ? activeKeyRow.id : null,
        createdAt,
      });
    }
  }

  // Batch insert (chunked to keep individual queries reasonable)
  const CHUNK = 200;
  for (let i = 0; i < runsToInsert.length; i += CHUNK) {
    await db.insert(RunLogTable).values(runsToInsert.slice(i, i + CHUNK));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n============================================");
  console.log("SEED COMPLETE");
  console.log("============================================");
  console.log(`Organization: ${ORG_NAME} (${org.id})`);
  console.log(`Run logs inserted: ${runsToInsert.length}`);
  console.log("\n--- LOGIN CREDENTIALS (use these in the app) ---");
  for (const u of SEED_USERS) {
    console.log(
      `  role: ${u.role.padEnd(6)} | email: ${u.email.padEnd(28)} | password: ${SEED_PASSWORD}`,
    );
  }
  console.log("\n>>> Primary login to use: <<<");
  console.log(`    email:    ${SEED_USERS[0].email}`);
  console.log(`    password: ${SEED_PASSWORD}`);
  console.log(
    "\n--- RAW API KEYS (shown once — only the hash is stored in DB) ---",
  );
  console.log(`  active   : ${activeKey.rawKey}`);
  console.log(
    `  suspended: ${suspendedKey.rawKey}  (status=suspended, will be rejected)`,
  );
  console.log(
    `  expired  : ${expiredKey.rawKey}  (status=active but expiresAt in the past)`,
  );
  console.log("============================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
