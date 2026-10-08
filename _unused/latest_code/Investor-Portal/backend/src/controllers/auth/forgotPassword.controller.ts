import type { Request, Response } from "express";
import { requestPasswordResetWithEmail } from "../../services/auth/passwordReset.service.js";

export async function postForgotPassword(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.body?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!email) {
    res.status(400).json({ message: "Email is required" });
    return;
  }

  const result = await requestPasswordResetWithEmail(email);

  if (result.http500) {
    res.status(500).json({ message: result.message });
    return;
  }

  res.status(200).json({ message: result.message });
}
