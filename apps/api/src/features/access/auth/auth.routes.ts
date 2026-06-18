import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { authMiddleware } from "../../../middlewares/auth.middleware";
import { loginSchema, registerSchema } from "./auth.validation";

const router = Router();
const authController = new AuthController();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.get("/me", authMiddleware, authController.getMe);

export default router;
