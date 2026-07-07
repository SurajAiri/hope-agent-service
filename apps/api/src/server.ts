import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./configs/swagger";
import { db } from "./db/index";
import { getRedis } from "./configs/redis";

// ── Route imports ─────────────────────────────────────────────────────────
import authRoutes from "./features/access/auth/auth.routes";
import userRoutes from "./features/access/users/user.routes";
import orgRoutes from "./features/access/organization/organization.routes";
import membershipRoutes from "./features/access/membership/membership.routes";
import apiKeyRoutes from "./features/access/api/api.routes";
import agentRoutes from "./features/agents/agent.routes";
import runRoutes from "./features/run/run.routes";
import tracesRoutes from "./features/traces/traces.routes";
import analyticsRoutes from "./features/analytics/analytics.routes";

// ── Error handler ─────────────────────────────────────────────────────────
import { errorHandler } from "./middlewares/error.middleware";

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

// ── Eagerly initialise Redis connection on startup ────────────────────────
getRedis();

// ── Swagger documentation ─────────────────────────────────────────────────
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ── API routes ────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);

// Developer flat run endpoints (X-Hope-Token auth — no org ID in URL)
app.use("/api/v1/run", runRoutes);

// Agent routes must be mounted BEFORE org routes to prevent the org router's
// global authMiddleware from intercepting API-key-authenticated agent requests.
app.use("/api/v1/organizations/:organizationId/agents", agentRoutes);
app.use("/api/v1/organizations", orgRoutes);
app.use("/api/v1/organizations/:organizationId/members", membershipRoutes);
app.use("/api/v1/organizations/:organizationId/apikeys", apiKeyRoutes);
app.use("/api/v1/organizations/:organizationId/traces", tracesRoutes);
app.use("/api/v1/organizations/:organizationId/analytics", analyticsRoutes);

// ── Health / root ─────────────────────────────────────────────────────────
app.get("/", (_, res) => {
  res.json({ message: "Hope API running" });
});

// ── Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[Hope] Server running on port ${PORT}`);
});
