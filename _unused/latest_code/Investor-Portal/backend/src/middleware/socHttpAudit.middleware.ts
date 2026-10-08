/**
 * Global SOC audit for every /api/v1 request (structured Pino + soc_auth_audit_logs row).
 * Mount after express.json() so JSON bodies are available for allowlisted identifier extraction.
 *
 * Privacy: no passwords, no raw Authorization header; user id from verified JWT only.
 */

import type { NextFunction, Request, Response } from "express";
import { getAuditMachineIp } from "../config/auditMachineIp.js";
import { getAuditRequestUrl } from "../config/auditRequestUrl.js";
import {
  auditHumanMessage,
  classifyHttpAuditOutcome,
  deriveAuditModule,
  deriveSemanticAuditEvent,
  extractAuditIdentifier,
  getAuditClientIp,
  omitUndefined,
  requestPathOnly,
  resolveAuditUserId,
} from "../audit/index.js";
import { socAuditBaseLogger } from "../logging/soc-audit.logger.js";
import {
  insertSocAuditRow,
  type SocAuditPayload,
} from "../services/soc/socAuthAudit.service.js";

export function socHttpAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();
  const pathOnly = requestPathOnly(req);
  const clientIp = getAuditClientIp(req);
  const requestedMachineIp = getAuditMachineIp();
  const requestUrl = getAuditRequestUrl(req);
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? req.headers["user-agent"]
      : "";
  const identifier = extractAuditIdentifier(req) ?? null;

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const httpStatus = res.statusCode;
    const outcome = classifyHttpAuditOutcome(httpStatus);
    const event = deriveSemanticAuditEvent(pathOnly, req.method);
    const moduleName = deriveAuditModule(pathOnly);
    const userId = resolveAuditUserId(req, res) ?? null;

    const dbPayload: SocAuditPayload = {
      event,
      outcome,
      httpStatus,
      durationMs,
      method: req.method,
      path: pathOnly,
      identifier,
      clientIp: clientIp || null,
      requestedMachineIp: requestedMachineIp || null,
      requestUrl: requestUrl || null,
      userAgent: userAgent || null,
      userId,
    };

    const logRecord = omitUndefined({
      message: auditHumanMessage({
        event,
        outcome,
        httpStatus,
        method: req.method,
        pathOnly,
      }),
      module: moduleName,
      event,
      outcome,
      httpStatus,
      durationMs,
      method: req.method,
      path: pathOnly,
      requestUrl,
      userId: userId ?? undefined,
      identifier: identifier ?? undefined,
      clientIp: clientIp || undefined,
      userAgent: userAgent || undefined,
      requested_machine_ip: requestedMachineIp || undefined,
    });

    socAuditBaseLogger.info(logRecord);

    void insertSocAuditRow(dbPayload).catch((err: unknown) => {
      socAuditBaseLogger.error({
        message: "Failed to persist SOC audit row to database",
        error: err instanceof Error ? err : new Error(String(err)),
        event,
        module: moduleName,
        method: req.method,
        path: pathOnly,
      });
    });
  });

  next();
}
