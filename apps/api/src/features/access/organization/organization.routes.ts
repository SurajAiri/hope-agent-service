import { Router } from "express";
import { OrganizationController } from "./organization.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { authMiddleware } from "../../../middlewares/auth.middleware";
import { requireOrganizationRole } from "../../../middlewares/org.middleware";
import { createOrganizationSchema, updateOrganizationSchema } from "./organization.validation";

const router = Router();
const orgController = new OrganizationController();

// Must be authenticated for all org routes
router.use(authMiddleware);

router.post("/", validate(createOrganizationSchema), orgController.create);
router.get("/", orgController.getAll);

// Requires organization role for specific org actions
router.get("/:organizationId", requireOrganizationRole(["owner", "admin", "member"]), orgController.getById);
router.put("/:organizationId", requireOrganizationRole(["owner", "admin"]), validate(updateOrganizationSchema), orgController.update);
router.delete("/:organizationId", requireOrganizationRole(["owner"]), orgController.delete);

export default router;
