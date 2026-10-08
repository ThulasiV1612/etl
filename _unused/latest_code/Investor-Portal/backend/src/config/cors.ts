import type { CorsOptions } from "cors";

const LOCALHOST_ORIGIN_RE =
  /^https?:\/\/(\[::1\]|localhost|127\.0\.0\.1)(:\d+)?$/i;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function configuredOrigins(): string[] {
  const baseUrl = process.env.BASE_URL?.trim();
  const extra = process.env.CORS_ALLOWED_ORIGINS?.trim();
  const fromList = extra
    ? extra
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return [...(baseUrl ? [baseUrl] : []), ...fromList];
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const allowed = configuredOrigins();
  if (allowed.includes(origin)) return true;
  if (!isProduction() && LOCALHOST_ORIGIN_RE.test(origin)) return true;
  return false;
}

export function corsOptions(): CorsOptions {
  const allowedOrigins = configuredOrigins();

  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (!isProduction() && LOCALHOST_ORIGIN_RE.test(origin)) {
        return cb(null, true);
      }
      if (isProduction()) {
        return cb(new Error(`CORS: origin not allowed: ${origin}`), false);
      }
      return cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

export function applyCorsHeaders(
  req: { headers: { origin?: string } },
  res: { setHeader: (name: string, value: string) => void },
): void {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
}
