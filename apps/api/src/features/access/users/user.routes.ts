import express from "express";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { UserController } from "./user.controller";

const router = express.Router();
const userController = new UserController();

router.post("/", userController.create);
router.get("/me", authMiddleware, userController.getMe);
router.put("/me", authMiddleware, userController.update);

export default router;
