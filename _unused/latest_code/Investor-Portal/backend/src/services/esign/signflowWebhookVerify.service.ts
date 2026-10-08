import { createHmac, timingSafeEqual } from "node:crypto";
import { getSignFlowConfig } from "../../config/signflow.config.js";

const SIGNATURE_HEADERS = [
  "x-signflow-signature",
  "x-api-signature",
  "x-webhook-signature",
] as const;

const TIMESTAMP_HEADERS = [
  "x-signflow-timestamp",
  "x-api-timestamp",
  "x-webhook-timestamp",
] as const;

const MAX_SKEW_MS = 5 * 60 * 1000;

function webhookSecret(): string | null {
  const explicit = process.env.SIGNFLOW_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  return getSignFlowConfig()?.apiKey?.trim() || null;
}

function headerValue(
  headers: Record<string, unknown>,
  names: readonly string[],
): string {
  for (const name of names) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) {
      return raw[0].trim();
    }
  }
  return "";
}

function parseSignatureHeader(value: string): { timestamp: string; signature: string } {
  const trimmed = value.trim();
  if (!trimmed) return { timestamp: "", signature: "" };

  if (trimmed.includes("=")) {
    let timestamp = "";
    let signature = "";
    for (const part of trimmed.split(",")) {
      const [k, v] = part.split("=").map((s) => s.trim());
      if (!k || !v) continue;
      if (k === "t" || k === "timestamp") timestamp = v;
      if (k === "v1" || k === "sig" || k === "signature") signature = v;
    }
    if (signature) return { timestamp, signature };
  }

  return { timestamp: "", signature: trimmed };
}

function timingSafeHexEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function timestampFresh(timestamp: string): boolean {
  if (!timestamp) return true;
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return false;
  const ms = n < 1_000_000_000_000 ? n * 1000 : n;
  return Math.abs(Date.now() - ms) <= MAX_SKEW_MS;
}

/**
 * Verifies SignFlow webhook HMAC (header + raw body).
 * Secret: SIGNFLOW_WEBHOOK_SECRET, else SIGNFLOW_API_KEY.
 */
export function verifySignFlowWebhookSignature(params: {
  headers: Record<string, unknown>;
  rawBody: Buffer | string;
}): boolean {
  const secret = webhookSecret();
  if (!secret) return false;

  const raw =
    typeof params.rawBody === "string"
      ? params.rawBody
      : params.rawBody.toString("utf8");

  const sigHeader =
    headerValue(params.headers, SIGNATURE_HEADERS) ||
    headerValue(params.headers, ["x-signflow-signature"]);
  const tsHeader = headerValue(params.headers, TIMESTAMP_HEADERS);

  const parsed = parseSignatureHeader(sigHeader);
  const timestamp = tsHeader || parsed.timestamp;
  const signature = parsed.signature;

  if (!signature) return false;
  if (!timestampFresh(timestamp)) return false;

  const candidates = timestamp
    ? [
        hmacSha256Hex(secret, `${timestamp}.${raw}`),
        hmacSha256Hex(secret, `${timestamp}${raw}`),
        hmacSha256Hex(secret, raw),
      ]
    : [hmacSha256Hex(secret, raw)];

  return candidates.some((expected) => timingSafeHexEqual(expected, signature));
}

export function isSignFlowWebhookVerificationRequired(): boolean {
  if (process.env.SIGNFLOW_WEBHOOK_SKIP_VERIFY === "1") return false;
  if (process.env.NODE_ENV !== "production") {
    return process.env.SIGNFLOW_WEBHOOK_REQUIRE_VERIFY === "1";
  }
  return true;
}
