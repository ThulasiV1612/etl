import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  clearAuthCookies,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from "../../utils/authCookies.js";
import {
  refreshAuthTokens,
  revokeAccessTokenByJti,
  revokeRefreshToken,
} from "../../services/auth/token.service.js";
import { endOpenPortalSessionsForUser } from "../../services/platform/userActivity.service.js";

type RefreshBody = {
  refreshToken?: unknown;
};

/** POST /auth/refresh — rotate refresh token and issue a new access token pair. */
export async function postRefreshTokens(
  req: Request,
  res: Response,
): Promise<void> {
  const refreshToken = readRefreshTokenFromRequest(req);

  const result = await refreshAuthTokens(refreshToken, req);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  setRefreshTokenCookie(res, result.refreshToken);

  res.status(200).json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    token: result.accessToken,
  });
}

type LogoutBody = {
  refreshToken?: unknown;
};

/** POST /auth/logout — revoke current access and refresh tokens. */
export async function postAuthLogout(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  const refreshToken = readRefreshTokenFromRequest(req);

  if (jwtUser?.id) {
    try {
      await endOpenPortalSessionsForUser(jwtUser.id);
    } catch (err) {
      console.error("postAuthLogout close portal session:", err);
    }
  }

  if (jwtUser?.jti) {
    try {
      await revokeAccessTokenByJti(jwtUser.jti);
    } catch (err) {
      console.error("postAuthLogout revoke access:", err);
    }
  }

  if (refreshToken.trim()) {
    try {
      await revokeRefreshToken(refreshToken);
    } catch (err) {
      console.error("postAuthLogout revoke refresh:", err);
    }
  }

  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}
