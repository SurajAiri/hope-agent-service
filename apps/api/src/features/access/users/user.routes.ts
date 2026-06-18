import express from "express";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { UserController } from "./user.controller";

const router = express.Router();
const userController = new UserController();

// router.post("/", userController.create);
router.get("/", authMiddleware, userController.getMe);
router.put("/", authMiddleware, userController.update);
router.delete("/", authMiddleware, userController.delete);

export default router;
