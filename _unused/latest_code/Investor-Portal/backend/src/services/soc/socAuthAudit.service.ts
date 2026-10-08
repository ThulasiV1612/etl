/**
 * Persists SOC audit payloads to PostgreSQL (soc_auth_audit_logs).
 * Used for all audited HTTP traffic under /api/v1.
 */

import { db } from "../../database/db.js";
import { socAuthAuditLogs } from "../../schema/socAuthAudit.schema.js";

export interface SocAuditPayload {
  event: string;
  outcome: string;
  httpStatus: number;
  durationMs: number;
  method: string;
  path: string;
  identifier: string | null;
  clientIp: string | null;
  requestedMachineIp: string | null;
  requestUrl: string | null;
  userAgent: string | null;
  userId: string | null;
}

export async function insertSocAuditRow(payload: SocAuditPayload): Promise<void> {
  const nz = (s: string | null | undefined) =>
    s != null && String(s).trim() !== "" ? String(s).trim() : null;

  await db.insert(socAuthAuditLogs).values({
    event: payload.event,
    outcome: payload.outcome,
    httpStatus: payload.httpStatus,
    durationMs: payload.durationMs,
    method: nz(payload.method),
    path: nz(payload.path),
    identifier: nz(payload.identifier),
    clientIp: nz(payload.clientIp),
    requestedMachineIp: nz(payload.requestedMachineIp),
    requestUrl: nz(payload.requestUrl),
    userAgent: nz(payload.userAgent),
    userId: nz(payload.userId),
  });
}

/** @deprecated Use SocAuditPayload */
export type SocAuthAuditPayload = SocAuditPayload;

/** @deprecated Use insertSocAuditRow */
export const insertSocAuthAuditRow = insertSocAuditRow;
