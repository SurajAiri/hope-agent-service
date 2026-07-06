import { config } from "dotenv";
config({ path: ".env" });

const BASE_URL = process.env.BASE_URL || "http://localhost:3030";
const GENAI_SERVICE_URL = process.env.GENAI_SERVICE_URL || "http://localhost:8000";

interface TestResult {
  name: string;
  passed: boolean;
  status?: number;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
let authToken: string;
let testUserId: string;
let testOrgId: string;
let testOrgSlug: string;
let testMemberId: string;
let testApiKeyId: string;
let testRawApiKey: string; // raw key (shown only once on creation)
let memberAuthToken: string;
let memberUserId: string;
let memberEmail: string;

// Track if the GenAI service is reachable so we can skip agent tests gracefully
let genaiServiceAvailable = false;

async function runTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`✅ ${name} (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - start;
    results.push({
      name,
      passed: false,
      duration,
      error: error.message,
    });
    console.log(`❌ ${name} (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
  }
}

async function request(
  method: string,
  path: string,
  body?: any,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  return { status: response.status, data };
}

async function main() {
  // ==================== AUTH TESTS ====================

  let registeredEmail: string;

  await runTest(
    "POST /api/v1/auth/register - should register new user",
    async () => {
      const timestamp = Date.now();
      registeredEmail = `test${timestamp}@example.com`;
      testOrgSlug = `test-org-${timestamp}`;

      const { status, data } = await request("POST", "/api/v1/auth/register", {
        firstName: "Test",
        lastName: "User",
        email: registeredEmail,
        password: "password123",
      });

      if (status !== 201) throw new Error(`Expected 201, got ${status}`);
      if (!data.data?.token) throw new Error("No token returned");
      if (!data.data?.user?.id) throw new Error("No user ID returned");

      authToken = data.data.token;
      testUserId = data.data.user.id;
      testOrgId = data.data.organization?.id;
    },
  );

  await runTest(
    "POST /api/v1/auth/register - should fail with duplicate email",
    async () => {
      const { status } = await request("POST", "/api/v1/auth/register", {
        firstName: "Test",
        lastName: "User",
        email: registeredEmail,
        password: "password123",
      });

      if (status !== 409) throw new Error(`Expected 409, got ${status}`);
    },
  );

  await runTest(
    "POST /api/v1/auth/register - should fail with invalid email",
    async () => {
      const { status } = await request("POST", "/api/v1/auth/register", {
        firstName: "Test",
        lastName: "User",
        email: "invalid-email",
        password: "password123",
      });

      if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    },
  );

  await runTest(
    "POST /api/v1/auth/login - should login successfully",
    async () => {
      const { status, data } = await request("POST", "/api/v1/auth/login", {
        email: registeredEmail,
        password: "password123",
      });

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
      if (!data.data?.token) throw new Error("No token returned");

      authToken = data.data.token;
    },
  );

  await runTest(
    "POST /api/v1/auth/login - should fail with wrong password",
    async () => {
      const { status } = await request("POST", "/api/v1/auth/login", {
        email: registeredEmail,
        password: "wrongpassword",
      });

      if (status !== 401) throw new Error(`Expected 401, got ${status}`);
    },
  );

  await runTest("GET /api/v1/auth/me - should get current user", async () => {
    const { status, data } = await request(
      "GET",
      "/api/v1/auth/me",
      undefined,
      authToken,
    );

    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.data?.id) throw new Error("No user data returned");
  });

  await runTest("GET /api/v1/auth/me - should fail without token", async () => {
    const { status } = await request("GET", "/api/v1/auth/me");

    if (status !== 401) throw new Error(`Expected 401, got ${status}`);
  });

  // ==================== USER TESTS ====================

  await runTest(
    "GET /api/v1/users - should get current user profile",
    async () => {
      const { status, data } = await request(
        "GET",
        "/api/v1/users",
        undefined,
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
      if (!data.data?.id) throw new Error("No user data returned");
    },
  );

  await runTest("PUT /api/v1/users - should update user profile", async () => {
    const { status, data } = await request(
      "PUT",
      "/api/v1/users",
      {
        firstName: "Updated",
        lastName: "Name",
      },
      authToken,
    );

    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.data) throw new Error("No user data returned");
  });

  // ==================== ORGANIZATION TESTS ====================

  await runTest(
    "POST /api/v1/organizations - should create organization",
    async () => {
      const { status, data } = await request(
        "POST",
        "/api/v1/organizations",
        {
          name: "Test Organization",
          slug: testOrgSlug,
        },
        authToken,
      );

      if (status !== 201) throw new Error(`Expected 201, got ${status}`);
      if (!data.data?.id) throw new Error("No organization ID returned");

      testOrgId = data.data.id;
    },
  );

  await runTest(
    "GET /api/v1/organizations - should get all organizations",
    async () => {
      const { status, data } = await request(
        "GET",
        "/api/v1/organizations",
        undefined,
        authToken,
      );

      if (status !== 200)
        throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data.data))
        throw new Error("Expected array of organizations");
      if (data.data.length === 0) throw new Error("No organizations returned");
    },
  );

  await runTest(
    "GET /api/v1/organizations/:id - should get organization by ID",
    async () => {
      const { status, data } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}`,
        undefined,
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
      if (!data.data?.id) throw new Error("No organization data returned");
      if (data.data.id !== testOrgId)
        throw new Error("Wrong organization returned");
    },
  );

  await runTest(
    "PUT /api/v1/organizations/:id - should update organization",
    async () => {
      const { status, data } = await request(
        "PUT",
        `/api/v1/organizations/${testOrgId}`,
        {
          name: "Updated Organization",
        },
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
      if (!data.data) throw new Error("No organization data returned");
    },
  );

  // ==================== MEMBERSHIP TESTS ====================

  await runTest("Register member user for membership tests", async () => {
    memberEmail = `member${Date.now()}@example.com`;

    const { status, data } = await request("POST", "/api/v1/auth/register", {
      firstName: "Member",
      lastName: "User",
      email: memberEmail,
      password: "password123",
    });

    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    if (!data.data?.user?.id) throw new Error("No user ID returned");

    memberUserId = data.data.user.id;
    memberAuthToken = data.data.token;
  });

  await runTest(
    "POST /api/v1/organizations/:id/members - should add member",
    async () => {
      const { status, data } = await request(
        "POST",
        `/api/v1/organizations/${testOrgId}/members`,
        {
          email: memberEmail,
          role: "member",
        },
        authToken,
      );

      if (status !== 201)
        throw new Error(`Expected 201, got ${status}: ${JSON.stringify(data)}`);
      if (!data.data?.userId) throw new Error("No membership data returned");

      testMemberId = data.data.userId;
    },
  );

  await runTest(
    "GET /api/v1/organizations/:id/members - should get all members",
    async () => {
      const { status, data } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}/members`,
        undefined,
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
      if (!Array.isArray(data.data))
        throw new Error("Expected array of members");
      if (data.data.length < 2) throw new Error("Expected at least 2 members");
    },
  );

  // ==================== API KEYS TESTS ====================

  await runTest(
    "POST /api/v1/organizations/:id/apikeys - should create API key",
    async () => {
      const { status, data } = await request(
        "POST",
        `/api/v1/organizations/${testOrgId}/apikeys`,
        {
          name: "Test API Key",
        },
        authToken,
      );

      if (status !== 201) throw new Error(`Expected 201, got ${status}`);
      if (!data.data?.id) throw new Error("No API key ID returned");
      if (!data.data?.key) throw new Error("No API key value returned");

      testApiKeyId = data.data.id;
      testRawApiKey = data.data.key; // save for agent proxy tests
    },
  );

  await runTest(
    "GET /api/v1/organizations/:id/apikeys - should list API keys",
    async () => {
      const { status, data } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}/apikeys`,
        undefined,
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
      if (!Array.isArray(data.data))
        throw new Error("Expected array of API keys");
      if (data.data.length === 0) throw new Error("No API keys returned");
    },
  );

  // ==================== AGENT PROXY TESTS ====================

  // First check if the GenAI service is reachable
  await runTest("Check GenAI service availability", async () => {
    try {
      const response = await fetch(`${GENAI_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        genaiServiceAvailable = true;
        console.log("   ✓ GenAI service is available");
      } else {
        console.log(`   ⚠ GenAI service returned ${response.status} — agent tests will be skipped`);
      }
    } catch {
      console.log("   ⚠ GenAI service is not reachable — agent tests will be skipped");
    }
  });

  // -- Auth tests for agent routes --

  await runTest(
    "GET /api/v1/organizations/:id/agents - should reject unauthenticated request",
    async () => {
      const { status } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}/agents`,
      );
      if (status !== 401) throw new Error(`Expected 401, got ${status}`);
    },
  );

  await runTest(
    "GET /api/v1/organizations/:id/agents - should authenticate via JWT Bearer token",
    async () => {
      const { status, data } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}/agents`,
        undefined,
        authToken,
      );
      // Auth passed: 200 if genai up, 502 if genai unreachable (but NOT 400/401/403)
      if (status === 401 || status === 403)
        throw new Error(`Auth failed — got ${status}: ${JSON.stringify(data)}`);
      if (status !== 200 && status !== 502)
        throw new Error(`Expected 200 or 502, got ${status}: ${JSON.stringify(data)}`);
    },
  );

  // Create a second API key specifically for the auth test (keep it separate from the
  // one used in API key list/revoke tests so we don't accidentally test with a revoked key)
  let agentTestApiKey: string = "";
  let agentTestApiKeyId: string = "";
  await runTest("Create dedicated API key for agent auth tests", async () => {
    const { status, data } = await request(
      "POST",
      `/api/v1/organizations/${testOrgId}/apikeys`,
      { name: "Agent Auth Test Key" },
      authToken,
    );
    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    agentTestApiKey = data.data.key;
    agentTestApiKeyId = data.data.id;
  });

  await runTest(
    "GET /api/v1/organizations/:id/agents - should authenticate via X-API-Key header",
    async () => {
      if (!agentTestApiKey) {
        throw new Error("No API key available for test — key creation must have passed");
      }
      const { status, data } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}/agents`,
        undefined,
        undefined, // no JWT
        { "X-API-Key": agentTestApiKey },
      );
      // Auth passed: 200 if genai up, 502 if genai unreachable (but NOT 400/401/403)
      if (status === 401 || status === 403)
        throw new Error(`Auth failed — got ${status}: ${JSON.stringify(data)}`);
      if (status !== 200 && status !== 502)
        throw new Error(`Expected 200 or 502, got ${status}: ${JSON.stringify(data)}`);
    },
  );

  await runTest(
    "GET /api/v1/organizations/:id/agents - should reject invalid API key",
    async () => {
      const { status } = await request(
        "GET",
        `/api/v1/organizations/${testOrgId}/agents`,
        undefined,
        undefined,
        { "X-API-Key": "ak_invalid_key_that_does_not_exist" },
      );
      if (status !== 401) throw new Error(`Expected 401, got ${status}`);
    },
  );

  // -- Agent run tests (only if GenAI service is available) --

  if (genaiServiceAvailable) {
    await runTest(
      "GET /api/v1/organizations/:id/agents - should list agents",
      async () => {
        const { status, data } = await request(
          "GET",
          `/api/v1/organizations/${testOrgId}/agents`,
          undefined,
          authToken,
        );
        if (status !== 200)
          throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data)}`);
        if (!data.data?.agents) throw new Error("No agents list in response");
        if (!Array.isArray(data.data.agents)) throw new Error("Agents should be an array");
      },
    );

    await runTest(
      "POST /api/v1/organizations/:id/agents/run - should queue a fire-and-forget run",
      async () => {
        const { status, data } = await request(
          "POST",
          `/api/v1/organizations/${testOrgId}/agents/run`,
          {
            agent_id: "echo",
            messages: [{ role: "user", content: "Hello from test!" }],
          },
          authToken,
        );
        if (status !== 202)
          throw new Error(`Expected 202, got ${status}: ${JSON.stringify(data)}`);
        if (!data.data?.session_id) throw new Error("No session_id returned");
      },
    );

    await runTest(
      "POST /api/v1/organizations/:id/agents/run/sync - should run synchronously",
      async () => {
        const { status, data } = await request(
          "POST",
          `/api/v1/organizations/${testOrgId}/agents/run/sync`,
          {
            agent_id: "echo",
            messages: [{ role: "user", content: "Sync test!" }],
          },
          authToken,
        );
        if (status !== 200)
          throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data)}`);
        if (!data.data?.session_id) throw new Error("No session_id returned");
        if (!data.data?.status) throw new Error("No status in response");
      },
    );

    await runTest(
      "POST /api/v1/organizations/:id/agents/run - should fail with empty messages",
      async () => {
        const { status } = await request(
          "POST",
          `/api/v1/organizations/${testOrgId}/agents/run`,
          {
            agent_id: "echo",
            messages: [], // empty array — should fail validation
          },
          authToken,
        );
        if (status !== 400) throw new Error(`Expected 400, got ${status}`);
      },
    );

    await runTest(
      "POST /api/v1/organizations/:id/agents/run - should fail with invalid message role",
      async () => {
        const { status } = await request(
          "POST",
          `/api/v1/organizations/${testOrgId}/agents/run`,
          {
            messages: [{ role: "system", content: "invalid role" }], // 'system' not in enum
          },
          authToken,
        );
        if (status !== 400) throw new Error(`Expected 400, got ${status}`);
      },
    );
  } else {
    console.log("\n⚠  GenAI service not available — skipping agent run tests");
    console.log(`   Start the service at ${GENAI_SERVICE_URL} to run these tests.\n`);
  }

  // ==================== CLEANUP TESTS ====================

  // Revoke both API keys created during the test
  await runTest(
    "DELETE /api/v1/organizations/:id/apikeys/:keyId - should revoke test API key",
    async () => {
      const { status } = await request(
        "DELETE",
        `/api/v1/organizations/${testOrgId}/apikeys/${testApiKeyId}`,
        undefined,
        authToken,
      );
      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    },
  );

  await runTest(
    "DELETE /api/v1/organizations/:id/apikeys/:keyId - should revoke agent auth test API key",
    async () => {
      if (!agentTestApiKeyId) return; // key was never created — skip
      const { status } = await request(
        "DELETE",
        `/api/v1/organizations/${testOrgId}/apikeys/${agentTestApiKeyId}`,
        undefined,
        authToken,
      );
      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    },
  );

  await runTest(
    "DELETE /api/v1/organizations/:id/members/:userId - should remove member",
    async () => {
      const { status } = await request(
        "DELETE",
        `/api/v1/organizations/${testOrgId}/members/${testMemberId}`,
        undefined,
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    },
  );

  await runTest(
    "DELETE /api/v1/organizations/:id - should delete organization",
    async () => {
      const { status } = await request(
        "DELETE",
        `/api/v1/organizations/${testOrgId}`,
        undefined,
        authToken,
      );

      if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    },
  );

  // ==================== SUMMARY ====================

  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Duration: ${totalDuration}ms`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}`);
        console.log(`     ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
