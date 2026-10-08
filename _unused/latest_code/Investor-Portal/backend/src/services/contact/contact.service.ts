import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  INVESTOR,
  isCompanyAdminRole,
  isPlatformAdminRole,
} from "../../constants/roles.js";
import { db, pool } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import { resolveDealViewerScope } from "../deal/dealAccess.service.js";
import {
  listEquivalentPortalUserIdsForUser,
  viewerIsLeadOrAdminSponsorOnAnyDeal,
  viewerShouldSeeOnlySelfCreatedContacts,
} from "../deal/dealMemberScope.service.js";
import { listAddDealFormsForViewer } from "../deal/dealForm.service.js";
import {
  normalizeOrganizationUuid,
  resolveActiveOrganizationIdForUser,
  resolveOrganizationIdForUserId,
  userHasAccessToOrganization,
} from "../org/orgResolution.service.js";
import { companies, userCompanyMembership } from "../../schema/schema.js";
import {
  contact,
  type ContactInsert,
  type ContactRow,
} from "../../schema/contact.schema.js";
import { syncOrganizationContactLabels } from "./organizationContactLabels.service.js";
import { type ContactOfferingVisibility } from "./contactOfferingVisibility.service.js";
import { queueGhlContactRowSync } from "../ghl/ghlContactSync.service.js";
import {
  canonicalUsPhoneKey10,
  parseUsPhoneToE164,
} from "../../utils/usPhone.js";

/** Concat first + last for `contact.full_name` (trimmed, single space). */
export function buildContactFullName(
  firstName: string,
  lastName: string,
): string {
  return [firstName, lastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Thrown when a non-empty phone is not a valid U.S. NANP number. */
export class ContactInvalidPhoneError extends Error {
  constructor() {
    super("Enter a valid 10-digit U.S. phone number, or leave phone blank.");
    this.name = "ContactInvalidPhoneError";
  }
}

function normalizeContactPhoneForWrite(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const e164 = parseUsPhoneToE164(t);
  if (!e164) throw new ContactInvalidPhoneError();
  return e164;
}

/** First + last name, else email, else username — for CRM "owner" display */
export async function getUserDisplayNameById(
  userId: string,
): Promise<string> {
  const [u] = await db
    .select({
      email: users.email,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return "";
  const fn = u.firstName?.trim() ?? "";
  const ln = u.lastName?.trim() ?? "";
  const full = [fn, ln].filter(Boolean).join(" ");
  if (full) return full;
  return u.email?.trim() || u.username?.trim() || "";
}

/** Exporter profile for members export audit emails (user admin). */
export async function getUserContactsExportAuditFields(
  userId: string,
): Promise<{ email: string; displayName: string; orgName: string }> {
  const rows = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      orgName: companies.name,
    })
    .from(users)
    .leftJoin(companies, eq(users.organizationId, companies.id))
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) {
    return { email: "", displayName: "", orgName: "" };
  }
  const display =
    [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email;
  const org = r.orgName?.trim() || "";
  return { email: r.email, displayName: display, orgName: org };
}

export type CreateContactInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note: string;
  tags: string[];
  lists: string[];
  owners: string[];
};

export const SELF_REGISTERED_CONTACT_ADDED_BY_LABEL = "Self Registered";
export const UNASSIGNED_CONTACT_OWNER_LABEL = "Unassigned";

export type ContactCreatorUserSnapshot = {
  id: string;
  role: string | null;
  organizationId: string | null;
  email: string | null;
};

/** Thrown when another contact in the same company scope already uses this email or phone. */
export class ContactScopeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactScopeConflictError";
  }
}

async function userIdsInOrganization(organizationId: string): Promise<string[]> {
  const oid = normalizeOrganizationUuid(organizationId);
  if (!oid) return [];
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(
        userCompanyMembership,
        and(
          eq(userCompanyMembership.userId, users.id),
          eq(userCompanyMembership.companyId, oid),
        ),
      )
      .where(
        or(
          eq(users.organizationId, oid),
          eq(userCompanyMembership.companyId, oid),
        ),
      );
    return [...new Set(rows.map((r) => r.id).filter(Boolean))];
  } catch (err) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, oid));
    return rows.map((r) => r.id);
  }
}

function normalizeContactEmailForScope(e: string): string {
  return e.trim().toLowerCase();
}

/**
 * Latest CRM `contact` row for this email (signup form prefill). If multiple orgs
 * share the same email, the most recently created row wins.
 */
export async function findContactByEmailForSignupPrefill(
  email: string,
): Promise<{ firstName: string; lastName: string; phone: string } | null> {
  const norm = normalizeContactEmailForScope(email);
  if (!norm || !norm.includes("@")) return null;
  const rows = await db
    .select({
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
    })
    .from(contact)
    .where(sql`lower(trim(${contact.email})) = ${norm}`)
    .orderBy(desc(contact.createdAt))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const fn = String(r.firstName ?? "").trim();
  const ln = String(r.lastName ?? "").trim();
  const phoneRaw = String(r.phone ?? "").trim();
  if (!fn && !ln && !phoneRaw) return null;
  return {
    firstName: fn,
    lastName: ln,
    phone: phoneRaw,
  };
}

