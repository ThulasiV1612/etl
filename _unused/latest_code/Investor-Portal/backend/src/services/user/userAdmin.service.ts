import { and, desc, eq, getTableColumns, inArray, or } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  companies,
  memberAdminAuditLogs,
  userCompanyMembership,
  users,
  type UserRow,
} from "../../schema/schema.js";
import {
  COMPANY_ADMIN,
  COMPANY_USER,
  isCompanyAdminRole,
  isInviteAssignableRole,
  isPlatformAdminRole,
  ORG_DIRECTORY_MEMBER_ROLES,
  PLATFORM_ADMIN,
  PLATFORM_USER,
} from "../../constants/roles.js";
import {
  enrichSerializedUsersWithDealParticipantRoles,
  enrichUserRecordForDealParticipant,
} from "../deal/dealParticipantProfile.service.js";
import {
  enrichUserRowsWithMemberships,
  narrowUserRowsToCompanyScope,
} from "./userMemberships.service.js";
import { hasUserCompanyMembership } from "../auth/userCompanyMembership.service.js";

const ALLOWED_USER_STATUS = new Set(["active", "inactive"]);

export const MEMBER_AUDIT_ACTION_EDIT = "member_edit";
export const MEMBER_AUDIT_ACTION_SUSPEND = "member_suspend";

export type MemberAuditAction =
  | typeof MEMBER_AUDIT_ACTION_EDIT
  | typeof MEMBER_AUDIT_ACTION_SUSPEND;

const COMPANY_ADMIN_EDITABLE_ROLES = new Set([
  COMPANY_ADMIN,
  COMPANY_USER,
  PLATFORM_USER,
]);

function stripPassword(u: UserRow): Omit<UserRow, "passwordHash"> {
  const { passwordHash: _p, ...rest } = u;
  return rest;
}

/**
 * Shape aligned with sign-in `userDetails` entries for the frontend.
 * `companyName` is the linked organization’s name from `companies`, not a column on `users`.
 */
