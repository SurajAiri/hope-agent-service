import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./configs/swagger";
import { db } from "./db/index";

// ── Route imports (must be at the top in ESM / NodeNext) ──────────────────
import authRoutes from "./features/access/auth/auth.routes";
import userRoutes from "./features/access/users/user.routes";
import orgRoutes from "./features/access/organization/organization.routes";
import membershipRoutes from "./features/access/membership/membership.routes";
import apiKeyRoutes from "./features/access/api/api.routes";
import agentRoutes from "./features/agents/agent.routes";

// ── Error handler (import before usage at the bottom) ────────────────────
import { errorHandler } from "./middlewares/error.middleware";

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

// ── Swagger documentation ─────────────────────────────────────────────────
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ── API routes ────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
// Agent routes must be mounted BEFORE org routes to prevent the org router's
// global authMiddleware from intercepting API-key-authenticated agent requests.
app.use("/api/v1/organizations/:organizationId/agents", agentRoutes);
app.use("/api/v1/organizations", orgRoutes);
app.use("/api/v1/organizations/:organizationId/members", membershipRoutes);
app.use("/api/v1/organizations/:organizationId/apikeys", apiKeyRoutes);

// ── Health / root ─────────────────────────────────────────────────────────
app.get("/", (_, res) => {
  res.json({ message: "API running" });
});

// ── Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
