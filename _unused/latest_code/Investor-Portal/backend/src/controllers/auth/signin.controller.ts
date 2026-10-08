import type { Request, Response } from "express";
import { signInWithPassword } from "../../services/auth/auth.service.js";
import { linkPortalSessionToAuthTokens } from "../../services/auth/token.service.js";
import { startUserPortalSession } from "../../services/platform/userActivity.service.js";
import { setRefreshTokenCookie } from "../../utils/authCookies.js";

type SigninBody = {
  email?: unknown;
  password?: unknown;
};

export async function postSignin(req: Request, res: Response): Promise<void> {
  const body = req.body as SigninBody;
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email.trim()) {
    res.status(401).json({ message: "Email is required" });
    return;
  }
  if (!password) {
    res.status(401).json({ message: "Password is required" });
    return;
  }

  const result = await signInWithPassword(email, password, req);

  if (!result.ok) {
    const status =
      result.message === "An error occurred during login. Please try again."
        ? 500
        : 401;
    res.status(status).json({ message: result.message });
    return;
  }

  let activitySessionId: string | undefined;
  try {
    const userId = String(
      (result.userDetails[0] as { id?: string } | undefined)?.id ?? "",
    ).trim();
    if (userId) {
      activitySessionId = await startUserPortalSession(userId);
      if (activitySessionId) {
        await linkPortalSessionToAuthTokens(
          result.accessTokenId,
          result.refreshTokenId,
          activitySessionId,
        );
      }
    }
  } catch (err) {
    console.error("startUserPortalSession after signin:", err);
  }

  setRefreshTokenCookie(res, result.refreshToken);

  res.status(200).json({
    message: result.message,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    token: result.accessToken,
    userDetails: result.userDetails,
    ...(activitySessionId ? { activitySessionId } : {}),
  });
}
