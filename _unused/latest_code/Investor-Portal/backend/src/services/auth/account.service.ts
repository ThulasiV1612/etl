import bcrypt from "bcrypt";
import { and, eq, getTableColumns, ne, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { companies, users, type UserRow } from "../../schema/schema.js";
import { enrichUserRecordForDealParticipant } from "../deal/dealParticipantProfile.service.js";
import { mergeLpInvestorFlagsIntoUserPayload } from "../investing/lpInvestorAccess.service.js";
import { serializeUserForClient } from "../user/userAdmin.service.js";
import { parseUsPhoneToE164 } from "../../utils/usPhone.js";
import { listUserCompanyMemberships } from "./userCompanyMembership.service.js";
import { revokeAllUserAuthTokens } from "./token.service.js";

const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;
/** Matches `users.username` varchar length; shown in UI as "Account name". */
const ACCOUNT_NAME_MIN = 1;
const ACCOUNT_NAME_MAX = 100;

function validateOwnProfileUsername(
  raw: string,
):
  | { ok: true; username: string }
  | { ok: false; status: number; message: string } {
  const username = String(raw ?? "").trim();
  if (username.length < ACCOUNT_NAME_MIN || username.length > ACCOUNT_NAME_MAX) {
    return {
      ok: false,
      status: 400,
      message: `Account name must be between ${ACCOUNT_NAME_MIN} and ${ACCOUNT_NAME_MAX} characters`,
    };
  }
  if (username.toLowerCase().startsWith("invited_")) {
    return {
      ok: false,
      status: 400,
      message: "Account name is not available",
    };
  }
  return { ok: true, username };
}

function userDetailsShape(u: Record<string, unknown>): Record<string, unknown> {
  return {
    ...u,
    organization_name: "",
  };
}

async function userDetailsShapeWithDealParticipant(
  u: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  const base = userDetailsShape(u);
  const memberships = await listUserCompanyMemberships(userId);
  if (memberships.length > 0) {
    base.memberships = memberships;
    if (
      (base.organization_id == null || String(base.organization_id).trim() === "") &&
      memberships[0]?.companyId
    ) {
      base.organization_id = memberships[0].companyId;
      if (String(base.companyName ?? "").trim() === "") {
        base.companyName = memberships[0].companyName;
        base.organization_name = memberships[0].companyName;
      }
    }
  }
  const enriched = await enrichUserRecordForDealParticipant(base, userId);
  return mergeLpInvestorFlagsIntoUserPayload(enriched, {
    email: u.email as string | undefined,
    portalRole: u.role as string | undefined,
    userId,
  });
}

export async function changePasswordForUser(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<
  | { ok: true; user: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  if (!currentPassword || !newPassword) {
    return {
      ok: false,
      status: 400,
      message: "Current password and new password are required",
    };
  }
  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    return {
      ok: false,
      status: 400,
      message: `New password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`,
    };
  }
  if (currentPassword === newPassword) {
    return {
      ok: false,
      status: 400,
      message: "New password must be different from your current password",
    };
  }

  let row: UserRow | undefined;
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    row = rows[0] as UserRow | undefined;
  } catch (err) {
    console.error("changePasswordForUser: load user failed", err);
    return {
      ok: false,
      status: 500,
      message: "Could not load your account. Please try again.",
    };
  }
  if (!row) {
    return { ok: false, status: 404, message: "User not found" };
  }

  let match = false;
  try {
    match = await bcrypt.compare(currentPassword, row.passwordHash);
  } catch (err) {
    console.error("changePasswordForUser: bcrypt.compare failed", err);
    return {
      ok: false,
      status: 400,
      message:
        "Could not verify your current password. If this continues, contact support.",
    };
  }
  if (!match) {
    return { ok: false, status: 400, message: "Current password is incorrect" };
  }

  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  } catch (err) {
    console.error("changePasswordForUser: bcrypt.hash failed", err);
    return {
      ok: false,
      status: 500,
      message: "Could not process the new password. Please try again.",
    };
  }

  try {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await revokeAllUserAuthTokens(userId);
  } catch (err) {
    console.error("changePasswordForUser: update failed", err);
    return {
      ok: false,
      status: 500,
      message: "Could not save your new password. Please try again.",
    };
  }

  type UserWithOrgName = UserRow & { orgName: string | null };
  let withOrg: UserWithOrgName | undefined;
  try {
    const rows = await db
      .select({
        ...getTableColumns(users),
        orgName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(users.organizationId, companies.id))
      .where(eq(users.id, userId))
      .limit(1);
    withOrg = rows[0] as UserWithOrgName | undefined;
  } catch (err) {
    console.error("changePasswordForUser: reload user failed", err);
    return {
      ok: false,
      status: 500,
      message: "Password was updated but we could not reload your profile.",
    };
  }
  if (!withOrg) {
    return { ok: false, status: 500, message: "Could not update password" };
  }
  const { orgName, ...updated } = withOrg;
  return {
    ok: true,
    user: await userDetailsShapeWithDealParticipant(
      serializeUserForClient(updated as UserRow, orgName),
      userId,
    ),
  };
}

