import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { getJwtSecret } from "../../config/auth.js";
import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import { buildResetPasswordEmailHtml } from "../../functions/resetPasswordEmail.template.js";
import { revokeAllUserAuthTokens } from "./token.service.js";

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_PURPOSE = "password_reset";
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;

const GENERIC_FORGOT_MESSAGE =
  "If an account exists with this email, you will receive a password reset link shortly.";

function resetTokenExpiry(): SignOptions["expiresIn"] {
  return (process.env.JWT_RESET_EXPIRES_IN?.trim() ?? "1h") as SignOptions["expiresIn"];
}

function frontendBaseUrl(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

/**
 * Looks up the user, signs a reset JWT with {@link getJwtSecret}, and sends email via {@link emailConfig}.
 * Response messaging does not reveal whether the address is registered.
 */
export async function requestPasswordResetWithEmail(
  rawEmail: string,
): Promise<{ message: string; http500?: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  try {
    const [row] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (!row) {
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    const resetToken = jwt.sign(
      { email: row.email, purpose: RESET_TOKEN_PURPOSE },
      getJwtSecret(),
      { expiresIn: resetTokenExpiry() } as SignOptions,
    );

    const appOrigin = frontendBaseUrl();
    if (!appOrigin) {
      console.error(
        "Forgot password: set FRONTEND_URL (or BASE_URL) to the SPA origin so reset links work.",
      );
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    const resetLink = `${appOrigin}/resetPassword?token=${encodeURIComponent(resetToken)}`;

    try {
      const transporter = emailConfig();
      const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
      const ccBcc = outgoingMailCcBcc();
      await transporter.sendMail({
        from: {
          name: SENDER_DISPLAY_NAME,
          address: fromAddress,
        },
        to: email,
        ...ccBcc,
        envelope: smtpEnvelopeForSendMail({
          fromAddress,
          to: email,
          cc: ccBcc.cc,
          bcc: ccBcc.bcc,
        }),
        subject: "Reset your SyndicationX password",
        html: buildResetPasswordEmailHtml(resetLink),
      });
    } catch (emailErr: unknown) {
      console.error("Forgot password: email send failed", emailErr);
    }

    return { message: GENERIC_FORGOT_MESSAGE };
  } catch (err) {
    console.error("Forgot password error:", err);
    return {
      message: "Something went wrong. Please try again later.",
      http500: true,
    };
  }
}

type ResetResult =
  | { ok: true; message: string }
  | { ok: false; status: number; message: string };

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  emailFromClient: string,
): Promise<ResetResult> {
  const email = emailFromClient.trim().toLowerCase();
  if (!token.trim()) {
    return { ok: false, status: 400, message: "Reset token is required" };
  }
  if (!email) {
    return { ok: false, status: 400, message: "Email is required" };
  }
  if (
    newPassword.length < PASSWORD_MIN ||
    newPassword.length > PASSWORD_MAX
  ) {
    return {
      ok: false,
      status: 400,
      message: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`,
    };
  }

  let payload: { email?: string; purpose?: string };
  try {
    payload = jwt.verify(token.trim(), getJwtSecret()) as {
      email?: string;
      purpose?: string;
    };
  } catch {
    return {
      ok: false,
      status: 401,
      message: "Invalid or expired reset link",
    };
  }

  if (payload.purpose !== RESET_TOKEN_PURPOSE) {
    return { ok: false, status: 401, message: "Invalid or expired reset link" };
  }

  const tokenEmail = (payload.email ?? "").toString().trim().toLowerCase();
  if (!tokenEmail || tokenEmail !== email) {
    return { ok: false, status: 401, message: "Invalid or expired reset link" };
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(sql`lower(${users.email}) = ${tokenEmail}`)
      .returning({ id: users.id });

    if (updated.length === 0) {
      return { ok: false, status: 404, message: "User not found" };
    }

    await revokeAllUserAuthTokens(updated[0]!.id);

    return { ok: true, message: "Password reset successfully." };
  } catch (err) {
    console.error("Reset password error:", err);
    return {
      ok: false,
      status: 500,
      message: "Could not reset password. Please try again.",
    };
  }
}
