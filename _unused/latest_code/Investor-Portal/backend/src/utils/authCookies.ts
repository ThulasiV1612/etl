import type { CookieOptions, Request, Response } from "express";

export const REFRESH_TOKEN_COOKIE = "portal_refresh";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAgeMs: number): CookieOptions {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "1" ||
    process.env.COOKIE_SECURE === "true";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
): void {
  res.cookie(
    REFRESH_TOKEN_COOKIE,
    refreshToken.trim(),
    cookieOptions(SEVEN_DAYS_MS),
  );
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function readRefreshTokenFromRequest(req: Request): string {
  const fromCookie = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (typeof fromCookie === "string" && fromCookie.trim()) {
    return fromCookie.trim();
  }
  const body = req.body as { refreshToken?: unknown } | undefined;
  if (typeof body?.refreshToken === "string" && body.refreshToken.trim()) {
    return body.refreshToken.trim();
  }
  return "";
}
