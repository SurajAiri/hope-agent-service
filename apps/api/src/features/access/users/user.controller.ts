import { Request, Response } from "express";

import { UserService } from "./user.service";
import { createUserSchema, updateUserSchema } from "./user.schema";

const userService = new UserService();

export class UserController {
  async create(req: Request, res: Response) {
    const body = createUserSchema.parse(req.body);

    const user = await userService.createUser(body);

    return res.status(201).json({
      success: true,
      data: user,
    });
  }

  async getMe(req: Request, res: Response) {
    const userId = req.user!.id as string;

    const user = await userService.getUser(userId);

    return res.json({
      success: true,
      data: user,
    });
  }

  async update(req: Request, res: Response) {
    const userId = req.user!.id as string;
    const body = updateUserSchema.parse(req.body);

    const user = await userService.updateUser(userId, body);

    return res.json({
      success: true,
      data: user,
    });
  }
}
