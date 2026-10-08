import { eq } from "drizzle-orm";
import { db, pool } from "../../database/db.js";
import {
  isCompanyAdminRole,
  isPlatformAdminRole,
} from "../../constants/roles.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import { userHasAccessToOrganization } from "../org/orgResolution.service.js";

const DEAL_INVESTMENT_AUTOSAVE_CONTACT =
  "__portal_investment_autosave__";

/**
 * Distinct deal ids where this portal user appears on `deal_member` with any
 * non-empty role (portal user id or contact email match).
 */
export async function listDealIdsFromDealMemberRosterForUser(
  userId: string,
): Promise<string[]> {
  const res = await pool.query<{ deal_id: string }>(
    `SELECT DISTINCT dm.deal_id::text AS deal_id
     FROM deal_member dm
     INNER JOIN users u ON u.id = $1::uuid
     WHERE trim(dm.deal_member_role) <> ''
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )`,
    [userId],
  );
  return [
    ...new Set(
      res.rows
        .map((r) => String(r.deal_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/** True when the portal user has any `deal_member` roster row on this deal. */
export async function isPortalUserOnDealMemberRoster(
  dealId: string,
  userId: string,
): Promise<boolean> {
  const d = String(dealId ?? "").trim();
  const s = String(userId ?? "").trim();
  if (!d || !s) return false;
  const res = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM deal_member dm
     INNER JOIN users u ON u.id = $2::uuid
     WHERE dm.deal_id = $1::uuid
       AND trim(dm.deal_member_role) <> ''
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     LIMIT 1`,
    [d, s],
  );
  return res.rows.length > 0;
}

export type ViewerDealMemberRoleKind =
  | "lead_sponsor"
  | "admin_sponsor"
  | "co_sponsor"
  | "lp_investor"
  | null;

/**
 * Portal user ids that should be treated as the same person for co-sponsor
 * scoping (`added_by`, contact `created_by`):
 * - the viewer themselves
 * - other rows with the same email
 * - same org + same first/last name when at least one email looks scrubbed
 *   (`redacted…` / missing `@`) — covers duplicate import accounts
 */
export async function listEquivalentPortalUserIdsForUser(
  userId: string,
): Promise<string[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  const res = await pool.query<{ id: string }>(
    `WITH me AS (
       SELECT
         id,
         lower(trim(coalesce(email, ''))) AS email_norm,
         lower(trim(coalesce(first_name, ''))) AS fn,
         lower(trim(coalesce(last_name, ''))) AS ln,
         organization_id
       FROM users
       WHERE id = $1::uuid
     )
     SELECT DISTINCT u.id::text AS id
     FROM users u
     CROSS JOIN me
     WHERE u.id = me.id
        OR (
          me.email_norm <> ''
          AND position('@' in me.email_norm) > 1
          AND lower(trim(coalesce(u.email, ''))) = me.email_norm
        )
        OR (
          me.organization_id IS NOT NULL
          AND u.organization_id = me.organization_id
          AND me.fn <> ''
          AND me.ln <> ''
          AND lower(trim(coalesce(u.first_name, ''))) = me.fn
          AND lower(trim(coalesce(u.last_name, ''))) = me.ln
          AND (
            lower(trim(coalesce(u.email, ''))) LIKE 'redacted%'
            OR position('@' in lower(trim(coalesce(u.email, '')))) < 1
            OR me.email_norm LIKE 'redacted%'
            OR position('@' in me.email_norm) < 1
          )
        )`,
    [uid],
  );
  return [
    ...new Set(
      res.rows.map((r) => String(r.id ?? "").trim()).filter(Boolean),
    ),
  ];
}

/**
 * Expand many portal user ids with {@link listEquivalentPortalUserIdsForUser}.
 */
export async function listEquivalentPortalUserIdsForUsers(
  userIds: string[],
): Promise<string[]> {
  const seeds = [
    ...new Set(userIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  if (seeds.length === 0) return [];
  const nested = await Promise.all(
    seeds.map((id) => listEquivalentPortalUserIdsForUser(id)),
  );
  return [...new Set(nested.flat().filter(Boolean))];
}

/**
 * Portal user ids for every Co-sponsor on this deal (`deal_member` + investment
 * role), resolved from contact/user keys, then expanded with equivalent accounts.
 * Used so every authorized co-sponsor sees investors owned by any co-sponsor.
 */
export async function listCoSponsorPortalUserIdsOnDeal(
  dealId: string,
): Promise<string[]> {
  const d = String(dealId ?? "").trim();
  if (!d) return [];

  const res = await pool.query<{ user_id: string }>(
    `WITH cos AS (
       SELECT DISTINCT trim(both from dm.contact_member_id) AS member_key
       FROM deal_member dm
       WHERE dm.deal_id = $1::uuid
         AND lower(trim(dm.deal_member_role)) IN ('co-sponsor', 'co sponsor')
         AND trim(coalesce(dm.contact_member_id, '')) <> ''
       UNION
       SELECT DISTINCT trim(both from di.contact_id) AS member_key
       FROM deal_investment di
       WHERE di.deal_id = $1::uuid
         AND lower(trim(di.investor_role)) IN ('co-sponsor', 'co sponsor')
         AND trim(di.contact_id) <> $2
         AND trim(coalesce(di.contact_id, '')) <> ''
     ),
     by_user_id AS (
       SELECT u.id::text AS user_id
       FROM cos
       INNER JOIN users u ON u.id::text = cos.member_key
     ),
     by_contact_email AS (
       SELECT u.id::text AS user_id
       FROM cos
       INNER JOIN contact c ON c.id::text = cos.member_key
       INNER JOIN users u
         ON lower(trim(u.email)) = lower(trim(c.email))
       WHERE trim(coalesce(c.email, '')) <> ''
         AND position('@' in trim(c.email)) > 1
     )
     SELECT DISTINCT user_id FROM by_user_id
     UNION
     SELECT DISTINCT user_id FROM by_contact_email`,
    [d, DEAL_INVESTMENT_AUTOSAVE_CONTACT],
  );

  const seedIds = res.rows
    .map((r) => String(r.user_id ?? "").trim())
    .filter(Boolean);
  return listEquivalentPortalUserIdsForUsers(seedIds);
}

function classifyDealMemberRoleRaw(raw: string): {
  lead: boolean;
  admin: boolean;
  co: boolean;
  lp: boolean;
} {
  const t = String(raw ?? "").trim().toLowerCase();
  const lead =
    t === "lead sponsor" ||
    t === "lead_sponsor" ||
    (t.includes("lead") && t.includes("sponsor"));
  const admin = t === "admin sponsor" || t === "admin_sponsor";
  const co = t === "co-sponsor" || t === "co sponsor" || t === "co_sponsor";
  const lp =
    t === "lp investor" ||
    t === "lp investors" ||
    t === "lp_investor" ||
    t === "lp_investors";
  return { lead, admin, co, lp };
}

/**
 * Viewer’s roster role on one deal (unfiltered). Used for tab visibility when the
 * members list API is scoped to rows the co-sponsor added.
 */
export async function resolveViewerDealMemberRoleOnDeal(
  dealId: string,
  userId: string,
): Promise<ViewerDealMemberRoleKind> {
  const d = String(dealId ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!d || !uid) return null;

  const res = await pool.query<{ role: string }>(
    `SELECT lower(trim(dm.deal_member_role)) AS role
     FROM deal_member dm
     INNER JOIN users u ON u.id = $2::uuid
     WHERE dm.deal_id = $1::uuid
       AND trim(dm.deal_member_role) <> ''
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     UNION ALL
     SELECT lower(trim(di.investor_role)) AS role
     FROM deal_investment di
     INNER JOIN users u ON u.id = $2::uuid
     WHERE di.deal_id = $1::uuid
       AND trim(di.investor_role) <> ''
       AND trim(di.contact_id) <> '__portal_investment_autosave__'
       AND (
         trim(di.contact_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from di.contact_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )`,
    [d, uid],
  );

  let hasLead = false;
  let hasAdmin = false;
  let hasCo = false;
  let hasLp = false;
  for (const row of res.rows) {
    const c = classifyDealMemberRoleRaw(row.role ?? "");
    if (c.lead) hasLead = true;
    if (c.admin) hasAdmin = true;
    if (c.co) hasCo = true;
    if (c.lp) hasLp = true;
  }
  if (hasLead) return "lead_sponsor";
  if (hasAdmin) return "admin_sponsor";
  if (hasCo) return "co_sponsor";
  if (hasLp) return "lp_investor";
  return null;
}

/**
 * Distinct deal ids where this user appears on `deal_member` as Co-sponsor
 * (portal user id or contact email match).
 */
export async function listDealIdsWhereViewerIsCoSponsor(
  userId: string,
): Promise<string[]> {
  const res = await pool.query<{ deal_id: string }>(
    `SELECT DISTINCT dm.deal_id::text AS deal_id
     FROM deal_member dm
     INNER JOIN users u ON u.id = $1::uuid
     WHERE lower(trim(dm.deal_member_role)) IN ('co-sponsor', 'co sponsor')
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     UNION
     SELECT DISTINCT di.deal_id::text AS deal_id
     FROM deal_investment di
     INNER JOIN users u ON u.id = $1::uuid
     WHERE lower(trim(di.investor_role)) IN ('co-sponsor', 'co sponsor')
       AND trim(di.contact_id) <> $2
       AND (
         trim(di.contact_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(di.contact_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )`,
    [userId, DEAL_INVESTMENT_AUTOSAVE_CONTACT],
  );
  return [
    ...new Set(
      res.rows
        .map((r) => String(r.deal_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Co-sponsors (not company admin, not Lead/Admin sponsor on any deal) get a
 * narrowed Contacts list from the Investor → Sponsor/Co-sponsor relationship
 * (Sponsor name on deal investors), plus contacts they created. Those contacts
 * remain editable. See `listContactsForViewerScoped`.
 */
export async function viewerShouldSeeOnlySelfCreatedContacts(
  userId: string,
  roleForScope?: string | null,
): Promise<boolean> {
  const uid = String(userId ?? "").trim();
  if (!uid) return false;
  if (isCompanyAdminRole(String(roleForScope ?? "").trim())) return false;
  if (await viewerIsLeadOrAdminSponsorOnAnyDeal(uid)) return false;
  const coDealIds = await listDealIdsWhereViewerIsCoSponsor(uid);
  return coDealIds.length > 0;
}

/**
 * True if this user has any `deal_member` row with a non-empty role that is
 * **not** Co-sponsor (e.g. Lead Sponsor, admin sponsor, LP investors).
 * Used to avoid narrowing the syndication dashboard to co-sponsor-only deals
 * when they also hold another roster role somewhere.
 */
export async function viewerHasNonCoSponsorDealMemberRole(
  userId: string,
): Promise<boolean> {
  const res = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM deal_member dm
     INNER JOIN users u ON u.id = $1::uuid
     WHERE trim(dm.deal_member_role) <> ''
       AND lower(trim(dm.deal_member_role)) NOT IN ('co-sponsor', 'co sponsor')
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     LIMIT 1`,
    [userId],
  );
  return res.rows.length > 0;
}

/**
 * Lead Sponsor / Admin sponsor stored on `deal_member.deal_member_role` or
 * `deal_investment.investor_role`. Matches the same variants as
 * {@link classifyDealMemberRoleRaw} (spaces, underscores, “lead … sponsor”).
 */
const SQL_ROLE_IS_LEAD_OR_ADMIN = `(
  lower(trim(%COL%)) IN ('lead sponsor', 'lead_sponsor', 'admin sponsor', 'admin_sponsor')
  OR (
    position('lead' in lower(trim(%COL%))) > 0
    AND position('sponsor' in lower(trim(%COL%))) > 0
  )
)`;

function sqlRoleIsLeadOrAdmin(columnSql: string): string {
  return SQL_ROLE_IS_LEAD_OR_ADMIN.replaceAll("%COL%", columnSql);
}

const SQL_ROLE_IS_LEAD = `(
  lower(trim(%COL%)) IN ('lead sponsor', 'lead_sponsor')
  OR (
    position('lead' in lower(trim(%COL%))) > 0
    AND position('sponsor' in lower(trim(%COL%))) > 0
    AND position('admin' in lower(trim(%COL%))) = 0
  )
)`;

function sqlRoleIsLead(columnSql: string): string {
  return SQL_ROLE_IS_LEAD.replaceAll("%COL%", columnSql);
}

/**
 * Distinct deal ids where this user is Lead Sponsor or Admin sponsor
 * (`deal_member` or `deal_investment`, portal user id or contact email match).
 */
export async function listDealIdsWhereViewerIsLeadOrAdminSponsor(
  userId: string,
): Promise<string[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  const res = await pool.query<{ deal_id: string }>(
    `SELECT DISTINCT dm.deal_id::text AS deal_id
     FROM deal_member dm
     INNER JOIN users u ON u.id = $1::uuid
     WHERE ${sqlRoleIsLeadOrAdmin("dm.deal_member_role")}
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     UNION
     SELECT DISTINCT di.deal_id::text AS deal_id
     FROM deal_investment di
     INNER JOIN users u ON u.id = $1::uuid
     WHERE ${sqlRoleIsLeadOrAdmin("di.investor_role")}
       AND trim(di.contact_id) <> $2
       AND (
         trim(di.contact_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(di.contact_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )`,
    [uid, DEAL_INVESTMENT_AUTOSAVE_CONTACT],
  );
  return [
    ...new Set(
      res.rows
        .map((r) => String(r.deal_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Distinct deal ids where this user is Lead Sponsor
 * (`deal_member` or `deal_investment`, portal user id or contact email match).
 */
export async function listDealIdsWhereViewerIsLeadSponsor(
  userId: string,
): Promise<string[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  const res = await pool.query<{ deal_id: string }>(
    `SELECT DISTINCT dm.deal_id::text AS deal_id
     FROM deal_member dm
     INNER JOIN users u ON u.id = $1::uuid
     WHERE ${sqlRoleIsLead("dm.deal_member_role")}
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     UNION
     SELECT DISTINCT di.deal_id::text AS deal_id
     FROM deal_investment di
     INNER JOIN users u ON u.id = $1::uuid
     WHERE ${sqlRoleIsLead("di.investor_role")}
       AND trim(di.contact_id) <> $2
       AND (
         trim(di.contact_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(di.contact_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )`,
    [uid, DEAL_INVESTMENT_AUTOSAVE_CONTACT],
  );
  return [
    ...new Set(
      res.rows
        .map((r) => String(r.deal_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * True when the viewer appears on any deal as Lead Sponsor or Admin sponsor
 * (portal user id or contact email match). Used so sponsor team sees full-company
 * CRM contacts (including portal/member rows), same as company admin, plus
 * investors on those deals.
 */
export async function viewerIsLeadOrAdminSponsorOnAnyDeal(
  userId: string,
): Promise<boolean> {
  const ids = await listDealIdsWhereViewerIsLeadOrAdminSponsor(userId);
  return ids.length > 0;
}

/** Lead Sponsor, Admin sponsor, or Co-sponsor on any deal roster. */
export async function viewerIsDealSponsorOnAnyDeal(
  userId: string,
): Promise<boolean> {
  const uid = String(userId ?? "").trim();
  if (!uid) return false;
  if (await viewerIsLeadOrAdminSponsorOnAnyDeal(uid)) return true;
  const coIds = await listDealIdsWhereViewerIsCoSponsor(uid);
  return coIds.length > 0;
}

const SPONSOR_ROLES_IN =
  "('lead sponsor', 'admin sponsor', 'co-sponsor', 'co sponsor')";

/**
 * True when this portal user appears on `deal_member` for the deal in a Lead / Admin /
 * Co-sponsor role (id or contact email match).
 */
/** True when the portal user is Co-sponsor on this deal (not Lead / Admin). */
export async function isPortalUserCoSponsorOnDeal(
  dealId: string,
  userId: string,
): Promise<boolean> {
  const role = await resolveViewerDealMemberRoleOnDeal(dealId, userId);
  return role === "co_sponsor";
}

/** True when the portal user is Lead Sponsor or Admin sponsor on this deal. */
export async function isPortalUserLeadOrAdminSponsorOnDeal(
  dealId: string,
  userId: string,
): Promise<boolean> {
  const role = await resolveViewerDealMemberRoleOnDeal(dealId, userId);
  return role === "lead_sponsor" || role === "admin_sponsor";
}

/**
 * Deal profile PUT (name, stage, property, etc.): co-sponsors and LP roster
 * members cannot edit. Lead / admin sponsor and other workspace viewers can.
 */
export function viewerDealMemberRoleMayEditDealProfile(
  role: ViewerDealMemberRoleKind,
): boolean {
  return role !== "co_sponsor" && role !== "lp_investor";
}

export async function viewerMayEditDealProfile(
  dealId: string,
  userId: string,
): Promise<boolean> {
  const role = await resolveViewerDealMemberRoleOnDeal(dealId, userId);
  return viewerDealMemberRoleMayEditDealProfile(role);
}

/**
 * Approve fund: Lead / Admin sponsor, platform admin, or company admin of the
 * deal’s organization.
 */
export async function viewerCanApproveDealFundOnDeal(params: {
  dealId: string;
  userId: string;
  userRole?: string | null;
}): Promise<boolean> {
  const dealId = String(params.dealId ?? "").trim();
  const userId = String(params.userId ?? "").trim();
  if (!dealId || !userId) return false;
  if (await isPortalUserLeadOrAdminSponsorOnDeal(dealId, userId)) return true;
  const role = String(params.userRole ?? "").trim();
  if (isPlatformAdminRole(role)) return true;
  if (!isCompanyAdminRole(role)) return false;
  const [deal] = await db
    .select({ organizationId: addDealForm.organizationId })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  const orgId = String(deal?.organizationId ?? "").trim();
  if (!orgId) return false;
  return userHasAccessToOrganization(userId, orgId);
}

/** True when the portal user is Lead Sponsor on this deal (id or contact email match). */
export async function isPortalUserLeadSponsorOnDeal(
  dealId: string,
  userId: string,
): Promise<boolean> {
  const role = await resolveViewerDealMemberRoleOnDeal(dealId, userId);
  return role === "lead_sponsor";
}

export async function isPortalUserSponsorOnDeal(
  dealId: string,
  sponsorUserId: string,
): Promise<boolean> {
  const d = String(dealId ?? "").trim();
  const s = String(sponsorUserId ?? "").trim();
  if (!d || !s) return false;
  const res = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM deal_member dm
     INNER JOIN users u ON u.id = $2::uuid
     WHERE dm.deal_id = $1::uuid
       AND lower(trim(dm.deal_member_role)) IN ${SPONSOR_ROLES_IN}
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     UNION ALL
     SELECT 1 AS ok
     FROM deal_investment di
     INNER JOIN users u ON u.id = $2::uuid
     WHERE di.deal_id = $1::uuid
       AND lower(trim(di.investor_role)) IN ${SPONSOR_ROLES_IN}
       AND trim(di.contact_id) <> '__portal_investment_autosave__'
       AND (
         trim(di.contact_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from di.contact_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
         )
       )
     LIMIT 1`,
    [d, s],
  );
  return res.rows.length > 0;
}