export function serializeUserForClient(
  u: UserRow,
  companyNameFromOrganization?: string | null,
): Record<string, unknown> {
  const rest = stripPassword(u);
  const name = String(companyNameFromOrganization ?? "").trim();
  return {
    ...rest,
    organization_id: rest.organizationId ?? null,
    companyName: name,
  };
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Org Members UI: org staff portal roles — not investors (deal_participant) or LP contacts. */
const ORG_SETTINGS_MEMBER_ROLES = ORG_DIRECTORY_MEMBER_ROLES;

/** Platform admins only appear in a company they are assigned to (org or membership). */
async function userBelongsToCompany(
  user: UserRow,
  companyId: string,
): Promise<boolean> {
  const scopeId = companyId.trim().toLowerCase();
  if (!ORG_UUID_RE.test(scopeId)) return false;

  const userId = String(user.id ?? "").trim();
  const orgId = String(user.organizationId ?? "").trim().toLowerCase();
  if (orgId && orgId === scopeId) return true;

  if (!userId) return false;
  return hasUserCompanyMembership(userId, companyId);
}

async function appendPlatformAdminViewerToScopedList(
  rows: Record<string, unknown>[],
  actorUserId: string,
  companyId: string,
): Promise<Record<string, unknown>[]> {
  const actorId = actorUserId.trim().toLowerCase();
  if (!ORG_UUID_RE.test(actorId)) return rows;
  if (
    rows.some((r) => String(r.id ?? "").trim().toLowerCase() === actorId)
  ) {
    return rows;
  }

  const [actorUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  if (!actorUser || !isPlatformAdminRole(actorUser.role)) return rows;
  if (!(await userBelongsToCompany(actorUser, companyId))) return rows;

  const [scopeCompany] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const scopeCompanyName = String(scopeCompany?.name ?? "").trim();

  const mapped = serializeUserForClient(
    actorUser,
    scopeCompanyName || null,
  );
  const withDeal = await enrichSerializedUsersWithDealParticipantRoles([mapped]);
  const enriched = await enrichUserRowsWithMemberships(withDeal);
  const narrowed = narrowUserRowsToCompanyScope(
    enriched,
    companyId,
    scopeCompanyName || "—",
  );
  return [...rows, ...narrowed];
}

async function listUsersScopedToCompany(companyId: string): Promise<Record<string, unknown>[]> {
  const [scopeCompany] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const scopeCompanyName = String(scopeCompany?.name ?? "").trim();

  const companyStaffWhere = and(
    inArray(users.role, [...ORG_SETTINGS_MEMBER_ROLES]),
    or(
      and(
        eq(userCompanyMembership.companyId, companyId),
        inArray(userCompanyMembership.role, [...ORG_SETTINGS_MEMBER_ROLES]),
      ),
      eq(users.organizationId, companyId),
    ),
  );

  type RowShape = {
    user: UserRow;
    orgName: string | null;
    hasScopedMembership: string | null;
  };
  let rows: RowShape[];
  try {
    rows = await db
      .select({
        user: users,
        orgName: companies.name,
        hasScopedMembership: userCompanyMembership.companyId,
      })
      .from(users)
      .leftJoin(companies, eq(users.organizationId, companies.id))
      .leftJoin(
        userCompanyMembership,
        and(
          eq(userCompanyMembership.userId, users.id),
          eq(userCompanyMembership.companyId, companyId),
        ),
      )
      .where(companyStaffWhere)
      .orderBy(desc(users.createdAt));
  } catch (err) {
    if (!isMissingMembershipTableError(err)) throw err;
    // Pre-migration DB fallback.
    const fallbackRows = await db
      .select({
        user: users,
        orgName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(users.organizationId, companies.id))
      .where(
        and(
          eq(users.organizationId, companyId),
          inArray(users.role, [...ORG_SETTINGS_MEMBER_ROLES]),
        ),
      )
      .orderBy(desc(users.createdAt));
    rows = fallbackRows.map((r) => ({
      user: r.user,
      orgName: r.orgName,
      hasScopedMembership: null,
    }));
  }

  const deduped = new Map<string, { user: UserRow; orgName: string | null }>();
  for (const r of rows) {
    const id = String(r.user.id ?? "").trim();
    if (!id) continue;
    if (!deduped.has(id)) {
      deduped.set(id, { user: r.user, orgName: r.orgName });
    }
  }

  const mapped = [...deduped.values()]
    .filter(({ user }) =>
      (ORG_SETTINGS_MEMBER_ROLES as readonly string[]).includes(
        String(user.role ?? "").trim(),
      ),
    )
    .map(({ user, orgName }) =>
      serializeUserForClient(
        user,
        scopeCompanyName || String(orgName ?? "").trim() || null,
      ),
    );
  const withDeal = await enrichSerializedUsersWithDealParticipantRoles(mapped);
  const enriched = await enrichUserRowsWithMemberships(withDeal);
  return narrowUserRowsToCompanyScope(
    enriched,
    companyId,
    scopeCompanyName || "—",
  );
}

export async function listUsersForAdmin(
  actorRole: string,
  actorOrganizationId: string | null,
  opts?: { filterOrganizationId?: string | null; actorUserId?: string | null },
): Promise<Record<string, unknown>[] | null> {
  if (isPlatformAdminRole(actorRole)) {
    const filterOrg = opts?.filterOrganizationId?.trim() ?? "";
    const applyOrgFilter =
      filterOrg.length > 0 && ORG_UUID_RE.test(filterOrg);
    if (!applyOrgFilter) {
      return [];
    }
    let rows = await listUsersScopedToCompany(filterOrg);
    const actorUserId = opts?.actorUserId?.trim() ?? "";
    if (actorUserId) {
      rows = await appendPlatformAdminViewerToScopedList(
        rows,
        actorUserId,
        filterOrg,
      );
    }
    return rows;
  }
  if (isCompanyAdminRole(actorRole)) {
    const filterOrg = opts?.filterOrganizationId?.trim() ?? "";
    const companyId =
      filterOrg.length > 0 && ORG_UUID_RE.test(filterOrg)
        ? filterOrg
        : actorOrganizationId?.trim() ?? "";
    if (companyId && ORG_UUID_RE.test(companyId)) {
      return listUsersScopedToCompany(companyId);
    }
  }
  return null;
}

export async function updateMemberUser(
  targetUserId: string,
  patch: { role?: string; userStatus?: string; organizationId?: string },
  actorId: string,
  actorRole: string,
  audit: { reason: string; action: MemberAuditAction },
): Promise<
  | { ok: true; user: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  const hasRole = patch.role !== undefined;
  const hasStatus = patch.userStatus !== undefined;
  const organizationPatchProvided = patch.organizationId !== undefined;
  if (!hasRole && !hasStatus && !organizationPatchProvided) {
    return { ok: false, status: 400, message: "No changes" };
  }

  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  if (!actor) {
    return { ok: false, status: 401, message: "User not found" };
  }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) {
    return { ok: false, status: 404, message: "Member not found" };
  }

  if (!isPlatformAdminRole(actorRole) && !isCompanyAdminRole(actorRole)) {
    return { ok: false, status: 403, message: "Not allowed to update members" };
  }

  if (organizationPatchProvided && !isPlatformAdminRole(actorRole)) {
    return {
      ok: false,
      status: 403,
      message: "Only platform administrators can change organization",
    };
  }

  if (isCompanyAdminRole(actorRole)) {
    if (String(target.role ?? "").trim() === PLATFORM_ADMIN) {
      return {
        ok: false,
        status: 403,
        message: "Cannot edit platform administrators",
      };
    }
    const actorOrgId = actor.organizationId
      ? String(actor.organizationId).trim()
      : "";
    const targetPrimaryOrg = target.organizationId
      ? String(target.organizationId).trim()
      : "";
    const samePrimary =
      actorOrgId &&
      targetPrimaryOrg &&
      actorOrgId.toLowerCase() === targetPrimaryOrg.toLowerCase();
    const targetInActorOrg =
      actorOrgId &&
      (await hasUserCompanyMembership(
        String(target.id),
        actorOrgId,
      ));
    const actorInTargetOrg =
      targetPrimaryOrg &&
      (await hasUserCompanyMembership(actorId, targetPrimaryOrg));
    if (!samePrimary && !targetInActorOrg && !actorInTargetOrg) {
      return {
        ok: false,
        status: 403,
        message: "You can only edit members in your organization",
      };
    }
    if (hasRole) {
      const r = String(patch.role ?? "").trim();
      if (!COMPANY_ADMIN_EDITABLE_ROLES.has(r)) {
        return { ok: false, status: 400, message: "Invalid role for your access level" };
      }
    }
  }

  if (isPlatformAdminRole(actorRole) && hasRole) {
    const r = String(patch.role ?? "").trim();
    if (!isInviteAssignableRole(r)) {
      return { ok: false, status: 400, message: "Invalid role" };
    }
  }

  if (hasStatus) {
    const s = String(patch.userStatus ?? "").trim().toLowerCase();
    if (!ALLOWED_USER_STATUS.has(s)) {
      return { ok: false, status: 400, message: "Invalid status" };
    }
  }

  const prevRole = String(target.role ?? "").trim();
  const prevStatus = String(target.userStatus ?? "").trim().toLowerCase();
  const nextRole = hasRole
    ? String(patch.role ?? "").trim()
    : prevRole;
  const nextStatus = hasStatus
    ? String(patch.userStatus ?? "").trim().toLowerCase()
    : prevStatus;

  const prevOrgId = target.organizationId
    ? String(target.organizationId).trim().toLowerCase()
    : "";
  let nextOrgId = prevOrgId;
  if (organizationPatchProvided) {
    const raw = String(patch.organizationId ?? "").trim().toLowerCase();
    if (!ORG_UUID_RE.test(raw)) {
      return { ok: false, status: 400, message: "Invalid organization id" };
    }
    nextOrgId = raw;
  }

  const roleChanged = hasRole && nextRole !== prevRole;
  const statusChanged = hasStatus && nextStatus !== prevStatus;
  const orgChanged = organizationPatchProvided && nextOrgId !== prevOrgId;

  if (!roleChanged && !statusChanged && !orgChanged) {
    return { ok: false, status: 400, message: "No changes" };
  }

  if (audit.action === MEMBER_AUDIT_ACTION_SUSPEND) {
    if (!statusChanged || nextStatus !== "inactive") {
      return {
        ok: false,
        status: 400,
        message: "Suspend requires changing member status to inactive",
      };
    }
    if (roleChanged) {
      return {
        ok: false,
        status: 400,
        message: "Suspend action cannot change role",
      };
    }
    if (orgChanged) {
      return {
        ok: false,
        status: 400,
        message: "Suspend action cannot change organization",
      };
    }
  }

  if (orgChanged) {
    const [co] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, nextOrgId))
      .limit(1);
    if (!co) {
      return { ok: false, status: 400, message: "Organization not found" };
    }
  }

  const updates: Partial<{
    role: string;
    userStatus: string;
    organizationId: string;
    updatedAt: Date;
  }> = {
    updatedAt: new Date(),
  };
  if (roleChanged) {
    updates.role = nextRole;
  }
  if (statusChanged) {
    updates.userStatus = nextStatus;
  }
  if (orgChanged) {
    updates.organizationId = nextOrgId;
  }

  const changesJson: Record<string, { from: string; to: string }> = {};
  if (roleChanged) {
    changesJson.role = { from: prevRole, to: nextRole };
  }
  if (statusChanged) {
    changesJson.userStatus = { from: prevStatus, to: nextStatus };
  }
  if (orgChanged) {
    changesJson.organizationId = { from: prevOrgId, to: nextOrgId };
  }

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set(updates)
        .where(eq(users.id, targetUserId))
        .returning();
      if (!row) throw new Error("update_returned_no_row");
      await tx.insert(memberAdminAuditLogs).values({
        actorUserId: actorId,
        targetUserId,
        action: audit.action,
        reason: audit.reason,
        changesJson,
      });
    });
    const [withOrg] = await db
      .select({
        ...getTableColumns(users),
        orgName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(users.organizationId, companies.id))
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!withOrg) {
      return { ok: false, status: 500, message: "Could not load updated member" };
    }
    const { orgName, ...uCols } = withOrg;
    return {
      ok: true,
      user: await enrichUserRecordForDealParticipant(
        serializeUserForClient(uCols as UserRow, orgName),
        targetUserId,
      ),
    };
  } catch (err) {
    if (err instanceof Error && err.message === "update_returned_no_row") {
      return { ok: false, status: 500, message: "Could not update member" };
    }
    const pg =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string; message?: string })
        : {};
    console.error("updateMemberUser:", err);
    if (pg.code === "42P01") {
      return {
        ok: false,
        status: 503,
        message:
          "Database is missing the member audit table. Restart the backend server (it will create it) or run migrations.",
      };
    }
    if (pg.code === "23503") {
      return {
        ok: false,
        status: 400,
        message: "Cannot record this change (reference error). Check that both users exist.",
      };
    }
    return { ok: false, status: 500, message: "Could not update member" };
  }
}

