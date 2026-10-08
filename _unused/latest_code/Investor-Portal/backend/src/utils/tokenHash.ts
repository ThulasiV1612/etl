import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex digest for storing token identifiers without keeping raw secrets. */
export function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Opaque refresh token (64 hex chars). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}
