/**
 * SOC / security audit logging (Pino) — file destination with shared structured format.
 *
 * - socAuditBaseLogger: use for all HTTP audit lines (module is set per log in middleware).
 *
 * Configuration: SOC_AUDIT_LOG_PATH, SOC_AUDIT_LOG_LEVEL, LOG_SERVICE_NAME, APP_VERSION,
 * LOG_LEGACY_DUPLICATE_KEYS, SOC_AUDIT_LOG_LEGACY_KEYS.
 *
 * Do not log secrets (passwords, tokens).
 */

import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { createStructuredPinoLogger } from "./structured-pino.factory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");
const defaultLogFile = path.join(backendRoot, "logs", "soc-audit.log");

function resolveAuditLogFilePath(): string {
  const fromEnv = process.env.SOC_AUDIT_LOG_PATH?.trim();
  if (!fromEnv) return defaultLogFile;
  return path.isAbsolute(fromEnv)
    ? fromEnv
    : path.resolve(process.cwd(), fromEnv);
}

const auditLogFilePath = resolveAuditLogFilePath();
mkdirSync(path.dirname(auditLogFilePath), { recursive: true });

const destinationStream = pino.destination({
  dest: auditLogFilePath,
  sync: false,
});

const serviceName =
  process.env.SOC_LOG_SERVICE_NAME?.trim() ??
  process.env.LOG_SERVICE_NAME?.trim() ??
  "investor-portal-api";

const rootStructured = createStructuredPinoLogger({
  destination: destinationStream,
  serviceName,
});

/** SOC audit channel + structured fields (module attached per log line in middleware). */
export const socAuditBaseLogger = rootStructured.child({ channel: "soc_audit" });

/** @deprecated Use socAuditBaseLogger — HTTP audit is global on /api/v1 */
export const socAuditLogger = socAuditBaseLogger;
