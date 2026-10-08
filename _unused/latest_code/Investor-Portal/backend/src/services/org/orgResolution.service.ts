import { eq } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import { hasUserCompanyMembership } from "../auth/userCompanyMembership.service.js";

export interface UserOrgResolutionFields {
  organizationId: string | null;
  role: string | null;
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeOrganizationUuid(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return ORG_UUID_RE.test(s) ? s : null;
}

export function organizationIdFromRequestQuery(req: Request): string | null {
  const q = req.query.organizationId ?? req.query.organization_id;
  const fromQuery =
    typeof q === "string"
      ? q.trim()
      : Array.isArray(q)
        ? String(q[0] ?? "").trim()
        : "";
  return normalizeOrganizationUuid(fromQuery);
}

export function organizationIdFromRequestHeader(req: Request): string | null {
  const h =
    req.headers["x-active-organization-id"] ??
    req.headers["x-active-organizationid"];
  const raw = Array.isArray(h) ? h[0] : h;
  return normalizeOrganizationUuid(
    typeof raw === "string" ? raw : raw != null ? String(raw) : "",
  );
}

/** Preferred org from query, then active-org header. */
export function requestedOrganizationIdFromRequest(
  req: Request,
): string | null {
  return (
    organizationIdFromRequestQuery(req) ??
    organizationIdFromRequestHeader(req)
  );
}

function sameOrganizationUuid(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeOrganizationUuid(a);
  const nb = normalizeOrganizationUuid(b);
  return na != null && nb != null && na === nb;
}

/**
 * `users.organization_id` — company directory scope for the user.
 * Pass `preloaded` when you already loaded org fields for `userId` to avoid a second query.
 */
export async function resolveOrganizationIdForUserId(
  userId: string,
  preloaded?: UserOrgResolutionFields | null,
): Promise<string | null> {
  const row =
    preloaded ??
    (
      await db
        .select({
          organizationId: users.organizationId,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
  if (!row) return null;
  return row.organizationId ?? null;
}

/** Primary org on the user row or an explicit `user_company_membership` row. */
export async function userHasAccessToOrganization(
  userId: string,
  organizationId: string,
  preloaded?: UserOrgResolutionFields | null,
): Promise<boolean> {
  const oid = normalizeOrganizationUuid(organizationId);
  if (!oid) return false;
  const primary = await resolveOrganizationIdForUserId(userId, preloaded);
  if (sameOrganizationUuid(primary, oid)) return true;
  return hasUserCompanyMembership(userId, oid);
}

/**
 * Effective org for data scoping: validated `requestedOrgId` when the user may access it,
 * otherwise the user's primary `organization_id`.
 */
export async function resolveActiveOrganizationIdForUser(
  userId: string,
  requestedOrgId?: string | null,
  preloaded?: UserOrgResolutionFields | null,
): Promise<string | null> {
  const primary = normalizeOrganizationUuid(
    await resolveOrganizationIdForUserId(userId, preloaded),
  );
  const requested = normalizeOrganizationUuid(requestedOrgId);
  if (!requested) return primary;
  if (await userHasAccessToOrganization(userId, requested, preloaded)) {
    return requested;
  }
  return primary;
}
