import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;

  constructor(status: number, message: string, expose = true) {
    super(message);
    this.status = status;
    this.expose = expose;
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: "Not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({
      message: err.expose ? err.message : "Request failed",
    });
    return;
  }

  const corsMsg =
    err instanceof Error && err.message.startsWith("CORS:")
      ? err.message.replace(/^CORS:\s*/, "")
      : null;
  if (corsMsg) {
    res.status(403).json({ message: corsMsg });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error("[api] unhandled error:", message);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  res.status(500).json({
    message: "An unexpected error occurred. Please try again.",
  });
}
