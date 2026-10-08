import jwt, { type SignOptions } from "jsonwebtoken";
import { getJwtSecret } from "../../config/auth.js";

const INVITE_EXPIRES = (process.env.JWT_INVITE_EXPIRES_IN?.trim() ??
  "7d") as SignOptions["expiresIn"];

function frontendOrigin(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() || process.env.BASE_URL?.trim() || "";
  return raw.replace(/\/$/, "");
}

export type InviteResult =
  | {
      ok: true;
      signupUrl: string;
      expiresIn: string;
      /** Raw JWT (not returned to clients in HTTP JSON). */
      token: string;
      inviteExpiresAt: Date;
    }
  | { ok: false; status: number; message: string };

export type InviteCompanyContext = {
  companyId?: string | null;
  companyName?: string | null;
};

/**
 * Creates a signup invite JWT (`{ email }`, optional `companyId` / `companyName`, optional `invitedRole`).
 */
export function createInviteForEmail(
  rawEmail: string,
  company?: InviteCompanyContext | null,
  invitedRole?: string | null,
): InviteResult {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return {
      ok: false,
      status: 400,
      message: "A valid email address is required",
    };
  }

  const origin = frontendOrigin();
  if (!origin) {
    return {
      ok: false,
      status: 503,
      message:
        "FRONTEND_URL (or BASE_URL) is not configured on the server; cannot build signup link.",
    };
  }

  const payload: {
    email: string;
    companyId?: string;
    companyName?: string;
    invitedRole?: string;
  } = { email };
  const cn = (company?.companyName ?? "").toString().trim();
  const cid = (company?.companyId ?? "").toString().trim();
  if (cn) payload.companyName = cn;
  if (cid) payload.companyId = cid;
  const ir = (invitedRole ?? "").toString().trim();
  if (ir) payload.invitedRole = ir;

  const token = jwt.sign(
    payload,
    getJwtSecret(),
    { expiresIn: INVITE_EXPIRES } as SignOptions,
  );

  const signupUrl = `${origin}/signup/${encodeURIComponent(token)}`;

  const decoded = jwt.decode(token) as { exp?: number } | null;
  const inviteExpiresAt =
    decoded?.exp != null
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    ok: true,
    signupUrl,
    expiresIn: typeof INVITE_EXPIRES === "string" ? INVITE_EXPIRES : "7d",
    token,
    inviteExpiresAt,
  };
}
