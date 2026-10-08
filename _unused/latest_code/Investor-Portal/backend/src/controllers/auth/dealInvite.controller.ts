import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import {
  verifyDealMemberInviteToken,
  type DealMemberInviteJwtPayload,
} from "../../services/deal/dealMemberInviteToken.service.js";
import { getAddDealFormById } from "../../services/deal/dealForm.service.js";

function queryToken(req: Request): string {
  const q = req.query as Record<string, unknown>;
  const raw = q.token ?? q.t;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

/**
 * GET /auth/deal-invite/verify?token=…
 * Public — validates signed JWT (same secret as signup). Used by the deal-invite landing page.
 */
export async function getDealInviteVerify(
  req: Request,
  res: Response,
): Promise<void> {
  const token = queryToken(req);
  if (!token) {
    res.status(400).json({
      valid: false,
      message: "Missing token",
    });
    return;
  }

  const verified = verifyDealMemberInviteToken(token);
  if (!verified.ok) {
    res.status(200).json({
      valid: false,
      reason: verified.reason,
      message:
        verified.reason === "invalid_or_expired"
          ? "This invitation link is invalid or has expired."
          : "This invitation link could not be validated.",
    });
    return;
  }

  const p: DealMemberInviteJwtPayload = verified.payload;
  const deal = await getAddDealFormById(p.dealId);

  if (!deal) {
    res.status(200).json({
      valid: false,
      message: "This deal is no longer available.",
    });
    return;
  }

  const orgId = deal.organizationId?.trim() ?? "";
  if (!orgId || orgId !== p.companyId) {
    res.status(200).json({
      valid: false,
      message: "This invitation link is no longer valid.",
    });
    return;
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${p.email}`)
    .limit(1);

  res.status(200).json({
    valid: true,
    email: p.email,
    companyName: p.companyName,
    dealId: p.dealId,
    companyId: p.companyId,
    accountExists: Boolean(existingUser),
  });
}
