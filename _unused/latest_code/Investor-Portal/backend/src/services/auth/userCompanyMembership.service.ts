import { and, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  COMPANY_ADMIN,
  COMPANY_USER,
  isCompanyAdminRole,
} from "../../constants/roles.js";
import { companies, userCompanyMembership } from "../../schema/schema.js";

export type CompanyMembershipRole = typeof COMPANY_ADMIN | typeof COMPANY_USER;

export type UserCompanyMembershipView = {
  companyId: string;
  companyName: string;
  role: CompanyMembershipRole;
};

function isMissingMembershipTableError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 4; i += 1) {
    if (!cur || typeof cur !== "object") break;
    const e = cur as { code?: string; message?: string; cause?: unknown };
    if (e.code === "42P01") return true;
    const msg = String(e.message ?? "").toLowerCase();
    if (msg.includes('relation "user_company_membership" does not exist')) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

export function isCompanyMembershipRole(
  role: string | null | undefined,
): role is CompanyMembershipRole {
  const r = String(role ?? "").trim();
  return r === COMPANY_ADMIN || r === COMPANY_USER;
}

export function normalizeMembershipRole(
  role: string | null | undefined,
): CompanyMembershipRole {
  return isCompanyAdminRole(role) ? COMPANY_ADMIN : COMPANY_USER;
}

export async function upsertUserCompanyMembership(
  userId: string,
  companyId: string,
  role: CompanyMembershipRole,
): Promise<void> {
  const uid = String(userId ?? "").trim();
  const cid = String(companyId ?? "").trim();
  if (!uid || !cid) return;
  try {
    await db
      .insert(userCompanyMembership)
      .values({
        userId: uid,
        companyId: cid,
        role: normalizeMembershipRole(role),
      })
      .onConflictDoUpdate({
        target: [userCompanyMembership.userId, userCompanyMembership.companyId],
        set: {
          role: normalizeMembershipRole(role),
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    if (isMissingMembershipTableError(err)) return;
    throw err;
  }
}

export async function hasUserCompanyMembership(
  userId: string,
  companyId: string,
): Promise<boolean> {
  const uid = String(userId ?? "").trim();
  const cid = String(companyId ?? "").trim();
  if (!uid || !cid) return false;
  let row;
  try {
    [row] = await db
      .select({ id: userCompanyMembership.id })
      .from(userCompanyMembership)
      .where(
        and(
          eq(userCompanyMembership.userId, uid),
          eq(userCompanyMembership.companyId, cid),
        ),
      )
      .limit(1);
  } catch (err) {
    if (isMissingMembershipTableError(err)) return false;
    throw err;
  }
  return row != null;
}

export async function listUserCompanyMemberships(
  userId: string,
): Promise<UserCompanyMembershipView[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  let rows;
  try {
    rows = await db
      .select({
        companyId: userCompanyMembership.companyId,
        companyName: companies.name,
        role: userCompanyMembership.role,
      })
      .from(userCompanyMembership)
      .innerJoin(companies, eq(userCompanyMembership.companyId, companies.id))
      .where(eq(userCompanyMembership.userId, uid));
  } catch (err) {
    if (isMissingMembershipTableError(err)) return [];
    throw err;
  }
  return rows
    .map((r) => {
      const role = normalizeMembershipRole(r.role);
      return {
        companyId: String(r.companyId ?? "").trim(),
        companyName: String(r.companyName ?? "").trim(),
        role,
      } satisfies UserCompanyMembershipView;
    })
    .filter((r) => r.companyId !== "" && r.companyName !== "");
}
