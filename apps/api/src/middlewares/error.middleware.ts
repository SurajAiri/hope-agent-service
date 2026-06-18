import { Request, Response, NextFunction } from "express";
import { ApiError } from "../shared/utils/ApiError";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = err;

  // Add logging so errors are visible in the terminal
  console.error(`[Error] ${req.method} ${req.url} >>`, err.message || err);
  if (err.stack && process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || error instanceof Error ? 400 : 500;
    const message = error.message || "Internal Server Error";
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  const response = {
    ...error,
    message: error.message,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };

  return res.status(error.statusCode).json(response);
};
