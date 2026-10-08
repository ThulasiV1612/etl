/**
 * Full request URL for SOC audit logs (method-specific callers may still log POST bodies separately).
 *
 * Uses Host / X-Forwarded-Host and X-Forwarded-Proto when present (reverse proxy).
 * If host is missing, returns path + query only (originalUrl).
 */

import type { Request } from "express";

export function getAuditRequestUrl(req: Request): string {
  const pathWithQuery = req.originalUrl ?? req.url ?? "";
  const host =
    req.get("x-forwarded-host")?.trim() ?? req.get("host")?.trim() ?? "";
  const protoPart =
    req.get("x-forwarded-proto")?.trim() ??
    (typeof req.protocol === "string" ? req.protocol : "");
  const proto =
    (protoPart.includes(",") ? protoPart.split(",")[0] : protoPart)?.trim() ||
    "http";
  if (host) return `${proto}://${host}${pathWithQuery}`;
  return pathWithQuery;
}
