import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { ApiError } from "../shared/utils/ApiError";

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log(req.body);
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      if (error instanceof ZodError) {
        console.error("Validation Error: ", error);
        throw new ApiError(400, "Validation Error", (error as any).errors);
      }
      next(error);
    }
  };
};
