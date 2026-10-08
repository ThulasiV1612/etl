/**
 * Shared Pino configuration: structured JSON with stable field names for SOC / app logs.
 *
 * - level + levelLabel via formatters.level
 * - ISO time exposed as "timestamp" (see formatters.log); optional legacy "time" / "msg" via env
 * - Main line text uses messageKey "message" (not "msg")
 * - Base bindings: service, env, version
 * - errors logged under key "error" include message + stack (serializers.error)
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");

function loadPackageVersion(): string {
  try {
    const raw = readFileSync(path.join(backendRoot, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version?.trim() ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const packageVersion = loadPackageVersion();

function shouldEmitLegacyPinoKeys(): boolean {
  const v =
    process.env.LOG_LEGACY_DUPLICATE_KEYS?.trim() ??
    process.env.SOC_AUDIT_LOG_LEGACY_KEYS?.trim();
  return v === "1" || v === "true";
}

export function serializeAuditError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      type: err.constructor.name,
      message: err.message,
      stack: err.stack ?? "",
    };
  }
  return { message: String(err) };
}

export interface StructuredPinoFactoryOptions {
  /** Writable destination (e.g. pino.destination(...)). */
  destination: pino.DestinationStream | NodeJS.WritableStream;
  /** Logical service name in every log line. */
  serviceName?: string;
  /** Pino level (defaults LOG_LEVEL / SOC_AUDIT_LOG_LEVEL / info). */
  level?: string;
}

/**
 * Creates a root logger with standard formatters. Use `.child({ module: "..." })` per component.
 */
export function createStructuredPinoLogger(
  options: StructuredPinoFactoryOptions,
): pino.Logger {
  const service =
    options.serviceName?.trim() ??
    process.env.LOG_SERVICE_NAME?.trim() ??
    "investor-portal-api";
  const level =
    options.level?.trim() ??
    process.env.SOC_AUDIT_LOG_LEVEL?.trim() ??
    process.env.LOG_LEVEL?.trim() ??
    "info";
  const version = process.env.APP_VERSION?.trim() ?? packageVersion;

  return pino(
    {
      level,
      messageKey: "message",
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service,
        env: process.env.NODE_ENV ?? "development",
        version,
      },
      formatters: {
        level(label: string, number: number) {
          return { level: number, levelLabel: label };
        },
        log(object: Record<string, unknown>) {
          const o = { ...object };
          if ("time" in o && o.time !== undefined) {
            o.timestamp = o.time;
            delete o.time;
            if (shouldEmitLegacyPinoKeys()) o.time = o.timestamp;
          }
          if (
            "msg" in o &&
            o.msg !== undefined &&
            !("message" in o && o.message !== undefined)
          ) {
            o.message = o.msg;
            delete o.msg;
            if (shouldEmitLegacyPinoKeys()) o.msg = o.message;
          }
          if (
            "message" in o &&
            o.message !== undefined &&
            shouldEmitLegacyPinoKeys() &&
            !("msg" in o)
          ) {
            o.msg = o.message;
          }
          return o;
        },
      },
      serializers: {
        error: serializeAuditError,
      },
    },
    options.destination,
  );
}
