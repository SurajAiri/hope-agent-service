import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./configs/swagger";
import { db } from "./db/index";
import { UserTable } from "./db/schema";

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

// Swagger documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

import authRoutes from "./features/access/auth/auth.routes";
import userRoutes from "./features/access/users/user.routes";
import orgRoutes from "./features/access/organization/organization.routes";
import membershipRoutes from "./features/access/membership/membership.routes";
import apiRoutes from "./features/access/api/api.routes";

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/organizations", orgRoutes);
app.use("/api/v1/organizations/:organizationId/members", membershipRoutes);
app.use("/api/v1/organizations/:organizationId/apikeys", apiRoutes);

app.get("/", (_, res) => {
  res.json({
    message: "API running",
  });
});

import { errorHandler } from "./middlewares/error.middleware";

// Global Error Handler should be the last middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
