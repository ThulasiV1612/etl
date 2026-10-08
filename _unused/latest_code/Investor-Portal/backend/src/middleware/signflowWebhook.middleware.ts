import express, { type Request, type Response, type NextFunction } from "express";

export type RawBodyRequest = Request & { rawBody?: Buffer };

const signflowJsonParser = express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf;
  },
});

/** Parse SignFlow JSON webhooks and preserve raw bytes for HMAC verification. */
export function signflowWebhookBodyParser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  signflowJsonParser(req, res, next);
}
