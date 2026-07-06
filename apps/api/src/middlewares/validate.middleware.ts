import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { ApiError } from "@/shared/utils/ApiError";

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        // Zod v4 uses .issues; older versions used .errors (same data)
        const issues = (error as any).issues ?? (error as any).errors ?? [];
        const formattedErrors = issues.map((issue: any) => ({
          field: issue.path?.join(".") ?? "",
          message: issue.message,
        }));
        throw new ApiError(400, "Validation Error", formattedErrors);
      }
      next(error);
    }
  };
};
