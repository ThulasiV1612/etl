import jwt, { type SignOptions } from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { getJwtSecret } from "../../config/auth.js";
import { db } from "../../database/db.js";
import { companies } from "../../schema/schema.js";
import { getAddDealFormById } from "./dealForm.service.js";

const INVITE_EXPIRES = (process.env.JWT_INVITE_EXPIRES_IN?.trim() ??
  "7d") as SignOptions["expiresIn"];

export const DEAL_MEMBER_INVITE_TYP = "deal_member_invite";

export type DealMemberInviteJwtPayload = {
  typ: typeof DEAL_MEMBER_INVITE_TYP;
  email: string;
  dealId: string;
  companyId: string;
  companyName: string;
};

function frontendOrigin(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() || process.env.BASE_URL?.trim() || "";
  return raw.replace(/\/$/, "");
}

/**
 * Resolve syndicator company display name for signup / email (matches deal org).
 */
export async function resolveCompanyNameForDeal(
  dealId: string,
): Promise<{ companyId: string; companyName: string } | null> {
  const deal = await getAddDealFormById(dealId.trim());
  if (!deal) return null;
  const orgId = deal.organizationId?.trim();
  if (!orgId) return null;
  const [co] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, orgId))
    .limit(1);
  const name =
    co?.name?.trim() || deal.owningEntityName?.trim() || "Organization";
  return { companyId: orgId, companyName: name };
}

export function signDealMemberInviteToken(params: {
  email: string;
  dealId: string;
  companyId: string;
  companyName: string;
}): string {
  const payload: DealMemberInviteJwtPayload = {
    typ: DEAL_MEMBER_INVITE_TYP,
    email: params.email.trim().toLowerCase(),
    dealId: params.dealId.trim(),
    companyId: params.companyId.trim(),
    companyName: params.companyName.trim(),
  };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: INVITE_EXPIRES,
  } as SignOptions);
}

/** Public landing URL: `/deal-invite?token=…` (unauthenticated). Falls back to `/deals/:id` if deal has no org. */
export async function buildDealMemberInviteLandingUrl(
  dealId: string,
  toEmail: string,
): Promise<string> {
  const origin = frontendOrigin();
  if (!origin) return "";
  const ctx = await resolveCompanyNameForDeal(dealId);
  if (!ctx)
    return `${origin}/deals/${encodeURIComponent(dealId)}`;
  const token = signDealMemberInviteToken({
    email: toEmail,
    dealId,
    companyId: ctx.companyId,
    companyName: ctx.companyName,
  });
  return `${origin}/deal-invite?token=${encodeURIComponent(token)}`;
}

export function verifyDealMemberInviteToken(
  rawToken: string,
):
  | { ok: true; payload: DealMemberInviteJwtPayload }
  | { ok: false; reason: string } {
  const t = rawToken.trim();
  if (!t) return { ok: false, reason: "missing_token" };
  try {
    const decoded = jwt.verify(t, getJwtSecret()) as Record<string, unknown>;
    if (decoded.typ !== DEAL_MEMBER_INVITE_TYP) {
      return { ok: false, reason: "wrong_token_type" };
    }
    const email = String(decoded.email ?? "").trim().toLowerCase();
    const dealId = String(decoded.dealId ?? "").trim();
    const companyId = String(decoded.companyId ?? "").trim();
    const companyName = String(decoded.companyName ?? "").trim();
    if (!email || !dealId || !companyId) {
      return { ok: false, reason: "invalid_payload" };
    }
    return {
      ok: true,
      payload: {
        typ: DEAL_MEMBER_INVITE_TYP,
        email,
        dealId,
        companyId,
        companyName,
      },
    };
  } catch {
    return { ok: false, reason: "invalid_or_expired" };
  }
}
