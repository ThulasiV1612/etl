/**
 * Request-scoped portal mode (Investing vs Syndicating).
 * Investing Mode applies CRM Contacts Visibility (`show_offerings_visibility`)
 * to LP investors and to Lead / Admin / Co-sponsor / company members who switch modes.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

const PORTAL_MODE_HEADER = "x-portal-mode";

const portalModeStore = new AsyncLocalStorage<{ investingMode: boolean }>();

function queryFlag(raw: unknown): string {
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim().toLowerCase();
  return String(raw ?? "").trim().toLowerCase();
}

export function investingModeFromRequest(req: Request): boolean {
  const headerRaw = req.headers[PORTAL_MODE_HEADER];
  const header = Array.isArray(headerRaw)
    ? String(headerRaw[0] ?? "")
    : String(headerRaw ?? "");
  if (header.trim().toLowerCase() === "investing") return true;
  const inc = queryFlag(req.query.includeParticipantDeals);
  return inc === "1" || inc === "true" || inc === "yes";
}

/** True when this request is Investing Mode (header or participant-deal list). */
export function isInvestingPortalRequest(): boolean {
  return portalModeStore.getStore()?.investingMode === true;
}

export function portalModeContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  portalModeStore.run(
    { investingMode: investingModeFromRequest(req) },
    () => next(),
  );
}
