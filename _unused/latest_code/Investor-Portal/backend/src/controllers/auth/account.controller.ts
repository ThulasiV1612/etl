import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  changePasswordForUser,
  getOwnProfile,
  updateOwnProfile,
} from "../../services/auth/account.service.js";

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const jwtUser = await getValidJwtUser(req);
    if (!jwtUser?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const result = await getOwnProfile(jwtUser.id);
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }
    res.status(200).json({ user: result.user });
  } catch (err) {
    console.error("getMyProfile:", err);
    res.status(500).json({
      message: "Could not load profile. Please try again.",
    });
  }
}

export async function postChangePassword(req: Request, res: Response): Promise<void> {
  try {
    const jwtUser = await getValidJwtUser(req);
    if (!jwtUser?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }

    const body = req.body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    const result = await changePasswordForUser(
      jwtUser.id,
      currentPassword,
      newPassword,
    );

    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }

    res.status(200).json({
      message: "Password updated",
      user: result.user,
    });
  } catch (err) {
    console.error("postChangePassword:", err);
    res.status(500).json({
      message: "Could not change password. Please try again.",
    });
  }
}

export async function patchMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const jwtUser = await getValidJwtUser(req);
    if (!jwtUser?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const patch: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      companyName?: string;
      username?: string;
    } = {};
    if (typeof body.firstName === "string") patch.firstName = body.firstName;
    if (typeof body.lastName === "string") patch.lastName = body.lastName;
    if (typeof body.phone === "string") patch.phone = body.phone;
    if (typeof body.companyName === "string") patch.companyName = body.companyName;
    if (typeof body.username === "string") patch.username = body.username;
    if (typeof body.userName === "string" && patch.username === undefined) {
      patch.username = body.userName;
    }

    const result = await updateOwnProfile(jwtUser.id, patch);

    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }

    res.status(200).json({
      message: "Profile updated",
      user: result.user,
    });
  } catch (err) {
    console.error("patchMyProfile:", err);
    res.status(500).json({
      message: "Could not update profile. Please try again.",
    });
  }
}
