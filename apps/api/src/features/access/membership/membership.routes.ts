import { Router } from "express";
import { MembershipController } from "./membership.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { authMiddleware } from "../../../middlewares/auth.middleware";
import { requireOrganizationRole } from "../../../middlewares/org.middleware";
import { addMemberSchema } from "./membership.validation";

const router = Router({ mergeParams: true }); // allows getting :organizationId from parent router
const membershipController = new MembershipController();

router.use(authMiddleware);

router.post(
  "/",
  requireOrganizationRole(["owner", "admin"]),
  validate(addMemberSchema),
  membershipController.addMember
);

router.get(
  "/",
  requireOrganizationRole(["owner", "admin", "member"]),
  membershipController.getMembers
);

router.delete(
  "/:userId",
  requireOrganizationRole(["owner", "admin"]),
  membershipController.removeMember
);

export default router;
