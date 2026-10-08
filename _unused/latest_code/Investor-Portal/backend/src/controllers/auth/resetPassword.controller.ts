import type { Request, Response } from "express";
import { resetPasswordWithToken } from "../../services/auth/passwordReset.service.js";

type ResetPasswordBody = {
  token?: unknown;
  newPassword?: unknown;
  email?: unknown;
};

export async function postResetPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as ResetPasswordBody;
  const token = typeof body.token === "string" ? body.token : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  const email = typeof body.email === "string" ? body.email : "";

  const result = await resetPasswordWithToken(token, newPassword, email);

  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  res.status(200).json({ message: result.message });
}
