/**
 * Shared JWT config so login and auth middleware always use the same secret and behaviour.
 */

const DEV_FALLBACK_SECRET = "dev-only-insecure-jwt-secret";

const JWT_SECRET =
  typeof process.env.JWT_SECRET_KEY === "string" &&
  process.env.JWT_SECRET_KEY.trim() !== ""
    ? process.env.JWT_SECRET_KEY.trim()
    : DEV_FALLBACK_SECRET;

/** Short-lived access JWT (validated against DB by jti). */
const ACCESS_TOKEN_EXPIRY = "15m";

/** Long-lived opaque refresh token stored hashed in DB. */
const REFRESH_TOKEN_EXPIRY = "7d";

/** @deprecated Use getAccessTokenExpiry — kept for invite/reset JWT flows. */
const JWT_EXPIRY = "7d";

const MIN_JWT_SECRET_LENGTH = 32;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Refuse weak or default secrets before the server accepts traffic.
 * In non-production, a dev fallback is allowed with a console warning.
 */
export function assertJwtSecretConfigured(): void {
  const raw = process.env.JWT_SECRET_KEY?.trim() ?? "";
  const usingFallback = !raw || raw === DEV_FALLBACK_SECRET;

  if (isProduction()) {
    if (!raw) {
      throw new Error(
        "JWT_SECRET_KEY is required in production. Set a random secret of at least 32 characters in backend/.env.local.",
      );
    }
    if (raw === "your-secret-key" || raw === DEV_FALLBACK_SECRET) {
      throw new Error(
        "JWT_SECRET_KEY must not use a default or placeholder value in production.",
      );
    }
    if (raw.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET_KEY must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`,
      );
    }
    return;
  }

  if (usingFallback) {
    console.warn(
      "[auth] JWT_SECRET_KEY is unset — using an insecure dev-only default. Set JWT_SECRET_KEY in backend/.env.local before deploying.",
    );
  }
}

export function getJwtSecret(): string {
  return JWT_SECRET;
}

export function getAccessTokenExpiry(): string {
  return process.env.JWT_ACCESS_EXPIRES_IN?.trim() || ACCESS_TOKEN_EXPIRY;
}

export function getRefreshTokenExpiry(): string {
  return process.env.JWT_REFRESH_EXPIRES_IN?.trim() || REFRESH_TOKEN_EXPIRY;
}

export function getJwtExpiry(): string {
  return JWT_EXPIRY;
}
