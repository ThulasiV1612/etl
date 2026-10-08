import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../middleware/jwtUser.js";
import { db } from "../database/db.js";
import { users } from "../schema/schema.js";
import {
  isCompanyAdminRole,
  isPlatformAdminRole,
} from "../constants/roles.js";
import { listSponsorTotalInvestmentsForScope } from "../services/deal/sponsorTotalInvestment.service.js";

function organizationIdFromQuery(req: Request): string | undefined {
  const raw = req.query.organizationId ?? req.query.organization_id;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t || undefined;
}

function actorRoleForMemberAdmin(
  actor: { role: string | null },
  jwtUser: { userRole?: string },
): string {
  return (
    String(actor.role ?? "").trim() || String(jwtUser.userRole ?? "").trim()
  );
}

/**
 * GET /users/sponsor-total-investments
 * Aggregated LP investment totals for users who are lead/admin/co-sponsor on `deal_member`,
 * scoped to deal investments on deals in the optional organization (same semantics as GET /users).
 */
export async function getSponsorTotalInvestments(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, jwtUser.id))
    .limit(1);
  if (!actor) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  const role = actorRoleForMemberAdmin(actor, jwtUser);
  if (!isPlatformAdminRole(role) && !isCompanyAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }

  const filterOrganizationId = isPlatformAdminRole(role)
    ? organizationIdFromQuery(req)
    : undefined;

  const organizationId =
    filterOrganizationId !== undefined
      ? filterOrganizationId
      : actor.organizationId ?? null;

  try {
    const rows = await listSponsorTotalInvestmentsForScope({
      organizationId,
    });
    res.status(200).json({ users: rows });
  } catch (err) {
    console.error("getSponsorTotalInvestments:", err);
    res.status(500).json({ message: "Could not load sponsor totals" });
  }
}
