import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { markContactsAsPortalUserByEmailNorm } from "../contact/contact.service.js";
import {
  hasUserCompanyMembership,
  isCompanyMembershipRole,
  upsertUserCompanyMembership,
} from "./userCompanyMembership.service.js";

const BCRYPT_ROUNDS = 10;

export type InviteCompanyContext = {
  companyId: string | null;
  companyName: string | null;
};

export type UpsertPendingInviteResult =
  | {
      ok: true;
      action:
        | "pending_invite_upserted"
        | "existing_user_membership_added";
      /** Set when invitee still needs to finish first-time signup. */
      needsSignup?: boolean;
    }
  | { ok: false; status: number; message: string };

/**
 * Ensures a members-list row for an invited email: `user_signup_completed = false`
 * until the user finishes signup. Uses a random username and password hash until then.
 */
export async function upsertPendingInvitedUser(
  email: string,
  company: InviteCompanyContext,
  invitedRole: string,
  inviteExpiresAt: Date,
): Promise<UpsertPendingInviteResult> {
  const emailNorm = email.trim().toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) {
    return { ok: false, status: 400, message: "A valid email address is required" };
  }

  const inviteOrg = company.companyId?.trim() ?? "";
  if (!inviteOrg || !isCompanyMembershipRole(invitedRole)) {
    return {
      ok: false,
      status: 400,
      message: "A valid company and company role are required for this invite.",
    };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${emailNorm}`)
    .limit(1);

  if (existing) {
    const completed =
      String(existing.userSignupCompleted ?? "").trim().toLowerCase() === "true";
    const existingOrg = existing.organizationId?.trim() ?? "";

    const alreadyInInviteCompany = await hasUserCompanyMembership(
      existing.id,
      inviteOrg,
    );
    const legacyPrimaryOrgMatch =
      existingOrg !== "" && existingOrg === inviteOrg;

    if (alreadyInInviteCompany || legacyPrimaryOrgMatch) {
      return {
        ok: false,
        status: 409,
        message: "This email is already a member of your organization.",
      };
    }

    if (completed) {
      await upsertUserCompanyMembership(existing.id, inviteOrg, invitedRole);
      try {
        await markContactsAsPortalUserByEmailNorm(emailNorm);
      } catch (e) {
        console.error("markContactsAsPortalUserByEmailNorm after cross-company invite:", e);
      }
      return {
        ok: true,
        action: "existing_user_membership_added",
        needsSignup: false,
      };
    }

    // Pending signup elsewhere: add membership for this company without moving primary org.
    const samePendingOrg =
      existingOrg !== "" && existingOrg === inviteOrg;
    if (samePendingOrg) {
      return {
        ok: false,
        status: 409,
        message:
          "This email is already invited to your organization. Ask them to complete signup.",
      };
    }

    await upsertUserCompanyMembership(existing.id, inviteOrg, invitedRole);
    try {
      await markContactsAsPortalUserByEmailNorm(emailNorm);
    } catch (e) {
      console.error("markContactsAsPortalUserByEmailNorm after pending cross-company invite:", e);
    }
    return {
      ok: true,
      action: "existing_user_membership_added",
      needsSignup: true,
    };
  }

  const placeholderUsername = `invited_${randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);

  const [inserted] = await db
    .insert(users)
    .values({
      email: emailNorm,
      username: placeholderUsername,
      passwordHash,
      role: invitedRole,
      userStatus: "active",
      userSignupCompleted: "false",
      organizationId: company.companyId ?? null,
      inviteExpiresAt,
    })
    .returning({ id: users.id });

  if (inserted?.id) {
    await upsertUserCompanyMembership(inserted.id, inviteOrg, invitedRole);
  }

  try {
    await markContactsAsPortalUserByEmailNorm(emailNorm);
  } catch (e) {
    console.error("markContactsAsPortalUserByEmailNorm after pending invite insert:", e);
  }

  return { ok: true, action: "pending_invite_upserted", needsSignup: true };
}