/**
 * Prefer `users.role` from DB over JWT so listing and access stay correct after role changes.
 * Org id matches {@link resolveOrganizationIdForUserId} (same as insert) so list and create stay aligned.
 */
async function getViewerContactScopeContext(
  viewerUserId: string,
  jwtRoleFallback: string | null | undefined,
  requestedOrganizationId?: string | null,
): Promise<{
  roleForScope: string;
  viewerEmailNorm: string;
  organizationId: string | null;
}> {
  const [row] = await db
    .select({
      email: users.email,
      role: users.role,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.id, viewerUserId))
    .limit(1);
  const dbRole = String(row?.role ?? "").trim();
  const roleForScope = dbRole || String(jwtRoleFallback ?? "").trim();
  const preloaded = row
    ? {
        organizationId: row.organizationId,
        role: row.role,
      }
    : null;
  const organizationId = await resolveActiveOrganizationIdForUser(
    viewerUserId,
    requestedOrganizationId,
    preloaded,
  );

  return {
    roleForScope,
    viewerEmailNorm: normalizeContactEmailForScope(row?.email ?? ""),
    organizationId,
  };
}

/**
 * Same visibility strip as company admin / sponsor team: org CRM pool including
 * portal-linked contacts (`is_portal_user`), excluding only the viewer’s own email.
 */
function fullOrgContactListVisibilityWhere(viewerEmailNorm: string): SQL {
  if (!viewerEmailNorm || !viewerEmailNorm.includes("@")) return sql`true`;
  return sql`lower(trim(${contact.email})) <> ${viewerEmailNorm}`;
}

/**
 * Role-based All Contacts visibility (non–platform-admin).
 * - **Company admin** or **Lead Sponsor / Admin sponsor** on any deal: same org pool;
 *   include portal + external member contacts; exclude own email only.
 * - **Everyone else** (e.g. company_user, LP, co-sponsor): external only (`is_portal_user` false); exclude own email.
 */
function contactsVisibilityWhereForRole(
  roleForScope: string,
  viewerEmailNorm: string,
): SQL {
  if (isCompanyAdminRole(roleForScope)) {
    return fullOrgContactListVisibilityWhere(viewerEmailNorm);
  }
  const nonPortal = eq(contact.isPortalUser, false);
  if (!viewerEmailNorm || !viewerEmailNorm.includes("@")) return nonPortal;
  const notSelf = sql`lower(trim(${contact.email})) <> ${viewerEmailNorm}`;
  return and(nonPortal, notSelf)!;
}