export type OwnProfilePatch = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  username?: string;
};

/** Current user profile for GET /auth/me (same shape as successful PATCH). */
export async function getOwnProfile(
  userId: string,
): Promise<
  | { ok: true; user: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  const [r] = await db
    .select({
      ...getTableColumns(users),
      orgName: companies.name,
    })
    .from(users)
    .leftJoin(companies, eq(users.organizationId, companies.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!r) {
    return { ok: false, status: 404, message: "User not found" };
  }
  const { orgName, ...row } = r;
  return {
    ok: true,
    user: await userDetailsShapeWithDealParticipant(
      serializeUserForClient(row as UserRow, orgName),
      userId,
    ),
  };
}

export async function updateOwnProfile(
  userId: string,
  patch: OwnProfilePatch,
): Promise<
  | { ok: true; user: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  const hasFirst = patch.firstName !== undefined;
  const hasLast = patch.lastName !== undefined;
  const hasPhone = patch.phone !== undefined;
  const hasCompany = patch.companyName !== undefined;
  const hasUsername = patch.username !== undefined;
  if (!hasFirst && !hasLast && !hasPhone && !hasCompany && !hasUsername) {
    return { ok: false, status: 400, message: "No profile fields to update" };
  }

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) {
    return { ok: false, status: 404, message: "User not found" };
  }

  if (hasCompany) {
    if (!row.organizationId) {
      return {
        ok: false,
        status: 400,
        message: "No organization to update",
      };
    }
    const name = (patch.companyName ?? "").trim();
    if (!name) {
      return { ok: false, status: 400, message: "Company name is required" };
    }
    await db
      .update(companies)
      .set({ name, updatedAt: new Date() })
      .where(eq(companies.id, row.organizationId));
  }

  const hasUserFieldUpdates = hasFirst || hasLast || hasPhone || hasUsername;
  if (hasUserFieldUpdates) {
    const setObj: {
      updatedAt: Date;
      firstName?: string;
      lastName?: string;
      phone?: string;
      username?: string;
    } = { updatedAt: new Date() };
    if (hasFirst) setObj.firstName = patch.firstName ?? "";
    if (hasLast) setObj.lastName = patch.lastName ?? "";
    if (hasUsername) {
      const validated = validateOwnProfileUsername(patch.username ?? "");
      if (!validated.ok) {
        return {
          ok: false,
          status: validated.status,
          message: validated.message,
        };
      }
      const current = String(row.username ?? "").trim();
      if (validated.username.toLowerCase() !== current.toLowerCase()) {
        const [existingUsername] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              sql`lower(${users.username}) = ${validated.username.toLowerCase()}`,
              ne(users.id, userId),
            ),
          )
          .limit(1);
        if (existingUsername) {
          return {
            ok: false,
            status: 409,
            message: "This account name is already taken",
          };
        }
        setObj.username = validated.username;
      }
    }
    if (hasPhone) {
      const raw = String(patch.phone ?? "").trim();
      if (!raw) {
        setObj.phone = "";
      } else {
        const e164 = parseUsPhoneToE164(raw);
        if (!e164) {
          return {
            ok: false,
            status: 400,
            message:
              "Enter a valid 10-digit U.S. phone number, or leave phone blank.",
          };
        }
        setObj.phone = e164;
      }
    }
    await db.update(users).set(setObj).where(eq(users.id, userId));
  }

  const [updated] = await db
    .select({
      ...getTableColumns(users),
      orgName: companies.name,
    })
    .from(users)
    .leftJoin(companies, eq(users.organizationId, companies.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!updated) {
    return { ok: false, status: 500, message: "Could not update profile" };
  }
  const { orgName, ...u } = updated;
  return {
    ok: true,
    user: await userDetailsShapeWithDealParticipant(
      serializeUserForClient(u as UserRow, orgName),
      userId,
    ),
  };
}
