import { createHmac, timingSafeEqual } from "node:crypto";
import { getJwtSecret } from "../config/auth.js";

const UPLOAD_SIG_DOMAIN = "portal-upload-v1";
const DEFAULT_UPLOAD_SIG_TTL_MS = 60 * 60 * 1000;

function hmacHex(payload: string): string {
  return createHmac("sha256", getJwtSecret())
    .update(payload, "utf8")
    .digest("hex");
}

function normalizeUploadRelativePath(relativePath: string): string {
  return relativePath
    .replace(/^\/+/, "")
    .replace(/^uploads\//i, "")
    .replace(/\\/g, "/");
}

/**
 * Sign a relative uploads path (`deal-assets/...`) for time-limited public access
 * (e.g. offering preview gallery images).
 */
export function signUploadRelativePath(
  relativePath: string,
  ttlMs = DEFAULT_UPLOAD_SIG_TTL_MS,
): { exp: number; sig: string } {
  const rel = normalizeUploadRelativePath(relativePath);
  const exp = Date.now() + ttlMs;
  const sig = hmacHex(`${UPLOAD_SIG_DOMAIN}:${rel}:${exp}`);
  return { exp, sig };
}

export function verifyUploadSignature(
  relativePath: string,
  exp: number,
  sig: string,
): boolean {
  const rel = normalizeUploadRelativePath(relativePath);
  const sigTrim = String(sig ?? "").trim();
  if (!rel || !sigTrim || !Number.isFinite(exp)) return false;
  if (exp < Date.now()) return false;

  const expected = hmacHex(`${UPLOAD_SIG_DOMAIN}:${rel}:${exp}`);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sigTrim, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Append `e` (exp ms) and `s` (sig) query params to a `/uploads/...` URL. */
export function appendUploadSignatureToUrl(
  url: string,
  ttlMs = DEFAULT_UPLOAD_SIG_TTL_MS,
): string {
  const s = url.trim();
  if (!s || !s.includes("/uploads/")) return url;
  const idx = s.toLowerCase().indexOf("/uploads/");
  const prefix = s.slice(0, idx + "/uploads/".length);
  const tailWithQuery = s.slice(idx + "/uploads/".length);
  const qIdx = tailWithQuery.indexOf("?");
  const rel = qIdx >= 0 ? tailWithQuery.slice(0, qIdx) : tailWithQuery;
  const existingQuery = qIdx >= 0 ? tailWithQuery.slice(qIdx + 1) : "";
  if (!rel || rel.includes("..")) return url;

  const { exp, sig } = signUploadRelativePath(rel, ttlMs);
  const params = new URLSearchParams(existingQuery);
  params.set("e", String(exp));
  params.set("s", sig);
  return `${prefix}${rel}?${params.toString()}`;
}
