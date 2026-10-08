/** Full access: create companies, etc. */
export const PLATFORM_ADMIN = "platform_admin";

/** Manages members for their organization; no company registry access. */
export const COMPANY_ADMIN = "company_admin";

/** Standard portal user */
export const PLATFORM_USER = "platform_user";

/** Company-scoped member (same access profile as platform_user in this app) */
export const COMPANY_USER = "company_user";

/** Invited deal member: may only access deals where they appear on the roster (`assigning_deal_user` / investments). */
export const DEAL_PARTICIPANT = "deal_participant";

/** Self-serve signup without a company — investing portal only (no syndicating workspace). */
export const INVESTOR = "investor";

/** Roles a platform admin may assign on invite (stored on the invite JWT). */
export const INVITE_ASSIGNABLE_ROLES = [
  PLATFORM_ADMIN,
  PLATFORM_USER,
  COMPANY_ADMIN,
  COMPANY_USER,
] as const;

export function isInviteAssignableRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim();
  return (INVITE_ASSIGNABLE_ROLES as readonly string[]).includes(r);
}

export function isPlatformAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim() === PLATFORM_ADMIN;
}

export function isCompanyAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim() === COMPANY_ADMIN;
}

export function isInvestorPortalRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim() === INVESTOR;
}

/** Legacy DB/JWT value; same effective access as {@link PLATFORM_USER} in the frontend (`normalizeRole`). */
export const LEGACY_USER = "user";

/**
 * Customers / Org Members directory: company staff portal roles.
 * Excludes investors (`investor`) and deal-only participants (`deal_participant`).
 */
export const ORG_DIRECTORY_MEMBER_ROLES = [
  COMPANY_ADMIN,
  COMPANY_USER,
  PLATFORM_ADMIN,
  PLATFORM_USER,
  LEGACY_USER,
] as const;

/** Platform admins, company admins, and standard users may invite (per invite rules). */
export function canInviteUsersRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim();
  if (r === "") return false;
  if (r === LEGACY_USER) return true;
  return (
    r === PLATFORM_ADMIN || r === PLATFORM_USER || r === COMPANY_ADMIN
  );
}