/** True if a portal `users` row exists for this email (any role). */
export async function contactEmailMatchesPortalUser(
  email: string,
): Promise<boolean> {
  const e = normalizeContactEmailForScope(email);
  if (!e || !e.includes("@")) return false;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${e}`)
    .limit(1);
  return Boolean(u);
}

/**
 * When someone becomes a portal user, mark matching CRM contacts (`is_portal_user`).
 * Non–company-admin All Contacts lists still hide these rows; company admins see them.
 */
export async function markContactsAsPortalUserByEmailNorm(
  emailNorm: string,
): Promise<void> {
  const e = normalizeContactEmailForScope(emailNorm);
  if (!e || !e.includes("@")) return;
  await db
    .update(contact)
    .set({ isPortalUser: true })
    .where(sql`lower(trim(${contact.email})) = ${e}`);
}

/**
 * Self-serve investor signup (no company): ensure a CRM row exists for platform
 * contacts with `created_by` = the new portal user.
 */
/** CRM rows for self-registered investors — platform admin visibility only. */
export function isPlatformAdminOnlyContactRow(
  row: Pick<ContactRow, "platformAdminOnly">,
): boolean {
  return Boolean(row.platformAdminOnly);
}

function excludePlatformAdminOnlyContactsWhere(): SQL {
  return eq(contact.platformAdminOnly, false);
}

function buildOrganizationContactsWhere(
  orgId: string,
  viewerUserId: string,
  memberIds: string[],
): SQL {
  const ids = [...new Set([...memberIds, viewerUserId])];
  return or(
    eq(contact.organizationId, orgId),
    eq(contact.createdBy, viewerUserId),
    and(isNull(contact.organizationId), inArray(contact.createdBy, ids))!,
  )!;
}

async function contactRowBelongsToOrganization(
  row: ContactRow,
  orgId: string,
  viewerUserId: string,
): Promise<boolean> {
  if (row.organizationId === orgId) return true;
  if (viewerUserId === row.createdBy) return true;
  if (!row.organizationId) {
    const memberIds = await userIdsInOrganization(orgId);
    return memberIds.includes(row.createdBy);
  }
  return false;
}

export async function ensureSelfRegisteredInvestorContact(params: {
  userId: string;
  emailNorm: string;
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<string | null> {
  const userId = String(params.userId ?? "").trim();
  const emailNorm = normalizeContactEmailForScope(params.emailNorm);
  if (!userId || !emailNorm || !emailNorm.includes("@")) return null;

  let phoneStored = "";
  try {
    phoneStored = normalizeContactPhoneForWrite(params.phone);
  } catch {
    phoneStored = "";
  }

  const firstName = String(params.firstName ?? "").trim();
  const lastName = String(params.lastName ?? "").trim();

  const [existing] = await db
    .select()
    .from(contact)
    .where(sql`lower(trim(${contact.email})) = ${emailNorm}`)
    .limit(1);

  if (existing) {
    const sponsorOwned = existing.createdBy !== userId;
    const nextFirstName = firstName || existing.firstName;
    const nextLastName = lastName || existing.lastName;
    const [updated] = await db
      .update(contact)
      .set({
        isPortalUser: true,
        ...(sponsorOwned ? {} : { platformAdminOnly: true }),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(firstName || lastName
          ? { fullName: buildContactFullName(nextFirstName, nextLastName) }
          : {}),
        ...(phoneStored ? { phone: phoneStored } : {}),
      })
      .where(eq(contact.id, existing.id))
      .returning();
    if (updated) queueGhlContactRowSync(updated);
    return sponsorOwned ? null : String(updated?.id ?? existing.id).trim() || null;
  }

  const insertFirstName = firstName || "—";
  const insertLastName = lastName || "—";
  const [inserted] = await db
    .insert(contact)
    .values({
      firstName: insertFirstName,
      lastName: insertLastName,
      fullName: buildContactFullName(insertFirstName, insertLastName),
      email: emailNorm,
      phone: phoneStored,
      note: "",
      tags: [],
      lists: [],
      owners: [],
      status: "active",
      createdBy: userId,
      organizationId: null,
      isPortalUser: true,
      platformAdminOnly: true,
    })
    .returning();
  if (inserted) queueGhlContactRowSync(inserted);
  return String(inserted?.id ?? "").trim() || null;
}

export function isSelfRegisteredInvestorContactRow(
  row: ContactRow,
  creator: ContactCreatorUserSnapshot | null | undefined,
): boolean {
  if (isPlatformAdminOnlyContactRow(row)) return true;
  if (!row.isPortalUser || row.organizationId) return false;
  if (!creator || creator.id !== row.createdBy) return false;
  if (String(creator.role ?? "").trim() !== INVESTOR) return false;
  if (creator.organizationId) return false;
  const contactEmail = normalizeContactEmailForScope(row.email);
  const creatorEmail = normalizeContactEmailForScope(creator.email ?? "");
  return Boolean(
    contactEmail && creatorEmail && contactEmail === creatorEmail,
  );
}

export function resolveContactDisplayFields(
  row: ContactRow,
  creator: ContactCreatorUserSnapshot | null | undefined,
  createdByDisplayNameFromUser: string,
): { createdByDisplayName: string; owners: string[] } {
  if (isSelfRegisteredInvestorContactRow(row, creator)) {
    return {
      createdByDisplayName: SELF_REGISTERED_CONTACT_ADDED_BY_LABEL,
      owners:
        row.owners?.length > 0
          ? row.owners
          : [UNASSIGNED_CONTACT_OWNER_LABEL],
    };
  }
  return {
    createdByDisplayName: createdByDisplayNameFromUser,
    owners: row.owners ?? [],
  };
}

export async function loadContactCreatorUsersById(
  userIds: string[],
): Promise<Map<string, ContactCreatorUserSnapshot>> {
  const ids = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      organizationId: users.organizationId,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const map = new Map<string, ContactCreatorUserSnapshot>();
  for (const row of rows) {
    const id = String(row.id).trim();
    if (!id) continue;
    map.set(id, {
      id,
      role: row.role ?? null,
      organizationId: row.organizationId ?? null,
      email: row.email ?? null,
    });
  }
  return map;
}

/**
 * Contacts are scoped by the **creator’s** organization: all contacts whose
 * `created_by` is a user in that org share one pool for unique email / phone.
 * Creators with no `organization_id` (platform admin) use a global pool.
 */
async function assertContactEmailPhoneUniqueForCreatorScope(params: {
  creatorUserId: string;
  email: string;
  phone: string;
  excludeContactId?: string;
  /**
   * Existing row’s org on update; omit on insert (derived from creator).
   * `null` = legacy row with no org column set — use creator’s org member list only.
   */
  existingContactOrganizationId?: string | null;
}): Promise<void> {
  const emailNorm = normalizeContactEmailForScope(params.email);
  const phoneTrim = String(params.phone ?? "").trim();
  const phoneCanonical = phoneTrim ? canonicalUsPhoneKey10(phoneTrim) : null;

  const orgId =
    params.existingContactOrganizationId !== undefined
      ? params.existingContactOrganizationId
      : await resolveOrganizationIdForUserId(params.creatorUserId);

  let scopePredicate: SQL;
  if (await viewerShouldSeeOnlySelfCreatedContacts(params.creatorUserId)) {
    scopePredicate = eq(contact.createdBy, params.creatorUserId);
  } else if (!orgId) {
    scopePredicate = sql`true`;
  } else {
    const memberIds = await userIdsInOrganization(orgId);
    if (memberIds.length === 0) {
      scopePredicate = sql`false`;
    } else {
      scopePredicate = or(
        eq(contact.organizationId, orgId),
        and(isNull(contact.organizationId), inArray(contact.createdBy, memberIds))!,
      )!;
    }
  }

  const emailMatch = sql`lower(trim(${contact.email})) = ${emailNorm}`;
  const phoneMatch =
    phoneCanonical
      ? sql`right(regexp_replace(coalesce(${contact.phone}, ''), '[^0-9]', '', 'g'), 10) = ${phoneCanonical}`
      : sql`false`;

  const conflictClause = or(emailMatch, phoneMatch);
  if (!conflictClause) {
    throw new Error("CONTACT_SCOPE_BUILD_FAILED");
  }
  const parts: SQL[] = [scopePredicate, conflictClause];
  if (params.excludeContactId)
    parts.push(ne(contact.id, params.excludeContactId));

  const dup = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(...parts))
    .limit(1);

  if (dup[0]) {
    throw new ContactScopeConflictError(
      "A contact in your company already uses this email or phone number.",
    );
  }
}

export async function insertContact(params: {
  input: CreateContactInput;
  createdByUserId: string;
}): Promise<ContactRow> {
  const phoneStored = normalizeContactPhoneForWrite(params.input.phone);
  await assertContactEmailPhoneUniqueForCreatorScope({
    creatorUserId: params.createdByUserId,
    email: params.input.email,
    phone: phoneStored,
  });

  const organizationId = await resolveOrganizationIdForUserId(
    params.createdByUserId,
  );

  const isPortalUser = await contactEmailMatchesPortalUser(params.input.email);
  const row: ContactInsert = {
    firstName: params.input.firstName,
    lastName: params.input.lastName,
    fullName: buildContactFullName(
      params.input.firstName,
      params.input.lastName,
    ),
    email: params.input.email,
    phone: phoneStored,
    note: params.input.note,
    tags: params.input.tags,
    lists: params.input.lists,
    owners: params.input.owners,
    status: "active",
    createdBy: params.createdByUserId,
    organizationId: organizationId ?? null,
    isPortalUser,
  };
  const [inserted] = await db.insert(contact).values(row).returning();
  if (!inserted) throw new Error("INSERT_CONTACT_FAILED");
  await syncOrganizationContactLabels({
    organizationId: organizationId ?? null,
    tags: params.input.tags,
    lists: params.input.lists,
  });
  queueGhlContactRowSync(inserted);
  return inserted;
}

/**
 * CRM `contact.id` values for investors associated with this Lead / Admin /
 * Co-sponsor (Investors-tab **Sponsor name**):
 *
 * 1. `deal_lp_investor.added_by` / `deal_member.added_by` is this viewer
 *    (or an equivalent portal account) — any deal; the viewer does **not**
 *    have to already be on that deal roster.
 * 2. When `includeSameOrganization` is set, the adder belongs to the same
 *    company, so investors still show if the Lead/Admin/Co-sponsor has not
 *    been added to the deal yet.
 * 3. Contacts this viewer (or equivalent) created.
 */
async function listCrmContactIdsAssociatedWithSponsorViewer(
  viewerUserId: string,
  opts?: { includeSameOrganization?: boolean },
): Promise<string[]> {
  const uid = String(viewerUserId ?? "").trim();
  if (!uid) return [];
  const viewerEquivalents = await listEquivalentPortalUserIdsForUser(uid);
  const sponsorIds =
    viewerEquivalents.length > 0 ? viewerEquivalents : [uid];
  const orgId = opts?.includeSameOrganization
    ? ((await resolveOrganizationIdForUserId(uid)) ?? null)
    : null;

  const res = await pool.query<{ contact_id: string }>(
    `WITH sponsors AS (
       SELECT unnest($1::uuid[]) AS user_id
     ),
     effective AS (
       SELECT lp.deal_id, lp.contact_member_id, lp.email, lp.added_by
       FROM deal_lp_investor lp
       WHERE lp.added_by IS NOT NULL
         AND trim(coalesce(lp.contact_member_id, '')) <> ''
       UNION ALL
       SELECT dm.deal_id, dm.contact_member_id, NULL::text AS email, dm.added_by
       FROM deal_member dm
       WHERE dm.added_by IS NOT NULL
         AND trim(coalesce(dm.contact_member_id, '')) <> ''
         AND lower(trim(dm.deal_member_role)) IN (
           'lp investor', 'lp investors', 'lp_investor', 'lp_investors'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM deal_lp_investor lp
           WHERE lp.deal_id = dm.deal_id
             AND lower(trim(lp.contact_member_id)) =
                   lower(trim(dm.contact_member_id))
             AND lp.added_by IS NOT NULL
         )
     ),
     matched AS (
       SELECT e.contact_member_id, e.email
       FROM effective e
       INNER JOIN sponsors s ON e.added_by = s.user_id
       UNION
       SELECT e.contact_member_id, e.email
       FROM effective e
       INNER JOIN users adder ON adder.id = e.added_by
       WHERE $2::uuid IS NOT NULL
         AND adder.organization_id = $2::uuid
     ),
     raw_keys AS (
       SELECT DISTINCT lower(trim(contact_member_id)) AS k
       FROM matched
       WHERE trim(coalesce(contact_member_id, '')) <> ''
     ),
     by_id AS (
       SELECT c.id::text AS contact_id
       FROM contact c
       INNER JOIN raw_keys rk ON lower(trim(c.id::text)) = rk.k
     ),
     by_user_email AS (
       SELECT c.id::text AS contact_id
       FROM raw_keys rk
       INNER JOIN users u ON lower(trim(u.id::text)) = rk.k
       INNER JOIN contact c
         ON lower(trim(c.email)) = lower(trim(u.email))
       WHERE trim(coalesce(u.email, '')) <> ''
         AND position('@' in trim(u.email)) > 1
     ),
     by_user_name_org AS (
       SELECT c.id::text AS contact_id
       FROM raw_keys rk
       INNER JOIN users u ON lower(trim(u.id::text)) = rk.k
       INNER JOIN contact c
         ON lower(trim(coalesce(c.first_name, ''))) =
              lower(trim(coalesce(u.first_name, '')))
        AND lower(trim(coalesce(c.last_name, ''))) =
              lower(trim(coalesce(u.last_name, '')))
        AND (
          c.organization_id IS NOT DISTINCT FROM u.organization_id
          OR c.organization_id IS NULL
        )
       WHERE trim(coalesce(u.first_name, '')) <> ''
         AND trim(coalesce(u.last_name, '')) <> ''
         AND (
           lower(trim(coalesce(u.email, ''))) LIKE 'redacted%'
           OR position('@' in lower(trim(coalesce(u.email, '')))) < 1
         )
     ),
     by_lp_email AS (
       SELECT c.id::text AS contact_id
       FROM matched e
       INNER JOIN contact c
         ON lower(trim(c.email)) = lower(trim(e.email))
       WHERE trim(coalesce(e.email, '')) <> ''
         AND position('@' in trim(e.email)) > 1
     ),
     by_created AS (
       SELECT c.id::text AS contact_id
       FROM contact c
       INNER JOIN sponsors s ON c.created_by = s.user_id
     )
     SELECT DISTINCT contact_id FROM by_id
     UNION
     SELECT DISTINCT contact_id FROM by_user_email
     UNION
     SELECT DISTINCT contact_id FROM by_user_name_org
     UNION
     SELECT DISTINCT contact_id FROM by_lp_email
     UNION
     SELECT DISTINCT contact_id FROM by_created`,
    [sponsorIds, orgId],
  );

  return [
    ...new Set(
      res.rows
        .map((r) => String(r.contact_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * CRM `contact.id` values a Co-sponsor may see and edit:
 * - contacts for investors whose **Sponsor name** on a co-sponsor deal resolves to
 *   this viewer (Investor → Sponsor/Co-sponsor via `deal_lp_investor.added_by` /
 *   `deal_member.added_by`, including equivalent portal accounts)
 * - contacts the current co-sponsor (or equivalent) created (`created_by`)
 *
 * This is the deal investor relationship, not “any co-sponsor on the deal” and not
 * contact-table provenance alone.
 */
async function listCrmContactIdsOnViewerCoSponsorDeals(
  viewerUserId: string,
): Promise<string[]> {
  return listCrmContactIdsAssociatedWithSponsorViewer(viewerUserId, {
    includeSameOrganization: true,
  });
}

function inContactIdsSql(ids: string[]): SQL | null {
  const uniq = [
    ...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  if (uniq.length === 0) return null;
  return inArray(contact.id, uniq);
}

/** Company-wide sponsor association (condition 2), not a random company user. */
async function viewerIncludesSameOrganizationAssociatedInvestors(
  viewerUserId: string,
  roleForScope: string | null | undefined,
): Promise<boolean> {
  if (isCompanyAdminRole(roleForScope)) return true;
  if (await viewerIsLeadOrAdminSponsorOnAnyDeal(viewerUserId)) return true;
  return false;
}

/**
 * All Contacts list:
 * - **platform_admin**: contacts for the active organization workspace (same org pool as company admin).
 * - Users tied to a company: contacts with **`organization_id` = viewer’s org**, plus **legacy**
 *   rows (`organization_id` null) whose `created_by` is anyone in that org.
 * - No company / org: only contacts they created themselves.
 *
 * **Lead / Admin** (and company admin): CRM rows for investors whose
 * Investors-tab **Sponsor name** (`added_by`) is this viewer, or (same company)
 * belongs to their organization. Co-sponsors see only investors whose Sponsor
 * name is them, plus contacts they created — not the rest of the org CRM.
 *
 * Other roles see external CRM rows only, plus investors they personally added.
 */
export async function listContactsForViewerScoped(
  viewerUserId: string,
  viewerRole: string | null | undefined,
  requestedOrganizationId?: string | null,
): Promise<ContactRow[]> {
  const ctx = await getViewerContactScopeContext(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  const sponsorTeamSeesFullCrm = await viewerIsLeadOrAdminSponsorOnAnyDeal(
    viewerUserId,
  );
  const coSponsorNarrow =
    await viewerShouldSeeOnlySelfCreatedContacts(
      viewerUserId,
      ctx.roleForScope,
    );
  const includeSameOrganization =
    isCompanyAdminRole(ctx.roleForScope) || sponsorTeamSeesFullCrm;

  const vis =
    isCompanyAdminRole(ctx.roleForScope) ||
    isPlatformAdminRole(ctx.roleForScope) ||
    sponsorTeamSeesFullCrm ||
    coSponsorNarrow
      ? fullOrgContactListVisibilityWhere(ctx.viewerEmailNorm)
      : contactsVisibilityWhereForRole(ctx.roleForScope, ctx.viewerEmailNorm);

  const associatedInvestorIds =
    await listCrmContactIdsAssociatedWithSponsorViewer(viewerUserId, {
      includeSameOrganization,
    });
  const associatedIdsSql = inContactIdsSql(associatedInvestorIds);
  const notPlatformAdminOnlyOrAssociated = associatedIdsSql
    ? or(eq(contact.platformAdminOnly, false), associatedIdsSql)!
    : excludePlatformAdminOnlyContactsWhere();
  const visOrAssociated = associatedIdsSql
    ? or(vis, associatedIdsSql)!
    : vis;

  const orgId = ctx.organizationId;

  if (isPlatformAdminRole(ctx.roleForScope)) {
    if (!orgId) return [];
    const memberIds = await userIdsInOrganization(orgId);
    const orgScope = buildOrganizationContactsWhere(
      orgId,
      viewerUserId,
      memberIds,
    );
    return db
      .select()
      .from(contact)
      .where(and(orgScope, excludePlatformAdminOnlyContactsWhere())!)
      .orderBy(desc(contact.createdAt));
  }

  if (!orgId) {
    const equivalentIds = await listEquivalentPortalUserIdsForUser(
      viewerUserId,
    );
    const creatorIds =
      equivalentIds.length > 0 ? equivalentIds : [viewerUserId];
    if (!associatedIdsSql) {
      return db
        .select()
        .from(contact)
        .where(
          and(
            inArray(contact.createdBy, creatorIds),
            vis,
            excludePlatformAdminOnlyContactsWhere(),
          )!,
        )
        .orderBy(desc(contact.createdAt));
    }
    return db
      .select()
      .from(contact)
      .where(
        and(
          or(
            inArray(contact.createdBy, creatorIds),
            associatedIdsSql,
          )!,
          visOrAssociated,
          notPlatformAdminOnlyOrAssociated,
        )!,
      )
      .orderBy(desc(contact.createdAt));
  }

  const memberIds = await userIdsInOrganization(orgId);

  const orgScope = buildOrganizationContactsWhere(orgId, viewerUserId, memberIds);
  const orgOrAssociated = associatedIdsSql
    ? or(orgScope, associatedIdsSql)!
    : orgScope;

  const parts: SQL[] = [
    orgOrAssociated,
    visOrAssociated,
    notPlatformAdminOnlyOrAssociated,
  ];
  if (coSponsorNarrow) {
    const equivalentIds = await listEquivalentPortalUserIdsForUser(
      viewerUserId,
    );
    const creatorIds =
      equivalentIds.length > 0 ? equivalentIds : [viewerUserId];
    if (!associatedIdsSql) {
      parts.push(inArray(contact.createdBy, creatorIds));
    } else {
      parts.push(
        or(
          inArray(contact.createdBy, creatorIds),
          associatedIdsSql,
        )!,
      );
    }
  }

  return db
    .select()
    .from(contact)
    .where(and(...parts)!)
    .orderBy(desc(contact.createdAt));
}

/**
 * Distinct deals per CRM contact for the Contacts "Deals" column.
 *
 * `deal_investment.contact_id` may be either the CRM `contact.id` or a portal
 * `users.id`. Count a deal when the investment key matches the contact id, or
 * matches a portal user with the same email (same bridge as Members deal counts).
 * Scoped to deals visible to this viewer ({@link listAddDealFormsForViewer}).
 */
export async function countDealInvestmentsByContactIdForViewer(params: {
  viewerUserId: string;
  jwtUserRole: string | undefined;
  contactIds: string[];
  requestedOrganizationId?: string | null;
}): Promise<Map<string, number>> {
  const scope = await resolveDealViewerScope(
    params.viewerUserId,
    params.jwtUserRole,
    params.requestedOrganizationId,
  );
  const keys = [
    ...new Set(
      params.contactIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const result = new Map<string, number>();
  for (const k of keys) result.set(k, 0);
  if (keys.length === 0) return result;

  const idParams = sql.join(keys.map((k) => sql`${k}`), sql`, `);

  const unrestricted = scope.isPlatformAdmin || scope.seesAllDeals;
  if (unrestricted) {
    const executed = await db.execute(sql`
      WITH contact_keys AS (
        SELECT
          lower(trim(c.id::text)) AS contact_key,
          lower(trim(c.email)) AS email_norm
        FROM contact c
        WHERE lower(trim(c.id::text)) IN (${idParams})
      ),
      id_matches AS (
        SELECT ck.contact_key, di.deal_id
        FROM deal_investment di
        INNER JOIN contact_keys ck
          ON lower(trim(di.contact_id)) = ck.contact_key
      ),
      user_matches AS (
        SELECT ck.contact_key, di.deal_id
        FROM deal_investment di
        INNER JOIN users u
          ON u.id::text = trim(both from di.contact_id)
        INNER JOIN contact_keys ck
          ON lower(trim(u.email)) = ck.email_norm
        WHERE ck.email_norm <> ''
          AND position('@' in ck.email_norm) > 1
      ),
      all_links AS (
        SELECT contact_key, deal_id FROM id_matches
        UNION
        SELECT contact_key, deal_id FROM user_matches
      )
      SELECT contact_key AS cid, COUNT(DISTINCT deal_id)::int AS cnt
      FROM all_links
      GROUP BY contact_key
    `);
    fillDealCountMapFromExecute(result, executed);
    return result;
  }

  const visibleDeals = await listAddDealFormsForViewer(scope);
  const dealIds = [
    ...new Set(
      visibleDeals.map((d) => String(d.id ?? "").trim()).filter(Boolean),
    ),
  ];
  if (dealIds.length === 0) return result;

  const dealIdParams = sql.join(
    dealIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const executed = await db.execute(sql`
    WITH contact_keys AS (
      SELECT
        lower(trim(c.id::text)) AS contact_key,
        lower(trim(c.email)) AS email_norm
      FROM contact c
      WHERE lower(trim(c.id::text)) IN (${idParams})
    ),
    id_matches AS (
      SELECT ck.contact_key, di.deal_id
      FROM deal_investment di
      INNER JOIN contact_keys ck
        ON lower(trim(di.contact_id)) = ck.contact_key
      WHERE di.deal_id IN (${dealIdParams})
    ),
    user_matches AS (
      SELECT ck.contact_key, di.deal_id
      FROM deal_investment di
      INNER JOIN users u
        ON u.id::text = trim(both from di.contact_id)
      INNER JOIN contact_keys ck
        ON lower(trim(u.email)) = ck.email_norm
      WHERE di.deal_id IN (${dealIdParams})
        AND ck.email_norm <> ''
        AND position('@' in ck.email_norm) > 1
    ),
    all_links AS (
      SELECT contact_key, deal_id FROM id_matches
      UNION
      SELECT contact_key, deal_id FROM user_matches
    )
    SELECT contact_key AS cid, COUNT(DISTINCT deal_id)::int AS cnt
    FROM all_links
    GROUP BY contact_key
  `);
  fillDealCountMapFromExecute(result, executed);
  return result;
}

function fillDealCountMapFromExecute(
  result: Map<string, number>,
  executed: unknown,
): void {
  const raw = executed as unknown as
    | { rows?: unknown[] }
    | unknown[];
  const list = Array.isArray(raw) ? raw : (raw.rows ?? []);
  for (const row of list) {
    if (row == null || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const cid = String(r.cid ?? r.CID ?? "").trim().toLowerCase();
    const n = Number(r.cnt ?? r.CNT);
    if (cid) result.set(cid, Number.isFinite(n) ? n : 0);
  }
}

/**
 * CRM contacts for All Contacts. Scoped to the viewer's active organization;
 * **platform_admin** follows the same org pool when a workspace org is selected.
 */
export async function listContactsForViewer(
  viewerUserId: string,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow[]> {
  return listContactsForViewerScoped(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
}

export async function getContactById(
  contactId: string,
): Promise<ContactRow | undefined> {
  const [row] = await db
    .select()
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  return row;
}

async function viewerCanAccessContactCreator(
  viewerUserId: string,
  createdByUserId: string,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<boolean> {
  const ctx = await getViewerContactScopeContext(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  if (isPlatformAdminRole(ctx.roleForScope)) {
    if (!ctx.organizationId) return false;
    return userHasAccessToOrganization(createdByUserId, ctx.organizationId);
  }
  if (viewerUserId === createdByUserId) return true;
  const orgId = ctx.organizationId;
  if (!orgId) return false;
  if (await userHasAccessToOrganization(createdByUserId, orgId)) return true;
  const creatorOrgId = await resolveOrganizationIdForUserId(createdByUserId);
  return creatorOrgId === orgId;
}

async function contactIdIsSponsorAssociatedInvestor(
  viewerUserId: string,
  contactId: string,
  includeSameOrganization: boolean,
): Promise<boolean> {
  const id = String(contactId ?? "").trim();
  if (!id) return false;
  const dealRelatedIds = await listCrmContactIdsAssociatedWithSponsorViewer(
    viewerUserId,
    { includeSameOrganization },
  );
  return dealRelatedIds.includes(id);
}

/** Same rules as list scope: creator, shared `organization_id`, or legacy creator-org match. */
async function viewerCanAccessContactRow(
  viewerUserId: string,
  row: ContactRow,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<boolean> {
  const ctx = await getViewerContactScopeContext(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  const includeSameOrganization =
    await viewerIncludesSameOrganizationAssociatedInvestors(
      viewerUserId,
      ctx.roleForScope,
    );
  if (isPlatformAdminOnlyContactRow(row)) {
    if (isPlatformAdminRole(ctx.roleForScope) && !ctx.organizationId)
      return true;
    return contactIdIsSponsorAssociatedInvestor(
      viewerUserId,
      row.id,
      includeSameOrganization,
    );
  }
  if (isPlatformAdminRole(ctx.roleForScope)) {
    if (!ctx.organizationId) return false;
    return contactRowBelongsToOrganization(
      row,
      ctx.organizationId,
      viewerUserId,
    );
  }
  if (
    await viewerShouldSeeOnlySelfCreatedContacts(
      viewerUserId,
      ctx.roleForScope,
    )
  ) {
    const equivalentIds = await listEquivalentPortalUserIdsForUser(
      viewerUserId,
    );
    const creatorSet = new Set(
      (equivalentIds.length > 0 ? equivalentIds : [viewerUserId]).map((id) =>
        String(id).toLowerCase(),
      ),
    );
    if (creatorSet.has(String(row.createdBy ?? "").toLowerCase())) return true;
    const dealRelatedIds =
      await listCrmContactIdsOnViewerCoSponsorDeals(viewerUserId);
    return dealRelatedIds.includes(String(row.id ?? "").trim());
  }
  if (viewerUserId === row.createdBy) return true;
  const viewerOrg = ctx.organizationId;
  if (
    viewerOrg &&
    row.organizationId &&
    row.organizationId === viewerOrg
  ) {
    return true;
  }
  if (
    await contactIdIsSponsorAssociatedInvestor(
      viewerUserId,
      row.id,
      includeSameOrganization,
    )
  )
    return true;
  return viewerCanAccessContactCreator(
    viewerUserId,
    row.createdBy,
    viewerRole,
    requestedOrganizationId,
  );
}

export type UpdateContactFieldsInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note: string;
  tags: string[];
  lists: string[];
  owners: string[];
  lastEditReason: string;
};

export async function updateContactFieldsForViewer(
  viewerUserId: string,
  contactId: string,
  fields: UpdateContactFieldsInput,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow | null> {
  const row = await getContactById(contactId);
  if (!row) return null;
  if (
    !(await viewerCanAccessContactRow(
      viewerUserId,
      row,
      viewerRole,
      requestedOrganizationId,
    ))
  )
    return null;

  const phoneStored = normalizeContactPhoneForWrite(fields.phone);
  await assertContactEmailPhoneUniqueForCreatorScope({
    creatorUserId: row.createdBy,
    email: fields.email,
    phone: phoneStored,
    excludeContactId: contactId,
    existingContactOrganizationId: row.organizationId,
  });

  const isPortalUser = await contactEmailMatchesPortalUser(fields.email);
  const [updated] = await db
    .update(contact)
    .set({
      firstName: fields.firstName,
      lastName: fields.lastName,
      fullName: buildContactFullName(fields.firstName, fields.lastName),
      email: fields.email,
      phone: phoneStored,
      note: fields.note,
      tags: fields.tags,
      lists: fields.lists,
      owners: fields.owners,
      lastEditReason: fields.lastEditReason || null,
      isPortalUser,
    })
    .where(eq(contact.id, contactId))
    .returning();
  if (!updated) return null;
  const orgForLabels =
    updated.organizationId ??
    (await resolveOrganizationIdForUserId(row.createdBy));
  await syncOrganizationContactLabels({
    organizationId: orgForLabels,
    tags: fields.tags,
    lists: fields.lists,
  });
  queueGhlContactRowSync(updated);
  return updated;
}

export async function patchContactStatusForViewer(
  viewerUserId: string,
  contactId: string,
  status: "active" | "suspended",
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow | null> {
  const row = await getContactById(contactId);
  if (!row) return null;
  if (
    !(await viewerCanAccessContactRow(
      viewerUserId,
      row,
      viewerRole,
      requestedOrganizationId,
    ))
  )
    return null;
  const [updated] = await db
    .update(contact)
    .set({ status })
    .where(eq(contact.id, contactId))
    .returning();
  return updated ?? null;
}

export type { ContactOfferingVisibility };

export async function getContactForViewer(
  viewerUserId: string,
  contactId: string,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow | null> {
  const row = await getContactById(contactId);
  if (!row) return null;
  if (
    !(await viewerCanAccessContactRow(
      viewerUserId,
      row,
      viewerRole,
      requestedOrganizationId,
    ))
  )
    return null;
  return row;
}

export async function patchContactShowOfferingsForViewer(
  viewerUserId: string,
  contactId: string,
  showOfferingsVisibility: ContactOfferingVisibility | null,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow | null> {
  const row = await getContactById(contactId);
  if (!row) return null;
  if (
    !(await viewerCanAccessContactRow(
      viewerUserId,
      row,
      viewerRole,
      requestedOrganizationId,
    ))
  )
    return null;
  const [updated] = await db
    .update(contact)
    .set({ showOfferingsVisibility })
    .where(eq(contact.id, contactId))
    .returning();
  return updated ?? null;
}

export async function patchContactAccreditationStatusForViewer(
  viewerUserId: string,
  contactId: string,
  accreditationStatus: string | null,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow | null> {
  const row = await getContactById(contactId);
  if (!row) return null;
  if (
    !(await viewerCanAccessContactRow(
      viewerUserId,
      row,
      viewerRole,
      requestedOrganizationId,
    ))
  )
    return null;
  const [updated] = await db
    .update(contact)
    .set({ accreditationStatus })
    .where(eq(contact.id, contactId))
    .returning();
  return updated ?? null;
}

export async function patchContactKnownSinceForViewer(
  viewerUserId: string,
  contactId: string,
  knownSince: string | null,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactRow | null> {
  const row = await getContactById(contactId);
  if (!row) return null;
  if (
    !(await viewerCanAccessContactRow(
      viewerUserId,
      row,
      viewerRole,
      requestedOrganizationId,
    ))
  )
    return null;
  const [updated] = await db
    .update(contact)
    .set({ knownSince })
    .where(eq(contact.id, contactId))
    .returning();
  return updated ?? null;
}
