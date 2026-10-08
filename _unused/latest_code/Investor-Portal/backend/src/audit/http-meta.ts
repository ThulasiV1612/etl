/**
 * Low-level HTTP fields for SOC audit (no secrets).
 */

import type { Request, Response } from "express";
import { getJwtUser } from "../middleware/jwtUser.js";

export function getAuditClientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0]?.trim() ?? "";
  if (Array.isArray(xf) && xf[0]) return xf[0];
  return req.socket?.remoteAddress ?? "";
}

export function getAuditRequestId(req: Request): string | undefined {
  const raw =
    req.headers["x-request-id"] ?? req.headers["x-correlation-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

export function getAuditSessionId(req: Request): string | undefined {
  const fromHeader =
    req.headers["x-session-id"] ?? req.headers["x-sessionid"];
  if (typeof fromHeader === "string" && fromHeader.trim()) return fromHeader.trim();
  if (Array.isArray(fromHeader) && fromHeader[0]?.trim())
    return fromHeader[0].trim();
  const cookie = req.headers.cookie;
  if (!cookie) return undefined;
  const m =
    /(?:^|;\s*)sessionId=([^;]+)/i.exec(cookie) ??
    /(?:^|;\s*)connect\.sid=([^;]+)/i.exec(cookie);
  const raw = m?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

export function requestPathOnly(req: Request): string {
  const full = req.originalUrl ?? req.url ?? "";
  return full.split("?")[0] ?? "";
}

export function classifyHttpAuditOutcome(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 400) return "success";
  if (statusCode === 401 || statusCode === 403) return "auth_failure";
  if (statusCode >= 500) return "server_error";
  return "client_error";
}

export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export function optionalUserIdFromLocals(res: Response): string | undefined {
  const loc = res.locals as Record<string, unknown>;
  for (const key of ["userId", "socAuditUserId"] as const) {
    const v = loc[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function optionalUserIdFromJwt(req: Request): string | undefined {
  const u = getJwtUser(req);
  const id = u?.id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

export function resolveAuditUserId(req: Request, res: Response): string | undefined {
  return optionalUserIdFromJwt(req) ?? optionalUserIdFromLocals(res);
}
