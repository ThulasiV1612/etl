import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { isPlatformAdminRole } from "../../constants/roles.js";
import { getPlatformMetrics } from "../../services/platform/platformMetrics.service.js";
import {
  getPlatformFundingSeries,
  parseFundingPeriod,
} from "../../services/platform/platformFunding.service.js";
import { getUserActivityMetrics } from "../../services/platform/userActivity.service.js";
import { listPlatformSignupNotificationsForAdmin } from "../../services/platform/platformSignupNotification.service.js";

function actorRoleFromRow(
  actor: { role: string | null },
  jwt: { userRole?: string },
): string {
  return String(actor.role ?? "").trim() || String(jwt.userRole ?? "").trim();
}

/**
 * GET /platform/metrics — platform-wide application KPIs (platform admin only).
 */
export async function getPlatformMetricsHandler(
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

  const role = actorRoleFromRow(actor, jwtUser);
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }

  try {
    const metrics = await getPlatformMetrics();
    res.status(200).json({ metrics });
  } catch (err) {
    console.error("getPlatformMetricsHandler:", err);
    res.status(500).json({ message: "Could not load platform metrics" });
  }
}

/**
 * GET /platform/metrics/funding?period=30d — funded / committed capital over time.
 */
export async function getPlatformFundingHandler(
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

  const role = actorRoleFromRow(actor, jwtUser);
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }

  const period = parseFundingPeriod(req.query.period) ?? "30d";

  try {
    const series = await getPlatformFundingSeries(period);
    res.status(200).json({ funding: series });
  } catch (err) {
    console.error("getPlatformFundingHandler:", err);
    res.status(500).json({ message: "Could not load funding series" });
  }
}

/**
 * GET /platform/metrics/user-activity — per-user login/logout and page navigation counts.
 */
export async function getPlatformUserActivityHandler(
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

  const role = actorRoleFromRow(actor, jwtUser);
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }

  try {
    const userActivity = await getUserActivityMetrics();
    res.status(200).json({ userActivity });
  } catch (err) {
    console.error("getPlatformUserActivityHandler:", err);
    res.status(500).json({ message: "Could not load user activity" });
  }
}

/**
 * GET /platform/signup-notifications — recent self-serve signups (platform admin only).
 */
export async function getPlatformSignupNotificationsHandler(
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

  const role = actorRoleFromRow(actor, jwtUser);
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }

  try {
    const rows = await listPlatformSignupNotificationsForAdmin(40);
    res.status(200).json({
      notifications: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        contactId: row.contactId ?? null,
        signupKind: row.signupKind,
        companyName: row.companyName ?? null,
        organizationId: row.organizationId ?? null,
        userEmail: row.userEmail,
        userDisplayName: row.userDisplayName,
        userRole: row.userRole,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt),
      })),
    });
  } catch (err) {
    console.error("getPlatformSignupNotificationsHandler:", err);
    res.status(500).json({ message: "Could not load signup notifications" });
  }
}
