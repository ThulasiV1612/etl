import express, { type Request, type Response, type NextFunction } from "express";

export type RawBodyRequest = Request & { rawBody?: Buffer };

const stripeRawParser = express.raw({
  type: "application/json",
  limit: "1mb",
});

/** Preserve raw bytes for Stripe webhook signature verification. */
export function stripeWebhookBodyParser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  stripeRawParser(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    if (Buffer.isBuffer(req.body)) {
      (req as RawBodyRequest).rawBody = req.body;
    }
    next();
  });
}
