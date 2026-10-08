/**
 * Safe, allow-listed identifier snippets for audit rows (emails / login names only).
 */

import type { Request } from "express";
import { requestPathOnly } from "./http-meta.js";

export function extractAuditIdentifier(req: Request): string | undefined {
  const pathOnly = requestPathOnly(req);
  const method = req.method.toUpperCase();
  const body = req.body;
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;

  if (method === "POST" && pathOnly.endsWith("/auth/signin")) {
    const v = rec.emailOrUsername;
    return typeof v === "string" ? v.trim() : undefined;
  }
  if (
    method === "POST" &&
    (pathOnly.includes("/auth/forgot-password") ||
      pathOnly.includes("/auth/reset-password") ||
      pathOnly.includes("/auth/signup") ||
      pathOnly.includes("/auth/invite"))
  ) {
    const v = rec.email;
    return typeof v === "string" ? v.trim() : undefined;
  }
  if (method === "POST" && pathOnly.includes("/contacts") && !pathOnly.includes("export-notify")) {
    const v = rec.email;
    return typeof v === "string" ? v.trim() : undefined;
  }
  return undefined;
}
