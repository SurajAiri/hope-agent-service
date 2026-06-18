import { Router } from "express";
import { ApiController } from "./api.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { authMiddleware } from "../../../middlewares/auth.middleware";
import { requireOrganizationRole } from "../../../middlewares/org.middleware";
import { createApiKeySchema } from "./api.validation";

const router = Router({ mergeParams: true });
const apiController = new ApiController();

router.use(authMiddleware);

router.post(
  "/",
  requireOrganizationRole(["owner", "admin"]),
  validate(createApiKeySchema),
  apiController.createApiKey
);

router.get(
  "/",
  requireOrganizationRole(["owner", "admin"]),
  apiController.listApiKeys
);

router.delete(
  "/:keyId",
  requireOrganizationRole(["owner", "admin"]),
  apiController.revokeApiKey
);

export default router;
