import { desc } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  platformSignupNotification,
  type PlatformSignupNotificationRow,
} from "../../schema/platformSignupNotification.schema.js";

export type PlatformSelfServeSignupKind = "investor" | "company";

export async function recordPlatformSelfServeSignupNotification(params: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  signupKind: PlatformSelfServeSignupKind;
  companyName?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
}): Promise<void> {
  const userId = String(params.userId ?? "").trim();
  const email = String(params.email ?? "").trim().toLowerCase();
  if (!userId || !email) return;

  const displayName =
    [params.firstName, params.lastName].filter(Boolean).join(" ").trim() ||
    email;

  await db.insert(platformSignupNotification).values({
    userId,
    contactId: params.contactId?.trim() || null,
    signupKind: params.signupKind,
    companyName: params.companyName?.trim() || null,
    organizationId: params.organizationId?.trim() || null,
    userEmail: email,
    userDisplayName: displayName,
    userRole: String(params.role ?? "").trim() || "—",
  });
}

export async function listPlatformSignupNotificationsForAdmin(
  limit = 40,
): Promise<PlatformSignupNotificationRow[]> {
  const capped = Math.min(Math.max(1, Math.trunc(limit)), 100);
  return db
    .select()
    .from(platformSignupNotification)
    .orderBy(desc(platformSignupNotification.createdAt))
    .limit(capped);
}
