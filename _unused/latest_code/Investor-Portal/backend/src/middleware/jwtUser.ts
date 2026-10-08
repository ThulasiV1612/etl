import type { Request } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/auth.js";
import { isAccessTokenActive } from "../services/auth/token.service.js";

export type JwtUserPayload = {
  id?: string;
  email?: string;
  userRole?: string;
  jti?: string;
  typ?: string;
};

export function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

function decodeJwtUser(token: string): JwtUserPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtUserPayload;
  } catch {
    return null;
  }
}

/**
 * Verify JWT signature/expiry only (no DB check). Prefer {@link getValidJwtUser} for API auth.
 */
export function getJwtUser(req: Request): JwtUserPayload | null {
  const token = bearerToken(req);
  if (!token) return null;
  return decodeJwtUser(token);
}

/**
 * Verify access JWT and ensure the token row in `user_auth_tokens` is still active.
 */
export async function getValidJwtUser(
  req: Request,
): Promise<JwtUserPayload | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const payload = decodeJwtUser(token);
  if (!payload?.id) return null;

  const typ = String(payload.typ ?? "").trim().toLowerCase();
  if (typ && typ !== "access") return null;

  const jti = String(payload.jti ?? "").trim();
  if (!jti) return null;

  const active = await isAccessTokenActive(jti);
  if (!active) return null;

  return payload;
}