export async function listMemberAdminAuditLogsForTarget(
  targetUserId: string,
  actorId: string,
  actorRole: string,
  actorOrganizationId: string | null,
): Promise<
  | {
      ok: true;
      logs: {
        id: string;
        actorUserId: string;
        actorEmail: string;
        action: string;
        reason: string;
        changesJson: Record<string, unknown> | null;
        createdAt: string;
      }[];
    }
  | { ok: false; status: number; message: string }
> {
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) {
    return { ok: false, status: 404, message: "Member not found" };
  }

  if (!isPlatformAdminRole(actorRole) && !isCompanyAdminRole(actorRole)) {
    return { ok: false, status: 403, message: "Not allowed" };
  }

  if (isCompanyAdminRole(actorRole)) {
    if (String(target.role ?? "").trim() === PLATFORM_ADMIN) {
      return { ok: false, status: 403, message: "Not allowed" };
    }
    const orgId = actorOrganizationId;
    if (!orgId || target.organizationId !== orgId) {
      return {
        ok: false,
        status: 403,
        message: "You can only view logs for members in your organization",
      };
    }
  }

  const actorUsers = users;
  const rows = await db
    .select({
      id: memberAdminAuditLogs.id,
      actorUserId: memberAdminAuditLogs.actorUserId,
      actorEmail: actorUsers.email,
      action: memberAdminAuditLogs.action,
      reason: memberAdminAuditLogs.reason,
      changesJson: memberAdminAuditLogs.changesJson,
      createdAt: memberAdminAuditLogs.createdAt,
    })
    .from(memberAdminAuditLogs)
    .innerJoin(actorUsers, eq(memberAdminAuditLogs.actorUserId, actorUsers.id))
    .where(eq(memberAdminAuditLogs.targetUserId, targetUserId))
    .orderBy(desc(memberAdminAuditLogs.createdAt))
    .limit(50);

  return {
    ok: true,
    logs: rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      actorEmail: r.actorEmail,
      action: r.action,
      reason: r.reason,
      changesJson: (r.changesJson as Record<string, unknown> | null) ?? null,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    })),
  };
}
