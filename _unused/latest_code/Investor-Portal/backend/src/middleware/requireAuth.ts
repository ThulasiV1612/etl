import type { NextFunction, Request, Response } from "express";
import { getValidJwtUser, type JwtUserPayload } from "./jwtUser.js";

export type AuthenticatedRequest = Request & {
  portalUser?: JwtUserPayload;
};

/**
 * Requires a valid access JWT (DB-backed jti). Sets `req.portalUser` on success.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  req.portalUser = user;
  next();
}
