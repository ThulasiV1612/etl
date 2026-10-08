import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import {
  DEAL_ASSETS_UPLOAD_SUBDIR,
  DEAL_INVESTMENTS_FOLDER,
  dealAssetsRelativePath,
  resolveDealStorageFolderName,
} from "./dealStoragePaths.service.js";
import { db, pool } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import { companies } from "../../schema/schema.js";
import { contact } from "../../schema/contact.schema.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import {
  dealInvestment,
  type DealInvestmentInsert,
  type DealInvestmentRow,
} from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { dealMember } from "../../schema/deal.schema/deal-member.schema.js";
import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";
import {
  isPortalUserCoSponsorOnDeal,
  isPortalUserLeadOrAdminSponsorOnDeal,
  isPortalUserSponsorOnDeal,
  listEquivalentPortalUserIdsForUser,
} from "./dealMemberScope.service.js";
import { loadCoSponsorEmailInterceptByUserLower } from "./dealCoSponsorEmailIntercept.service.js";
import {
  isDocSignedEsignCompleted,
  isDocSignedEsignPending,
} from "../../constants/deal-doc-signed.js";
import {
  esignCategoryFromCommitmentProfileId,
  esignSignedColumnLabelFromApi,
  parseEsignStatusJson,
} from "../../constants/deal-investor-esign-status.js";
import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import { formatPortalUserDisplayLabel } from "../../utils/portalUsernameDisplay.js";
import { userInvestorProfiles } from "../../schema/investing.schema/userProfileBook.schema.js";

const UPLOAD_SUBDIR = DEAL_ASSETS_UPLOAD_SUBDIR;

/** Canonical `investor_role` for LP investors (Investors tab add + list filter). */
export const LP_INVESTOR_ROLE_STORED = "lp_investors";

/** Stored `investor_role` / `deal_member_role` for Deal Members → General Partners. */
export const GENERAL_PARTNER_ROLE_STORED = "General Partner";

const LP_INVESTOR_ROLE_MATCH = [
  LP_INVESTOR_ROLE_STORED,
  "LP Investors",
  "LP Investor",
] as const;

/** True when `investor_role` is the LP Investors tab role (not sponsor / deal team roles). */
export function isLpInvestorRole(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "lp_investors" || s === "lp investors" || s === "lp investor";
}

/** True when the stored role is General Partner (value or plural label). */
export function isGeneralPartnerStoredRole(
  raw: string | null | undefined,
): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return (
    s === "general partner" ||
    s === "general partners" ||
    s === "team member" ||
    s === "team members"
  );
}

/** Lead / Admin / Co-sponsor / Deal Member — stay on Deal Members, not General Partners. */
export function isDealTeamRosterRole(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return (
    s === "lead sponsor" ||
    s === "admin sponsor" ||
    s === "co-sponsor" ||
    s === "co sponsor" ||
    s === "deal member"
  );
}

/**
 * Company users billed on the deal plan (Starter 1 / Running 2 / Growth 3).
 * Includes Deal Members team roles and Team Member (stored as General Partner).
 * LP investors are not company users.
 */
export function isDealCompanyUserStoredRole(
  raw: string | null | undefined,
): boolean {
  return isDealTeamRosterRole(raw) || isGeneralPartnerStoredRole(raw);
}

export function isGpSubscriptionType(subscriptionType: string): boolean {
  return String(subscriptionType ?? "").trim().toLowerCase() === "gp";
}

/** True when the stored class id/name is a GP (General Partner) class on this deal. */
export function storedInvestorClassIsGp(
  stored: string | null | undefined,
  classes: ReadonlyArray<{
    id: string;
    name: string;
    subscriptionType: string;
  }>,
): boolean {
  const t = String(stored ?? "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const matched = classes.find(
    (c) =>
      c.id.trim().toLowerCase() === lower ||
      c.name.trim().toLowerCase() === lower,
  );
  if (matched) return isGpSubscriptionType(matched.subscriptionType);
  return /\bgp\b|general partner/.test(lower);
}

/**
 * GP roster identity: General Partner role, or a GP class when the person is not
 * already a Deal Members team role (Lead / Admin / Co / Deal Member).
 */
export function rowIsGeneralPartnerForRoster(
  role: string | null | undefined,
  investorClass: string | null | undefined,
  classes: ReadonlyArray<{
    id: string;
    name: string;
    subscriptionType: string;
  }>,
): boolean {
  if (isDealTeamRosterRole(role)) return false;
  return (
    isGeneralPartnerStoredRole(role) ||
    storedInvestorClassIsGp(investorClass, classes)
  );
}

const MEMBER_NAME: Record<string, string> = {
  rebecca_duffy: "Rebecca Duffy",
  nigam_family: "Nigam Family LLC",
  j_smith: "J. Smith",
};

const USER_BY_CONTACT: Record<
  string,
  { userDisplayName: string; userEmail: string }
> = {
  rebecca_duffy: {
    userDisplayName: "rduffy",
    userEmail: "rebecca.duffy@example.com",
  },
  nigam_family: {
    userDisplayName: "anigam",
    userEmail: "contact@nigamfamily.com",
  },
  j_smith: {
    userDisplayName: "jsmith",
    userEmail: "j.smith@example.com",
  },
};

const PROFILE_LABEL: Record<string, string> = {
  individual: "Individual",
  custodian_ira_401k: "Custodian IRA or custodian based 401(k)",
  joint_tenancy: "Joint tenancy",
  llc_corp_trust_etc:
    "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
};

/**
 * Ensures `investor_class` matches a row in `deal_investor_class` for this deal.
 * Accepts class id or name (case-insensitive name match). Stores the class **name** on the investment row.
 */
/** Stored as `contact_id` when Add Investment autosave runs before a member is chosen. */
export const DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER =
  "__portal_investment_autosave__";

function isLpSubscriptionType(subscriptionType: string): boolean {
  return subscriptionType.trim().toLowerCase() === "lp";
}

function isMezzanineSubscriptionType(subscriptionType: string): boolean {
  return subscriptionType.trim().toLowerCase() === "mezzanine";
}

function isInvestorOnboardingSubscriptionType(subscriptionType: string): boolean {
  return (
    isLpSubscriptionType(subscriptionType) ||
    isMezzanineSubscriptionType(subscriptionType)
  );
}

const LP_ONBOARDING_CLASS_UNAVAILABLE_MESSAGE =
  "General partner classes are not available during investor onboarding. Select a limited partner (LP) or mezzanine class.";

const GP_CLASS_ON_INVESTORS_TAB_MESSAGE =
  "General partner classes belong on Deal Members → General Partners, not on the Investors list.";

export async function resolveFirstInvestorClassForDeal(
  dealId: string,
): Promise<
  { ok: true; storedInvestorClass: string } | { ok: false; message: string }
> {
  const classes = await listInvestorClassesByDealId(dealId);
  if (classes.length === 0) {
    return {
      ok: false,
      message:
        "Add at least one investor class in the Classes section before recording an investment.",
    };
  }
  const first = classes[0]!;
  const name = first.name?.trim();
  return { ok: true, storedInvestorClass: name || first.id };
}

/** First LP or mezzanine class for investor onboarding when no class is selected yet. */
export async function resolveFirstLpInvestorClassForDeal(
  dealId: string,
): Promise<
  { ok: true; storedInvestorClass: string } | { ok: false; message: string }
> {
  const classes = await listInvestorClassesByDealId(dealId);
  const onboardingClasses = classes.filter((c) =>
    isInvestorOnboardingSubscriptionType(c.subscriptionType),
  );
  if (onboardingClasses.length === 0) {
    return {
      ok: false,
      message:
        "No limited partner (LP) or mezzanine investment classes are available for investor onboarding on this deal.",
    };
  }
  const first = onboardingClasses[0]!;
  const name = first.name?.trim();
  return { ok: true, storedInvestorClass: name || first.id };
}

export type ResolveInvestorClassOpts = {
  /** Deal team / sponsor members may omit class until Classes are configured. */
  optional?: boolean;
  /** Investor onboarding: LP and mezzanine classes only (GP excluded). */
  lpOnboardingOnly?: boolean;
  /** Investors tab: reject GP classes (they belong on General Partners). */
  excludeGp?: boolean;
};

export async function resolveInvestorClassForDealInvestment(
  dealId: string,
  raw: string,
  opts?: ResolveInvestorClassOpts,
): Promise<
  { ok: true; storedInvestorClass: string } | { ok: false; message: string }
> {
  const classes = await listInvestorClassesByDealId(dealId);
  const t = raw.trim();
  const optional = opts?.optional === true;

  if (!t && optional) {
    return { ok: true, storedInvestorClass: "" };
  }

  if (classes.length === 0) {
    if (!t) {
      return {
        ok: false,
        message:
          "Add at least one investor class in the Classes section before recording an investment.",
      };
    }
    return {
      ok: false,
      message:
        "No investor classes are defined for this deal. Complete the Classes section before assigning a class.",
    };
  }

  if (!t) {
    return { ok: false, message: "Investor class is required." };
  }

  function rejectIfClassNotAllowed(
    subscriptionType: string,
  ): { ok: false; message: string } | null {
    if (
      opts?.lpOnboardingOnly &&
      !isInvestorOnboardingSubscriptionType(subscriptionType)
    ) {
      return { ok: false, message: LP_ONBOARDING_CLASS_UNAVAILABLE_MESSAGE };
    }
    if (opts?.excludeGp && isGpSubscriptionType(subscriptionType)) {
      return { ok: false, message: GP_CLASS_ON_INVESTORS_TAB_MESSAGE };
    }
    return null;
  }

  const byId = classes.find((c) => c.id === t);
  if (byId) {
    const blocked = rejectIfClassNotAllowed(byId.subscriptionType);
    if (blocked) return blocked;
    const name = byId.name?.trim();
    return {
      ok: true,
      storedInvestorClass: name || byId.id,
    };
  }

  const norm = (s: string) => s.trim().toLowerCase();
  const byName = classes.find((c) => norm(c.name) === norm(t));
  if (byName) {
    const blocked = rejectIfClassNotAllowed(byName.subscriptionType);
    if (blocked) return blocked;
    const name = byName.name?.trim();
    return {
      ok: true,
      storedInvestorClass: name || byName.id,
    };
  }

  return {
    ok: false,
    message:
      "The selected investor class is not defined for this deal. Choose a class from the Classes section.",
  };
}

export type CreateDealInvestmentInput = {
  offeringId: string;
  contactId: string;
  /** Human-readable member label (from directory); stored so list API does not show raw id */
  contactDisplayName: string;
  profileId: string;
  /** Investing → Profiles book row, optional. */
  userInvestorProfileId?: string | null;
  investor_role: string;
  /** Sponsor funded / approve-fund (column `fund_approved`). */
  fundApproved: boolean;
  /** Last fund-approval actor (`users.id` / contact id) when `fundApproved` is true. */
  fundApprovedBy?: string | null;
  /** Last fund-approval timestamp when `fundApproved` is true. */
  fundApprovedAt?: Date | null;
  status: string;
  investorClass: string;
  docSignedDate: string | null;
  commitmentAmount: string;
  extraContributionAmounts: string[];
  documentStoragePath: string | null;
  fundingMethod?: string;
};

/** Matches PostgreSQL uuid text (any variant) — used for users.id lookups */
function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

function memberName(contactId: string): string {
  const mapped = MEMBER_NAME[contactId]?.trim();
  if (mapped) return mapped;
  const c = contactId?.trim();
  if (!c) return "—";
  if (looksLikeUuid(c)) return "—";
  return c;
}

function formatMemberDisplayFromUser(u: {
  firstName: string;
  lastName: string;
  username: string;
  companyName: string | null;
}): string {
  return formatPortalUserDisplayLabel(u);
}

type ResolvedPortalUser = {
  displayName: string;
  userDisplayName: string;
  userEmail: string;
  firstName: string;
  lastName: string;
};

/**
 * Load portal `users` and CRM `contact` rows for uuid `contact_id` values so list APIs
 * return name + email (contacts are not in `users`).
 */
function emailFromContactIdLiteral(contactId: string): string | null {
  const t = contactId.trim().toLowerCase();
  return t.includes("@") ? t : null;
}

export async function resolveUsersByContactIds(
  rows: DealInvestmentRow[],
): Promise<Map<string, ResolvedPortalUser>> {
  const m = new Map<string, ResolvedPortalUser>();
  const need = new Set<string>();
  for (const r of rows) {
    const id = r.contactId?.trim();
    if (!id) continue;
    const asEmail = emailFromContactIdLiteral(id);
    if (asEmail) {
      m.set(id.toLowerCase(), {
        displayName: memberName(id),
        userDisplayName: "—",
        userEmail: asEmail,
        firstName: "",
        lastName: "",
      });
      continue;
    }
    if (looksLikeUuid(id)) need.add(id.toLowerCase());
  }
  if (need.size === 0) return m;
  const ids = [...need];
  const found = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      companyName: companies.name,
    })
    .from(users)
    .leftJoin(companies, eq(users.organizationId, companies.id))
    .where(inArray(users.id, ids));
  for (const u of found) {
    const key = String(u.id).toLowerCase();
    const email = u.email?.trim() || "—";
    const label = formatMemberDisplayFromUser(u);
    m.set(key, {
      displayName: label,
      userDisplayName: label,
      userEmail: email,
      firstName: String(u.firstName ?? "").trim(),
      lastName: String(u.lastName ?? "").trim(),
    });
  }
  const notInUsers = ids.filter((id) => !m.has(id.toLowerCase()));
  if (notInUsers.length > 0) {
    const contactRows = await db
      .select({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
      })
      .from(contact)
      .where(inArray(contact.id, notInUsers));
    for (const c of contactRows) {
      const key = String(c.id).toLowerCase();
      const firstName = String(c.firstName ?? "").trim();
      const lastName = String(c.lastName ?? "").trim();
      const displayName =
        [firstName, lastName].filter(Boolean).join(" ").trim() || "—";
      const email = c.email?.trim() || "—";
      m.set(key, {
        displayName,
        userDisplayName: "—",
        userEmail: email,
        firstName,
        lastName,
      });
    }
  }
  return m;
}

/** First + last for “Added by” / roster adder labels; prefers person name over company. */
function formatFirstLastFromNames(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const full = [first, last]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || "—";
}

/**
 * Resolve portal user ids (e.g. `deal_member.added_by`, `deal_lp_investor.added_by`) to a display
 * string: **first + last name** when present, else company / username / email for users.
 * IDs not in `users` are resolved from `contact` (same UUID directory) so sponsor-only contact rows still show.
 */
export async function resolveUserDisplayNamesByIds(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const need = new Set<string>();
  for (const raw of ids) {
    const id = raw?.trim();
    if (id && looksLikeUuid(id)) need.add(id.toLowerCase());
  }
  if (need.size === 0) return new Map();
  const idList = [...need];
  const found = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      companyName: companies.name,
    })
    .from(users)
    .leftJoin(companies, eq(users.organizationId, companies.id))
    .where(inArray(users.id, idList));
  const m = new Map<string, string>();
  for (const u of found) {
    const key = String(u.id).toLowerCase();
    const firstLast = formatFirstLastFromNames(u.firstName, u.lastName);
    if (firstLast !== "—") {
      m.set(key, firstLast);
      continue;
    }
    const fromUser = formatMemberDisplayFromUser(u);
    if (fromUser && fromUser !== "—") {
      m.set(key, fromUser);
      continue;
    }
    const email = String(u.email ?? "").trim();
    if (email) m.set(key, email);
  }
  const missingAfterUsers = idList.filter((id) => !m.has(id));
  if (missingAfterUsers.length === 0) return m;

  const contactRows = await db
    .select({
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
    })
    .from(contact)
    .where(inArray(contact.id, missingAfterUsers));
  for (const c of contactRows) {
    const key = String(c.id).toLowerCase();
    const firstLast = formatFirstLastFromNames(c.firstName, c.lastName);
    if (firstLast !== "—") {
      m.set(key, firstLast);
      continue;
    }
    const email = String(c.email ?? "").trim();
    if (email) m.set(key, email);
  }
  return m;
}

/** Resolve portal / contact emails by user or contact UUID (lowercased keys). */
export async function resolveUserEmailsByIds(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const need = new Set<string>();
  for (const raw of ids) {
    const id = raw?.trim();
    if (id && looksLikeUuid(id)) need.add(id.toLowerCase());
  }
  if (need.size === 0) return new Map();
  const idList = [...need];
  const m = new Map<string, string>();

  const found = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, idList));
  for (const u of found) {
    const email = String(u.email ?? "").trim();
    if (email) m.set(String(u.id).toLowerCase(), email);
  }

  const missingAfterUsers = idList.filter((id) => !m.has(id));
  if (missingAfterUsers.length === 0) return m;

  const contactRows = await db
    .select({
      id: contact.id,
      email: contact.email,
    })
    .from(contact)
    .where(inArray(contact.id, missingAfterUsers));
  for (const c of contactRows) {
    const email = String(c.email ?? "").trim();
    if (email) m.set(String(c.id).toLowerCase(), email);
  }
  return m;
}

function profileLabel(profileId: string): string {
  if (!profileId?.trim()) return "—";
  return PROFILE_LABEL[profileId] ?? profileId;
}

/** Batch-resolve Investing → Profiles display names for deal investment rows. */
export async function resolveUserInvestorProfileNamesByIds(
  profileIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uuids = [
    ...new Set(
      profileIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => looksLikeUuid(id)),
    ),
  ];
  if (uuids.length === 0) return out;
  const rows = await db
    .select({
      id: userInvestorProfiles.id,
      profileName: userInvestorProfiles.profileName,
    })
    .from(userInvestorProfiles)
    .where(inArray(userInvestorProfiles.id, uuids));
  for (const r of rows) {
    const name = String(r.profileName ?? "").trim();
    if (!name) continue;
    out.set(String(r.id).toLowerCase(), name);
  }
  return out;
}

function withUserInvestorProfileName<T extends { userInvestorProfileId?: string }>(
  row: T,
  namesById: Map<string, string>,
): T & { userInvestorProfileName?: string } {
  const id = String(row.userInvestorProfileId ?? "")
    .trim()
    .toLowerCase();
  const name = id ? namesById.get(id) : undefined;
  if (!name) return row;
  return { ...row, userInvestorProfileName: name };
}

function userForContact(contactId: string): {
  userDisplayName: string;
  userEmail: string;
} {
  return (
    USER_BY_CONTACT[contactId] ?? {
      userDisplayName: "—",
      userEmail: "—",
    }
  );
}

function formatSignedDate(
  iso: string | null | undefined,
  esignStatusJson?: string | null,
  commitmentProfileId?: string | null,
): string {
  const categoryId = esignCategoryFromCommitmentProfileId(commitmentProfileId);
  const fromEsign = esignSignedColumnLabelFromApi(
    parseEsignStatusJson(esignStatusJson, categoryId),
  );
  if (fromEsign) return fromEsign;

  const s = iso?.trim();
  if (!s) return "—";
  if (isDocSignedEsignPending(s)) return "Sent";
  if (isDocSignedEsignCompleted(s)) return "Completed";
  return formatDdMmmYyyy(s);
}

function committedAmountParts(
  commitmentAmount: string,
  extras: string[] | null | undefined,
): number[] {
  const list = Array.isArray(extras) ? extras.map(String) : [];
  const raw = [commitmentAmount, ...list];
  return raw
    .map((s) => parseFloat(String(s).replace(/[^0-9.-]/g, "")))
    .filter((n) => Number.isFinite(n));
}

/** Plain numeric string for `fund_approved_commitment_snapshot` when sponsor approves. */
function fundApprovedSnapshotStoredFromInput(
  input: CreateDealInvestmentInput,
): string {
  const nums = committedAmountParts(
    input.commitmentAmount,
    input.extraContributionAmounts ?? [],
  );
  if (nums.length === 0) return "0";
  const t = nums.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(t) || t < 0) return "0";
  const rounded = Math.round(t * 100) / 100;
  return String(rounded);
}

function formatCommitted(
  commitmentAmount: string,
  extras: string[] | null | undefined,
): string {
  const nums = committedAmountParts(commitmentAmount, extras);
  const sum =
    nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(sum);
}

function rowCommittedNumeric(row: DealInvestmentRow): number {
  const nums = committedAmountParts(
    row.commitmentAmount,
    row.extraContributionAmounts as string[] | null,
  );
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0);
}

/** Sum of primary commitment + extra lines (used for cumulative LP commits). */
export function committedNumericFromDealInvestmentRow(
  row: DealInvestmentRow,
): number {
  return rowCommittedNumeric(row);
}

function formatUsdKpi(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** USD string for KPI tiles; allows $0 (unlike `formatUsdKpi`). */
function formatUsdKpiFundedTile(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Statuses that count toward Total Funded even when `fund_approved` is false
 * (imported / legacy rows, e.g. Wildflower “Funds partially received”).
 */
function investmentStatusCountsTowardFunded(
  status: string | null | undefined,
): boolean {
  const raw = String(status ?? "").trim();
  if (!raw) return false;
  if (/funds?\s+fully\s+received/i.test(raw)) return true;
  if (/funds?\s+partially\s+received/i.test(raw)) return true;
  return false;
}

/**
 * Dollars counted toward total funded / class actually-funded.
 * Full commitment when `fund_approved`, or when status shows funds received
 * (fully / partially). Pending re-approval after an LP increase uses the snapshot only.
 */
export function fundedNumericForInvestorKpiRow(r: DealInvestmentRow): number {
  const total = rowCommittedNumeric(r);
  if (!Number.isFinite(total) || total < 0) return 0;
  if (Boolean(r.fundApproved) || investmentStatusCountsTowardFunded(r.status))
    return Math.round(total * 100) / 100;
  const snapRaw = String(r.fundApprovedCommitmentSnapshot ?? "").trim();
  if (!snapRaw) return 0;
  const snap = parseFloat(snapRaw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(snap) || snap <= 0) return 0;
  if (total > snap + 1e-6) return Math.round(snap * 100) / 100;
  return 0;
}

export function buildInvestorKpisFromRows(rows: DealInvestmentRow[]): {
  offeringSize: string;
  committed: string;
  remaining: string;
  totalApproved: string;
  totalPending: string;
  totalFunded: string;
  approvedCount: string;
  pendingCount: string;
  waitlistCount: string;
  averageApproved: string;
  nonAccreditedCount: string;
} {
  let total = 0;
  let fundedTotal = 0;
  for (const r of rows) {
    total += rowCommittedNumeric(r);
    fundedTotal += fundedNumericForInvestorKpiRow(r);
  }
  const count = rows.length;
  const avg = count > 0 && total > 0 ? total / count : 0;
  return {
    offeringSize: "—",
    committed: formatUsdKpi(total),
    remaining: "—",
    totalApproved: formatUsdKpi(total),
    totalPending: "—",
    totalFunded: formatUsdKpiFundedTile(fundedTotal),
    approvedCount: String(count),
    pendingCount: "—",
    waitlistCount: "—",
    averageApproved: count > 0 && total > 0 ? formatUsdKpi(avg) : "—",
    nonAccreditedCount: "—",
  };
}

function sendInvitationYes(raw: string | null | undefined): boolean {
  return String(raw ?? "").toLowerCase().trim() === "yes";
}

/**
 * `send_invitation_mail` on `deal_member` and `deal_lp_investor` (yes/no) per merged row
 * (Investors + Deal members tables).
 */
export async function loadInvitationMailSentFlags(
  dealId: string,
  rows: DealInvestmentRow[],
  lpRosterIdSet: Set<string>,
): Promise<boolean[]> {
  if (rows.length === 0) return [];
  const [memberRows, lpRows] = await Promise.all([
    db
      .select({
        contactMemberId: dealMember.contactMemberId,
        sendInvitationMail: dealMember.sendInvitationMail,
      })
      .from(dealMember)
      .where(eq(dealMember.dealId, dealId)),
    db
      .select({
        id: dealLpInvestor.id,
        contactMemberId: dealLpInvestor.contactMemberId,
        sendInvitationMail: dealLpInvestor.sendInvitationMail,
      })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, dealId)),
  ]);
  const memberByContact = new Map<string, string>();
  for (const m of memberRows) {
    const k = rosterContactKey(m.contactMemberId);
    if (k) memberByContact.set(k, m.sendInvitationMail);
  }
  const lpById = new Map<string, string>();
  const lpByContact = new Map<string, string>();
  for (const r of lpRows) {
    const idk = String(r.id).toLowerCase();
    if (idk) lpById.set(idk, r.sendInvitationMail);
    const ck = rosterContactKey(r.contactMemberId);
    if (ck) lpByContact.set(ck, r.sendInvitationMail);
  }
  return rows.map((row) => {
    const idK = String(row.id ?? "").toLowerCase();
    if (idK && lpRosterIdSet.has(idK)) {
      return sendInvitationYes(lpById.get(idK));
    }
    const ck = rosterContactKey(row.contactId);
    if (memberByContact.has(ck)) {
      return sendInvitationYes(memberByContact.get(ck));
    }
    if (lpByContact.has(ck)) {
      return sendInvitationYes(lpByContact.get(ck));
    }
    return false;
  });
}

export function mapRowToInvestorApi(
  row: DealInvestmentRow,
  resolvedByUserId?: Map<string, ResolvedPortalUser>,
  opts?: { invitationMailSent?: boolean },
) {
  const invitationMailSent = Boolean(opts?.invitationMailSent);
  const cid = row.contactId?.trim() ?? "";
  if (cid === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER) {
    const extras = (row.extraContributionAmounts as string[] | null) ?? [];
    return {
      id: row.id,
      displayName: "Draft",
      entitySubtitle: profileLabel(row.profileId),
      userDisplayName: "—",
      userEmail: "—",
      firstName: "",
      lastName: "",
      investorClass: row.investorClass?.trim() || "—",
      investorRole: row.investor_role?.trim() || "",
      status: row.status?.trim() || "—",
      fundApproved: Boolean(row.fundApproved),
      fundApprovedByUserId: String(row.fundApprovedBy ?? "").trim(),
      fundApprovedAtIso: row.fundApprovedAt
        ? new Date(row.fundApprovedAt).toISOString()
        : "",
      fundApprovedCommitmentSnapshot: String(
        row.fundApprovedCommitmentSnapshot ?? "",
      ).trim(),
      committed: formatCommitted(
        row.commitmentAmount,
        row.extraContributionAmounts as string[] | null,
      ),
      signedDate: formatSignedDate(
        row.docSignedDate,
        row.esignStatusJson,
        row.profileId,
      ),
      esignStatus: parseEsignStatusJson(
        row.esignStatusJson,
        esignCategoryFromCommitmentProfileId(row.profileId),
      ),
      esignStatusBundleJson: row.esignStatusJson?.trim() || null,
      fundedDate: "—",
      selfAccredited: "—",
      verifiedAccLabel: "Not Started",
      contactId: row.contactId ?? "",
      profileId: row.profileId ?? "",
      userInvestorProfileId: String(row.userInvestorProfileId ?? "").trim(),
      offeringId: row.offeringId ?? "",
      commitmentAmountRaw: row.commitmentAmount ?? "",
      extraContributionAmounts: extras,
      docSignedDateIso: row.docSignedDate?.trim() ?? "",
      invitationMailSent,
    };
  }
  const legacy = userForContact(row.contactId);
  const res =
    cid && looksLikeUuid(cid)
      ? resolvedByUserId?.get(cid.toLowerCase())
      : undefined;

  const stored = row.contactDisplayName?.trim();
  const displayName =
    stored || res?.displayName || memberName(row.contactId);

  const userDisplayName = res?.userDisplayName ?? legacy.userDisplayName;
  let userEmail = res?.userEmail ?? legacy.userEmail;
  const emailFromContactId = emailFromContactIdLiteral(cid);
  if ((!userEmail || userEmail === "—") && emailFromContactId) {
    userEmail = emailFromContactId;
  }

  const extras = (row.extraContributionAmounts as string[] | null) ?? [];
  return {
    id: row.id,
    displayName,
    entitySubtitle: profileLabel(row.profileId),
    userDisplayName,
    userEmail,
    firstName: String(res?.firstName ?? "").trim(),
    lastName: String(res?.lastName ?? "").trim(),
    investorClass: row.investorClass?.trim() || "—",
    investorRole: row.investor_role?.trim() || "",
    status: row.status?.trim() || "—",
    fundApproved: Boolean(row.fundApproved),
    fundApprovedByUserId: String(row.fundApprovedBy ?? "").trim(),
    fundApprovedAtIso: row.fundApprovedAt
      ? new Date(row.fundApprovedAt).toISOString()
      : "",
    fundApprovedCommitmentSnapshot: String(
      row.fundApprovedCommitmentSnapshot ?? "",
    ).trim(),
    committed: formatCommitted(
      row.commitmentAmount,
      row.extraContributionAmounts as string[] | null,
    ),
    signedDate: formatSignedDate(
      row.docSignedDate,
      row.esignStatusJson,
      row.profileId,
    ),
    esignStatus: parseEsignStatusJson(
      row.esignStatusJson,
      esignCategoryFromCommitmentProfileId(row.profileId),
    ),
    esignStatusBundleJson: row.esignStatusJson?.trim() || null,
    fundedDate: "—",
    selfAccredited: "—",
    verifiedAccLabel: "Not Started",
    /** Raw fields for edit-investment form */
    contactId: row.contactId ?? "",
    profileId: row.profileId ?? "",
    userInvestorProfileId: String(row.userInvestorProfileId ?? "").trim(),
    offeringId: row.offeringId ?? "",
    commitmentAmountRaw: row.commitmentAmount ?? "",
    extraContributionAmounts: extras,
    docSignedDateIso: row.docSignedDate?.trim() ?? "",
    investedAtIso: row.createdAt
      ? new Date(row.createdAt).toISOString()
      : "",
    invitationMailSent,
  };
}

function rosterContactKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

const PLACEHOLDER_CONTACT_KEY = rosterContactKey(
  DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
);

/**
 * Total committed per contact for a deal, summed across every `deal_investment` row
 * for that deal + contact (multiple rows additive; matches cumulative storage per row).
 */
export function totalCommittedByContactKeyFromRows(
  rows: DealInvestmentRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of rows) {
    const k = rosterContactKey(inv.contactId);
    if (!k || k === PLACEHOLDER_CONTACT_KEY) continue;
    const n = rowCommittedNumeric(inv);
    m.set(k, (m.get(k) ?? 0) + n);
  }
  return m;
}

/** Replace primary + extras with one stored total (avoids double-count when summing rows). */
export function applyTotalCommittedToDealInvestmentRow(
  row: DealInvestmentRow,
  totalByContact: Map<string, number>,
): DealInvestmentRow {
  const k = rosterContactKey(row.contactId);
  if (!k) return row;
  const t = totalByContact.get(k);
  if (t === undefined) return row;
  const rounded = Math.round(t * 100) / 100;
  return {
    ...row,
    commitmentAmount: String(rounded),
    extraContributionAmounts: [],
  };
}

function normalizeEmailForCanonical(
  email: string | null | undefined,
): string | null {
  const t = String(email ?? "").trim().toLowerCase();
  if (!t || !t.includes("@")) return null;
  return t;
}

/**
 * Maps each roster `contact_id` / `contact_member_id` string to a stable key so that
 * the same person represented by both `users.id` and `contact.id` shares one bucket
 * for commitment totals (email match).
 */
export async function mapContactIdsToCanonicalCommitmentKeys(
  rawIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = new Set<string>();
  for (const x of rawIds) {
    const t = String(x ?? "").trim();
    if (t) unique.add(t);
  }
  if (unique.size === 0) return out;

  const cleaned = [...unique];
  const uuids = cleaned.filter((id) => looksLikeUuid(id));

  const idToEmail = new Map<string, string>();
  if (uuids.length > 0) {
    const [userRows, contactRows] = await Promise.all([
      db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, uuids)),
      db
        .select({ id: contact.id, email: contact.email })
        .from(contact)
        .where(inArray(contact.id, uuids)),
    ]);
    for (const u of userRows) {
      const em = normalizeEmailForCanonical(u.email);
      if (em) idToEmail.set(String(u.id).toLowerCase(), em);
    }
    for (const c of contactRows) {
      const em = normalizeEmailForCanonical(c.email);
      if (em) idToEmail.set(String(c.id).toLowerCase(), em);
    }
  }

  for (const raw of cleaned) {
    const rk = rosterContactKey(raw);
    const em = looksLikeUuid(raw) ? idToEmail.get(rk) : undefined;
    out.set(rk, em ? `em:${em}` : `id:${rk}`);
  }
  return out;
}

/**
 * Like `totalCommittedByContactKeyFromRows`, but sums by canonical investor key
 * (see `mapContactIdsToCanonicalCommitmentKeys`).
 */
export function totalCommittedByCanonicalKeyFromRows(
  rows: DealInvestmentRow[],
  rawToCanonical: Map<string, string>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of rows) {
    const k = rosterContactKey(inv.contactId);
    if (!k || k === PLACEHOLDER_CONTACT_KEY) continue;
    const ck = rawToCanonical.get(k) ?? `id:${k}`;
    const n = rowCommittedNumeric(inv);
    m.set(ck, (m.get(ck) ?? 0) + n);
  }
  return m;
}

export function groupDealInvestmentsByCanonicalKey(
  rows: DealInvestmentRow[],
  rawToCanonical: Map<string, string>,
): Map<string, DealInvestmentRow[]> {
  const m = new Map<string, DealInvestmentRow[]>();
  for (const inv of rows) {
    const k = rosterContactKey(inv.contactId);
    if (!k || k === PLACEHOLDER_CONTACT_KEY) continue;
    const ck = rawToCanonical.get(k) ?? `id:${k}`;
    const arr = m.get(ck) ?? [];
    arr.push(inv);
    m.set(ck, arr);
  }
  return m;
}

/** Sets primary commitment to the total for this canonical key; clears extras. */
export function applyTotalCommittedToDealInvestmentRowForCanonical(
  row: DealInvestmentRow,
  totalByCanonical: Map<string, number>,
  canonicalKey: string,
): DealInvestmentRow {
  const t = totalByCanonical.get(canonicalKey) ?? 0;
  const rounded = Math.round(t * 100) / 100;
  return {
    ...row,
    commitmentAmount: String(rounded),
    extraContributionAmounts: [],
  };
}

function isPortalParticipantStoredRole(raw: string | null | undefined): boolean {
  const t = String(raw ?? "").trim().toLowerCase();
  return t === "deal_participant" || t === "deal participant";
}

/**
 * Loads `deal_member.deal_member_role` per contact for this deal (roster is source of truth
 * for sponsor / deal-team labels; `deal_investment.investor_role` may still carry portal role).
 */
async function loadDealMemberRolesByContactForDeal(
  dealId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      contactMemberId: dealMember.contactMemberId,
      dealMemberRole: dealMember.dealMemberRole,
    })
    .from(dealMember)
    .where(eq(dealMember.dealId, dealId));
  const map = new Map<string, string>();
  for (const r of rows) {
    const k = rosterContactKey(r.contactMemberId);
    if (!k) continue;
    const role = String(r.dealMemberRole ?? "").trim();
    if (!role) continue;
    map.set(k, role);
  }
  return map;
}

async function loadLpRosterContactKeysForDeal(dealId: string): Promise<Set<string>> {
  const rows = await db
    .select({ contactMemberId: dealLpInvestor.contactMemberId })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, dealId));
  const set = new Set<string>();
  for (const r of rows) {
    const k = rosterContactKey(r.contactMemberId);
    if (k) set.add(k);
  }
  return set;
}

/**
 * Replaces stored portal role `deal_participant` on investment rows with the deal roster role
 * from `deal_member`, or `lp_investors` when the contact is on the LP roster.
 */
export async function enrichInvestorRolesForDealRows(
  dealId: string,
  rows: DealInvestmentRow[],
): Promise<DealInvestmentRow[]> {
  if (rows.length === 0) return rows;
  const [memberRoleByContact, lpContactKeys] = await Promise.all([
    loadDealMemberRolesByContactForDeal(dealId),
    loadLpRosterContactKeysForDeal(dealId),
  ]);
  return rows.map((row) => {
    if (!isPortalParticipantStoredRole(row.investor_role)) return row;
    const k = rosterContactKey(row.contactId);
    if (!k) return row;
    const roster = memberRoleByContact.get(k)?.trim();
    if (roster) return { ...row, investor_role: roster };
    if (lpContactKeys.has(k)) {
      return { ...row, investor_role: LP_INVESTOR_ROLE_STORED };
    }
    return row;
  });
}

/**
 * One **API** investor line per `deal_investment` row. This does not merge or replace
 * rows by contact—each DB row (including a second commitment with a different
 * `user_investor_profile_id`) is mapped separately. Use {@link insertDealInvestment}
 * when a new book profile should add a row instead of updating the existing one.
 */
export async function mapDealInvestmentsToInvestorApi(
  rows: DealInvestmentRow[],
): Promise<ReturnType<typeof mapRowToInvestorApi>[]> {
  const dealId = rows[0]?.dealId;
  const enriched =
    dealId && rows.length > 0
      ? await enrichInvestorRolesForDealRows(dealId, rows)
      : rows;
  const resolved = await resolveUsersByContactIds(enriched);
  const profileNames = await resolveUserInvestorProfileNamesByIds(
    enriched.map((r) => String(r.userInvestorProfileId ?? "")),
  );
  if (!dealId || enriched.length === 0) {
    return enriched.map((r) =>
      withUserInvestorProfileName(mapRowToInvestorApi(r, resolved, {}), profileNames),
    );
  }
  const emptyLpSet = new Set<string>();
  const flags = await loadInvitationMailSentFlags(dealId, enriched, emptyLpSet);
  const approverIds = [
    ...new Set(
      enriched
        .map((r) => String(r.fundApprovedBy ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const approverNames = await resolveUserDisplayNamesByIds(approverIds);
  return enriched.map((r, i) => {
    const base = withUserInvestorProfileName(
      mapRowToInvestorApi(r, resolved, {
        invitationMailSent: flags[i] === true,
      }),
      profileNames,
    );
    const approverId = String(r.fundApprovedBy ?? "").trim().toLowerCase();
    const approverDisplay =
      approverId && approverNames.has(approverId)
        ? approverNames.get(approverId)
        : undefined;
    return approverDisplay
      ? { ...base, fundApprovedByDisplayName: approverDisplay }
      : base;
  });
}


export type RosterAddedByMaps = {
  /** Normalized `contact_member_id` / `contact_id` → portal `users.id`. */
  byContactKey: Map<string, string>;
  /** `deal_lp_investor.id` → portal `users.id` (Investors tab rows keyed by LP roster id). */
  byLpRowId: Map<string, string>;
};

/**
 * LP roster `added_by` wins over `deal_member` for the same contact (Investors tab source of truth).
 */
export async function loadRosterAddedByMaps(
  dealId: string,
): Promise<RosterAddedByMaps> {
  const [memberRows, lpRoster] = await Promise.all([
    db
      .select({
        contactMemberId: dealMember.contactMemberId,
        addedBy: dealMember.addedBy,
      })
      .from(dealMember)
      .where(eq(dealMember.dealId, dealId)),
    db
      .select({
        id: dealLpInvestor.id,
        contactMemberId: dealLpInvestor.contactMemberId,
        addedBy: dealLpInvestor.addedBy,
      })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, dealId)),
  ]);
  const byContactKey = new Map<string, string>();
  const byLpRowId = new Map<string, string>();
  for (const m of memberRows) {
    const k = rosterContactKey(m.contactMemberId);
    if (!k || !m.addedBy) continue;
    if (!byContactKey.has(k)) byContactKey.set(k, String(m.addedBy));
  }
  for (const m of lpRoster) {
    const k = rosterContactKey(m.contactMemberId);
    if (k && m.addedBy) byContactKey.set(k, String(m.addedBy));
    const rowId = String(m.id ?? "").trim().toLowerCase();
    if (rowId && m.addedBy) byLpRowId.set(rowId, String(m.addedBy));
  }
  return { byContactKey, byLpRowId };
}



/**
 * LP roster `added_by` first, then `deal_member` rows (roster wins for same contact).
 * Keys are normalized `contact_id` strings; values are portal user ids (`users.id`).
 */
export async function loadRosterAddedByUserIdByContactKey(
  dealId: string,
): Promise<Map<string, string>> {

   const maps = await loadRosterAddedByMaps(dealId);
  return maps.byContactKey;

  // const [memberRows, lpRoster] = await Promise.all([
  //   db
  //     .select({
  //       contactMemberId: dealMember.contactMemberId,
  //       addedBy: dealMember.addedBy,
  //     })
  //     .from(dealMember)
  //     .where(eq(dealMember.dealId, dealId)),
  //   db
  //     .select({
  //       contactMemberId: dealLpInvestor.contactMemberId,
  //       addedBy: dealLpInvestor.addedBy,
  //     })
  //     .from(dealLpInvestor)
  //     .where(eq(dealLpInvestor.dealId, dealId)),
  // ]);
  // const addedByUserIdByContact = new Map<string, string>();
  // for (const m of lpRoster) {
  //   const k = rosterContactKey(m.contactMemberId);
  //   if (!k || !m.addedBy) continue;
  //   if (!addedByUserIdByContact.has(k))
  //     addedByUserIdByContact.set(k, String(m.addedBy));
  // }
  // for (const m of memberRows) {
  //   const k = rosterContactKey(m.contactMemberId);
  //   if (!k || !m.addedBy) continue;
  //   addedByUserIdByContact.set(k, String(m.addedBy));
  // }
  // return addedByUserIdByContact;
}

/**
 * Maps `contact_member_id` / roster `contact_id` to portal `users.id` (lowercase).
 * Direct `users.id` maps to itself; CRM `contact.id` maps via email match to a user when present.
 */
async function resolvePortalUserIdLowerByContactMemberIds(
  rawIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniqueRaw = [
    ...new Set(rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)),
  ];
  if (uniqueRaw.length === 0) return out;

  const uuids = uniqueRaw.filter((id) => looksLikeUuid(id));
  if (uuids.length === 0) return out;

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, uuids));
  const userIdLower = new Set(userRows.map((u) => String(u.id).toLowerCase()));
  for (const raw of uniqueRaw) {
    if (!looksLikeUuid(raw)) continue;
    const k = rosterContactKey(raw);
    if (userIdLower.has(k)) out.set(k, k);
  }

  const missingUuid = uuids.filter((id) => !out.has(rosterContactKey(id)));
  if (missingUuid.length === 0) return out;

  const contactRows = await db
    .select({ id: contact.id, email: contact.email })
    .from(contact)
    .where(inArray(contact.id, missingUuid));

  const emails = [
    ...new Set(
      contactRows
        .map((c) => String(c.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
  const emailToUserLower = new Map<string, string>();
  for (const em of emails) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${em}`)
      .limit(1);
    if (u) emailToUserLower.set(em, String(u.id).toLowerCase());
  }
  for (const c of contactRows) {
    const k = rosterContactKey(c.id);
    const em = String(c.email ?? "").trim().toLowerCase();
    if (em && emailToUserLower.has(em)) out.set(k, emailToUserLower.get(em)!);
  }
  return out;
}

/**
 * Deal Members “Investors added”: sum of Investors-tab Committed for investors on
 * this deal whose Sponsor name (`added_by`) is that member.
 *
 * Amount per investor (no double-count):
 * - `deal_investment` sum when any investment rows exist for that contact
 * - else `deal_lp_investor.committed_amount`
 *
 * Own commitment excluded (member contact id / portal user id only).
 * Equivalent portal accounts (same email / scrubbed same-name) are included when
 * matching `added_by`, including name+org resolution when contact email differs
 * from the portal login email.
 */
export async function sumCommittedFromInvestorsAddedByMemberContacts(
  dealId: string,
  memberContactKeys: ReadonlySet<string>,
): Promise<Map<string, number>> {
  if (memberContactKeys.size === 0) return new Map();

  const memberKeysArr = [
    ...new Set(
      [...memberContactKeys]
        .map((k) => String(k ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const did = String(dealId ?? "").trim();
  if (!did) return new Map(memberKeysArr.map((k) => [k, 0]));

  const portalUserByMemberKey =
    await resolvePortalUserIdLowerByContactMemberIds(memberKeysArr);

  const rosterSeedRes = await pool.query<{ ck: string; uid: string }>(
    `SELECT lower(trim(dm.contact_member_id)) AS ck, lower(u.id::text) AS uid
     FROM deal_member dm
     INNER JOIN users u ON (
       trim(dm.contact_member_id) = u.id::text
       OR EXISTS (
         SELECT 1 FROM contact c
         WHERE c.id::text = trim(both from dm.contact_member_id)
           AND lower(trim(c.email)) = lower(trim(u.email))
         )
     )
     WHERE dm.deal_id = $1::uuid
       AND lower(trim(dm.contact_member_id)) = ANY($2::text[])`,
    [did, memberKeysArr],
  );
  for (const row of rosterSeedRes.rows) {
    const ck = String(row.ck ?? "").trim();
    const uid = String(row.uid ?? "").trim();
    if (!ck || !uid) continue;
    portalUserByMemberKey.set(ck, uid);
  }

  /**
   * Fallback when roster join missed: CRM contact → portal user by email, else
   * same org + name (scrubbed accounts), preferring users who appear as
   * `added_by` on this deal so every sponsor/co-sponsor maps correctly.
   */
  for (const mk of memberKeysArr) {
    if (portalUserByMemberKey.has(mk)) continue;
    const [cRow] = await db
      .select({
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        organizationId: contact.organizationId,
      })
      .from(contact)
      .where(sql`${contact.id}::text = ${mk}`)
      .limit(1);
    if (!cRow) continue;

    const em = String(cRow.email ?? "")
      .trim()
      .toLowerCase();
    if (em.includes("@")) {
      const [uRow] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(trim(${users.email})) = ${em}`)
        .limit(1);
      if (uRow?.id) {
        portalUserByMemberKey.set(mk, String(uRow.id).toLowerCase());
        continue;
      }
    }

    const fn = String(cRow.firstName ?? "").trim();
    const ln = String(cRow.lastName ?? "").trim();
    if (!fn || !ln) continue;
    const orgId = cRow.organizationId
      ? String(cRow.organizationId).trim()
      : "";
    const nameRes = await pool.query<{ uid: string }>(
      `SELECT lower(u.id::text) AS uid
       FROM users u
       WHERE lower(trim(coalesce(u.first_name, ''))) = lower(trim($1))
         AND lower(trim(coalesce(u.last_name, ''))) = lower(trim($2))
         AND (
           $3::text = ''
           OR u.organization_id IS NULL
           OR u.organization_id::text = $3
         )
       ORDER BY
         CASE
           WHEN EXISTS (
             SELECT 1 FROM deal_lp_investor lp
             WHERE lp.deal_id = $4::uuid AND lp.added_by = u.id
           ) THEN 0
           ELSE 1
         END,
         CASE
           WHEN lower(trim(coalesce(u.email, ''))) LIKE 'redacted%'
             OR position('@' in lower(trim(coalesce(u.email, '')))) < 1
           THEN 0
           ELSE 1
         END,
         u.created_at ASC NULLS LAST
       LIMIT 1`,
      [fn, ln, orgId, did],
    );
    const nameUid = String(nameRes.rows[0]?.uid ?? "").trim();
    if (nameUid) portalUserByMemberKey.set(mk, nameUid);
  }

  const equivIdsByMemberKey = new Map<string, string[]>();
  await Promise.all(
    memberKeysArr.map(async (mk) => {
      const seed = portalUserByMemberKey.get(mk);
      if (!seed) {
        equivIdsByMemberKey.set(mk, []);
        return;
      }
      const equiv = await listEquivalentPortalUserIdsForUser(seed);
      const ids = [
        ...new Set(
          (equiv.length > 0 ? equiv : [seed])
            .map((id) => String(id).trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      equivIdsByMemberKey.set(mk, ids);
    }),
  );

  const allSponsorIds = [
    ...new Set([...equivIdsByMemberKey.values()].flat().filter(Boolean)),
  ];

  /**
   * Per sponsor user id: sum of investor commitments they own on this deal.
   * Own seats (member contact / that sponsor's user id as contact key) excluded.
   */
  const sumBySponsorUserId = new Map<string, number>();
  if (allSponsorIds.length > 0) {
    const res = await pool.query<{
      adder: string;
      amount: string;
      contact_key: string;
    }>(
      `WITH inv_totals AS (
         SELECT
           lower(trim(di.contact_id)) AS ck,
           sum(
             coalesce(
               nullif(regexp_replace(coalesce(di.commitment_amount, ''), '[^0-9.-]', '', 'g'), ''),
               '0'
             )::double precision
             + coalesce(
               (
                 SELECT sum(
                   coalesce(
                     nullif(
                       regexp_replace(elem #>> '{}', '[^0-9.-]', '', 'g'),
                       ''
                     ),
                     '0'
                   )::double precision
                 )
                 FROM jsonb_array_elements(
                   coalesce(di.extra_contribution_amounts, '[]'::jsonb)
                 ) AS elem
               ),
               0
             )
           ) AS inv_sum
         FROM deal_investment di
         WHERE di.deal_id = $1::uuid
           AND trim(coalesce(di.contact_id, '')) <> ''
           AND trim(di.contact_id) <> '__portal_investment_autosave__'
         GROUP BY 1
       ),
       lp_rows AS (
         SELECT
           lower(trim(lp.contact_member_id)) AS ck,
           lower(lp.added_by::text) AS adder,
           coalesce(
             nullif(regexp_replace(coalesce(lp.committed_amount, ''), '[^0-9.-]', '', 'g'), ''),
             '0'
           )::double precision AS lp_amt
         FROM deal_lp_investor lp
         WHERE lp.deal_id = $1::uuid
           AND lp.added_by IS NOT NULL
           AND lower(lp.added_by::text) = ANY($2::text[])
       ),
       priced AS (
         SELECT
           lr.adder,
           lr.ck AS contact_key,
           CASE
             WHEN it.ck IS NOT NULL THEN coalesce(it.inv_sum, 0)
             ELSE lr.lp_amt
           END AS amount
         FROM lp_rows lr
         LEFT JOIN inv_totals it ON it.ck = lr.ck
       )
       SELECT adder, contact_key, amount::text AS amount
       FROM priced
       WHERE amount <> 0`,
      [did, allSponsorIds],
    );

    for (const row of res.rows) {
      const adder = String(row.adder ?? "")
        .trim()
        .toLowerCase();
      const ck = String(row.contact_key ?? "")
        .trim()
        .toLowerCase();
      const amount = parseFloat(String(row.amount ?? ""));
      if (!adder || !Number.isFinite(amount) || amount === 0) continue;

      // Exclude the sponsor's own seat only (member contact / portal seed user id).
      let isOwn = false;
      for (const [mk, equivIds] of equivIdsByMemberKey) {
        if (!equivIds.includes(adder)) continue;
        const seed = portalUserByMemberKey.get(mk) ?? "";
        if (ck === mk || (seed && ck === seed)) {
          isOwn = true;
          break;
        }
      }
      if (isOwn) continue;

      sumBySponsorUserId.set(
        adder,
        (sumBySponsorUserId.get(adder) ?? 0) + amount,
      );
    }

    // Investment-only investors (no LP row) still attributed via roster added_by map.
    const addedByByContact = await loadRosterAddedByUserIdByContactKey(dealId);
    const invOnly = await pool.query<{
      ck: string;
      amount: string;
    }>(
      `SELECT
         lower(trim(di.contact_id)) AS ck,
         sum(
           coalesce(
             nullif(regexp_replace(coalesce(di.commitment_amount, ''), '[^0-9.-]', '', 'g'), ''),
             '0'
           )::double precision
           + coalesce(
             (
               SELECT sum(
                 coalesce(
                   nullif(
                     regexp_replace(elem #>> '{}', '[^0-9.-]', '', 'g'),
                     ''
                   ),
                   '0'
                 )::double precision
               )
               FROM jsonb_array_elements(
                 coalesce(di.extra_contribution_amounts, '[]'::jsonb)
               ) AS elem
             ),
             0
           )
         )::text AS amount
       FROM deal_investment di
       WHERE di.deal_id = $1::uuid
         AND trim(coalesce(di.contact_id, '')) <> ''
         AND trim(di.contact_id) <> '__portal_investment_autosave__'
         AND NOT EXISTS (
           SELECT 1 FROM deal_lp_investor lp
           WHERE lp.deal_id = di.deal_id
             AND lower(trim(lp.contact_member_id)) = lower(trim(di.contact_id))
         )
       GROUP BY 1`,
      [did],
    );
    for (const row of invOnly.rows) {
      const ck = String(row.ck ?? "")
        .trim()
        .toLowerCase();
      const amount = parseFloat(String(row.amount ?? ""));
      if (!ck || !Number.isFinite(amount) || amount === 0) continue;
      const adderRaw = addedByByContact.get(ck);
      if (!adderRaw) continue;
      const adder = String(adderRaw).trim().toLowerCase();
      if (!allSponsorIds.includes(adder)) continue;
      let isOwn = false;
      for (const [mk, equivIds] of equivIdsByMemberKey) {
        if (!equivIds.includes(adder)) continue;
        const seed = portalUserByMemberKey.get(mk) ?? "";
        if (ck === mk || (seed && ck === seed)) {
          isOwn = true;
          break;
        }
      }
      if (isOwn) continue;
      sumBySponsorUserId.set(
        adder,
        (sumBySponsorUserId.get(adder) ?? 0) + amount,
      );
    }
  }

  const out = new Map<string, number>();
  for (const mk of memberKeysArr) {
    const equivIds = equivIdsByMemberKey.get(mk) ?? [];
    let total = 0;
    for (const uid of equivIds) {
      total += sumBySponsorUserId.get(uid) ?? 0;
    }
    out.set(mk, total);
  }
  return out;
}

export function formatCommittedUsdWhole(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Match investment `contact_id` to roster `added_by` when raw ids differ but the
 * person is the same (e.g. portal `users.id` on `deal_investment` vs `contact.id`
 * on `deal_member` / `deal_lp_investor`) using the same canonical keys as commitment totals.
 */
function resolveRosterAddedByUserId(
  contactIdRaw: string | undefined,
  rosterAddedByByContactKey: Map<string, string>,
  rawToCanonical: Map<string, string>,
): string | undefined {
  const k = rosterContactKey(contactIdRaw);
  if (!k) return undefined;
  const direct = rosterAddedByByContactKey.get(k);
  if (direct) return direct;
  const targetCanon =
    rawToCanonical.get(k) ?? `id:${k}`;
  for (const [rosterK, uid] of rosterAddedByByContactKey) {
    const rosterCanon =
      rawToCanonical.get(rosterK) ?? `id:${rosterK}`;
    if (rosterCanon === targetCanon) return uid;
  }
  return undefined;
}

export function resolveInvestorRowAddedByUserId(
  row: { id?: string; contactId?: string },
  rosterAddedByByContactKey: Map<string, string>,
  rosterAddedByLpRowId: Map<string, string>,
  rawToCanonical: Map<string, string>,
): string | undefined {
  const fromContact = resolveRosterAddedByUserId(
    row.contactId,
    rosterAddedByByContactKey,
    rawToCanonical,
  );
  if (fromContact) return fromContact;
  const rowId = String(row.id ?? "").trim().toLowerCase();
  if (!rowId) return undefined;
  return rosterAddedByLpRowId.get(rowId);
}

function isLeadSponsorRoleLabel(role: string | null | undefined): boolean {
  const t = String(role ?? "").trim().toLowerCase();
  return t === "lead sponsor" || t === "lead_sponsor";
}

/**
 * When an investor has no `deal_lp_investor` / `deal_member.added_by` (legacy
 * investment-only rows), fall back to the deal’s Lead Sponsor for the
 * Investors tab “Sponsor name” column.
 */
async function resolveDealLeadSponsorFallback(dealId: string): Promise<{
  userId?: string;
  displayName?: string;
  email?: string;
}> {
  const d = String(dealId ?? "").trim();
  if (!d) return {};

  const memberRows = await db
    .select({
      contactMemberId: dealMember.contactMemberId,
      dealMemberRole: dealMember.dealMemberRole,
    })
    .from(dealMember)
    .where(eq(dealMember.dealId, d));

  const lead = memberRows.find((m) =>
    isLeadSponsorRoleLabel(m.dealMemberRole),
  );
  if (lead) {
    const cid = String(lead.contactMemberId ?? "").trim();
    if (cid && looksLikeUuid(cid)) {
      const [names, emails] = await Promise.all([
        resolveUserDisplayNamesByIds([cid]),
        resolveUserEmailsByIds([cid]),
      ]);
      const display = names.get(cid.toLowerCase());
      const email = emails.get(cid.toLowerCase());
      if (display || email)
        return {
          userId: cid,
          ...(display ? { displayName: display } : {}),
          ...(email ? { email } : {}),
        };
    }
  }

  const investments = await db
    .select({
      contactId: dealInvestment.contactId,
      investor_role: dealInvestment.investor_role,
    })
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, d));

  const leadInv = investments.find((inv) =>
    isLeadSponsorRoleLabel(inv.investor_role),
  );
  if (!leadInv) return {};
  const cid = String(leadInv.contactId ?? "").trim();
  if (!cid || !looksLikeUuid(cid)) return {};
  const [names, emails] = await Promise.all([
    resolveUserDisplayNamesByIds([cid]),
    resolveUserEmailsByIds([cid]),
  ]);
  const display = names.get(cid.toLowerCase());
  const email = emails.get(cid.toLowerCase());
  if (!display && !email) return {};
  return {
    userId: cid,
    ...(display ? { displayName: display } : {}),
    ...(email ? { email } : {}),
  };
}

const INVESTOR_EMAIL_REDACTED = "Email unavailable";

/**
 * Lead / admin sponsors see the full investor roster but must not see email for
 * any row added by a co-sponsor on this deal (regardless of intercept).
 */
export async function redactCoSponsorAddedInvestorEmailsForLeadAdminViewer<
  T extends {
    userEmail?: string;
    addedByIsCoSponsorOnDeal?: boolean;
    addedByCoSponsorEmailIntercept?: string;
  },
>(dealId: string, viewerUserId: string, rows: T[]): Promise<T[]> {
  const viewer = String(viewerUserId ?? "").trim();
  if (!viewer || rows.length === 0) return rows;
  if (!(await isPortalUserLeadOrAdminSponsorOnDeal(dealId, viewer))) return rows;
  return rows.map((row) => {
    if (row.addedByIsCoSponsorOnDeal !== true) return row;
    return { ...row, userEmail: INVESTOR_EMAIL_REDACTED };
  });
}

/**
 * Co-sponsors see investors whose **Sponsor name** relationship on this deal
 * points at them (`deal_lp_investor.added_by` / `deal_member.added_by` — the same
 * field shown as Sponsor name), including equivalent portal accounts.
 *
 * Visibility follows Investor → Sponsor/Co-sponsor association, not a shared
 * pool of every co-sponsor on the deal and not contact `created_by` alone.
 */
export async function filterInvestorRowsVisibleToCoSponsor(
  dealId: string,
  viewerUserId: string,
  rows: DealInvestmentRow[],
): Promise<DealInvestmentRow[]> {
  const viewer = String(viewerUserId).trim();
  if (!viewer || rows.length === 0) return [];
  const equivalentIds = await listEquivalentPortalUserIdsForUser(viewer);
  const sponsorSet = new Set(
    (equivalentIds.length > 0 ? equivalentIds : [viewer])
      .map((id) => id.toLowerCase())
      .filter(Boolean),
  );
  if (sponsorSet.size === 0) return [];
  const { byContactKey, byLpRowId } = await loadRosterAddedByMaps(dealId);
  const contactIds = rows
    .map((r) => String(r.contactId ?? "").trim())
    .filter(Boolean);
  const rawToCanonical = await mapContactIdsToCanonicalCommitmentKeys([
    ...byContactKey.keys(),
    ...contactIds,
  ]);
  return rows.filter((row) => {
    const sponsorUserId = resolveInvestorRowAddedByUserId(
      row,
      byContactKey,
      byLpRowId,
      rawToCanonical,
    );
    return sponsorUserId
      ? sponsorSet.has(String(sponsorUserId).toLowerCase())
      : false;
  });
}

/**
 * Adds Sponsor name fields from the Investor → Sponsor/Co-sponsor relationship
 * (`deal_lp_investor.added_by` wins, then `deal_member.added_by`).
 * Uses LP roster row id when contact ids differ so LP-only rows still resolve.
 *
 * Equivalent portal accounts of co-sponsor sponsors are marked
 * `addedByIsCoSponsorOnDeal` for lead/admin email redaction.
 */
export async function enrichInvestorApiRowsWithAddedBy<
  T extends { id?: string; contactId?: string; addedByDisplayName?: string },
>(
  dealId: string,
  rows: T[],
  viewerUserId?: string | null,
): Promise<
  Array<
    T & {
      addedByUserId?: string;
      addedByEmail?: string;
      addedByIsSponsorOnDeal?: boolean;
      addedByIsCoSponsorOnDeal?: boolean;
      addedByCoSponsorEmailIntercept?: string;
    }
  >
> {
  if (rows.length === 0)
    return rows as Array<
      T & {
        addedByUserId?: string;
        addedByEmail?: string;
        addedByIsSponsorOnDeal?: boolean;
        addedByIsCoSponsorOnDeal?: boolean;
        addedByCoSponsorEmailIntercept?: string;
      }
    >;
  const { byContactKey: rosterAddedByByContactKey, byLpRowId } =
    await loadRosterAddedByMaps(dealId);
  const idSet = new Set<string>();
  for (const rk of rosterAddedByByContactKey.keys()) {
    if (rk) idSet.add(rk);
  }
  for (const row of rows) {
    const c = String(row.contactId ?? "").trim();
    if (c) idSet.add(c);
  }
  const rawToCanonical = await mapContactIdsToCanonicalCommitmentKeys([
    ...idSet,
  ]);
  const uidsNeeded = new Set<string>();
  const uniqueAdderIds = new Map<string, string>();
  for (const row of rows) {
    const uid = resolveInvestorRowAddedByUserId(
      row,
      rosterAddedByByContactKey,
      byLpRowId,
      rawToCanonical,
    );
    if (uid) {
      const low = String(uid).toLowerCase();
      uidsNeeded.add(low);
      if (!uniqueAdderIds.has(low)) uniqueAdderIds.set(low, String(uid).trim());
    }
  }
  void viewerUserId;
  const [names, emails] = await Promise.all([
    resolveUserDisplayNamesByIds([...uidsNeeded]),
    resolveUserEmailsByIds([...uidsNeeded]),
  ]);
  const sponsorByAdderLower = new Map<string, boolean>();
  const coSponsorByAdderLower = new Map<string, boolean>();
  const interceptByAdderLower =
    await loadCoSponsorEmailInterceptByUserLower(dealId);
  await Promise.all(
    [...uniqueAdderIds.values()].map(async (id) => {
      const low = String(id).toLowerCase();
      const [isS, isCo] = await Promise.all([
        isPortalUserSponsorOnDeal(dealId, id),
        isPortalUserCoSponsorOnDeal(dealId, id),
      ]);
      sponsorByAdderLower.set(low, isS);
      // Adder may be a scrubbed duplicate of the roster co-sponsor — treat as co-sponsor
      // when any equivalent account is co-sponsor on this deal.
      let isCoEffective = isCo;
      if (!isCoEffective) {
        const adderEquiv = await listEquivalentPortalUserIdsForUser(id);
        for (const eqId of adderEquiv) {
          if (eqId === id) continue;
          if (await isPortalUserCoSponsorOnDeal(dealId, eqId)) {
            isCoEffective = true;
            break;
          }
        }
      }
      coSponsorByAdderLower.set(low, isCoEffective);
    }),
  );

  const needsLeadFallback = rows.some((row) => {
    const uid = resolveInvestorRowAddedByUserId(
      row,
      rosterAddedByByContactKey,
      byLpRowId,
      rawToCanonical,
    );
    return !uid;
  });
  const leadFallback = needsLeadFallback
    ? await resolveDealLeadSponsorFallback(dealId)
    : {};

  return rows.map((row) => {
    const uid = resolveInvestorRowAddedByUserId(
      row,
      rosterAddedByByContactKey,
      byLpRowId,
      rawToCanonical,
    );
    const nk = uid ? String(uid).toLowerCase() : "";
    const rawName = nk && names.has(nk) ? names.get(nk)! : undefined;
    let display =
      rawName && String(rawName).trim() && String(rawName).trim() !== "—"
        ? String(rawName).trim()
        : undefined;
    let email =
      nk && emails.has(nk) ? String(emails.get(nk)!).trim() : undefined;
    if (email === "") email = undefined;
    let resolvedUid = uid;
    if (!display && leadFallback.displayName) {
      display = leadFallback.displayName;
      if (!resolvedUid && leadFallback.userId)
        resolvedUid = leadFallback.userId;
    }
    if (!email && leadFallback.email) {
      email = leadFallback.email;
      if (!resolvedUid && leadFallback.userId)
        resolvedUid = leadFallback.userId;
    }
    const patch: {
      addedByUserId?: string;
      addedByDisplayName?: string;
      addedByEmail?: string;
      addedByIsSponsorOnDeal?: boolean;
      addedByIsCoSponsorOnDeal?: boolean;
      addedByCoSponsorEmailIntercept?: string;
    } = {};
    if (resolvedUid) {
      const rnk = String(resolvedUid).toLowerCase();
      patch.addedByUserId = resolvedUid;
      patch.addedByIsSponsorOnDeal =
        sponsorByAdderLower.get(rnk) ??
        (leadFallback.userId &&
        rnk === String(leadFallback.userId).toLowerCase()
          ? true
          : false);
      patch.addedByIsCoSponsorOnDeal =
        coSponsorByAdderLower.get(rnk) ?? false;
      if (patch.addedByIsCoSponsorOnDeal) {
        patch.addedByCoSponsorEmailIntercept =
          interceptByAdderLower.get(rnk) ?? "yes";
      }
    }
    if (display) patch.addedByDisplayName = display;
    if (email) patch.addedByEmail = email;
    if (Object.keys(patch).length === 0)
      return row as T & {
        addedByUserId?: string;
        addedByEmail?: string;
        addedByIsSponsorOnDeal?: boolean;
        addedByIsCoSponsorOnDeal?: boolean;
        addedByCoSponsorEmailIntercept?: string;
      };
    return { ...row, ...patch } as T & {
      addedByUserId?: string;
      addedByEmail?: string;
      addedByIsSponsorOnDeal?: boolean;
      addedByIsCoSponsorOnDeal?: boolean;
      addedByCoSponsorEmailIntercept?: string;
    };
  });
}

export async function assertDealExists(dealId: string): Promise<boolean> {
  const rows = await db
    .select({ id: addDealForm.id })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  return rows.length > 0;
}

export async function listDealInvestmentsByDealId(
  dealId: string,
  options?: { lpInvestorsOnly?: boolean },
): Promise<DealInvestmentRow[]> {
  const whereExpr =
    options?.lpInvestorsOnly === true
      ? and(
          eq(dealInvestment.dealId, dealId),
          inArray(dealInvestment.investor_role, [...LP_INVESTOR_ROLE_MATCH]),
        )
      : eq(dealInvestment.dealId, dealId);
  return db
    .select()
    .from(dealInvestment)
    .where(whereExpr)
    .orderBy(desc(dealInvestment.createdAt));
}

/** Sum of parsed commitment amounts for all investments on a deal (deals list / dashboard enrichment). */
export async function sumCommittedAmountForDeal(dealId: string): Promise<number> {
  const rows = await listDealInvestmentsByDealId(dealId);
  let s = 0;
  for (const r of rows) s += rowCommittedNumeric(r);
  return s;
}

/**
 * Funded dollars per investor class (same basis as Investors “Total Funded” KPI).
 * Matches `deal_investment.investor_class` to class id or name (case-insensitive).
 */
export async function fundedAmountsByInvestorClassId(
  dealId: string,
  classes: ReadonlyArray<{ id: string; name: string }>,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (const c of classes) totals.set(c.id, 0);
  if (classes.length === 0) return totals;

  const norm = (s: string) => s.trim().toLowerCase();
  const idSet = new Set(classes.map((c) => c.id));
  const nameToId = new Map<string, string>();
  for (const c of classes) {
    const n = norm(c.name);
    if (n) nameToId.set(n, c.id);
  }

  const investments = await listDealInvestmentsByDealId(dealId);
  for (const inv of investments) {
    const raw = String(inv.investorClass ?? "").trim();
    if (!raw) continue;
    const classId = idSet.has(raw) ? raw : nameToId.get(norm(raw));
    if (!classId) continue;
    const amt = fundedNumericForInvestorKpiRow(inv);
    if (!Number.isFinite(amt) || amt === 0) continue;
    totals.set(classId, Math.round(((totals.get(classId) ?? 0) + amt) * 100) / 100);
  }
  return totals;
}

export interface DealMemoryUploadFile {
  buffer: Buffer;
  originalname: string;
}

function sanitizeStem(originalName: string): string {
  const base = path.basename(originalName || "file");
  const stem = path.basename(base, path.extname(base));
  const cleaned = stem
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned.length ? cleaned : "file";
}

function safeExt(originalName: string): string {
  const ext = path.extname(path.basename(originalName || "")).toLowerCase();
  if (!ext || !/^\.[a-z0-9]{1,12}$/.test(ext)) return "";
  return ext;
}

export async function saveSubscriptionDocument(params: {
  dealId: string;
  file: DealMemoryUploadFile;
}): Promise<string> {
  const dealFolder = await resolveDealStorageFolderName(params.dealId);
  const uploadRoot = path.join(
    getUploadsPhysicalRoot(),
    dealAssetsRelativePath(dealFolder, DEAL_INVESTMENTS_FOLDER),
  );
  await mkdir(uploadRoot, { recursive: true });
  const ts = Date.now();
  const name = `${sanitizeStem(params.file.originalname)}_${randomUUID()}_${ts}${safeExt(params.file.originalname)}`;
  const dest = path.join(uploadRoot, name);
  await writeFile(dest, params.file.buffer);
  return dealAssetsRelativePath(dealFolder, DEAL_INVESTMENTS_FOLDER, name);
}

export async function insertDealInvestment(params: {
  dealId: string;
  input: CreateDealInvestmentInput;
}): Promise<DealInvestmentRow> {
  const insertRow: DealInvestmentInsert = {
    dealId: params.dealId,
    offeringId: params.input.offeringId,
    contactId: params.input.contactId,
    contactDisplayName: params.input.contactDisplayName?.trim() ?? "",
    profileId: params.input.profileId,
    userInvestorProfileId: params.input.userInvestorProfileId?.trim() ?? null,
    investor_role: params.input.investor_role,
    fundApproved: params.input.fundApproved,
    fundApprovedBy: params.input.fundApproved
      ? params.input.fundApprovedBy?.trim() ?? null
      : null,
    fundApprovedAt: params.input.fundApproved
      ? params.input.fundApprovedAt ?? null
      : null,
    fundApprovedCommitmentSnapshot: params.input.fundApproved
      ? fundApprovedSnapshotStoredFromInput(params.input)
      : "",
    status: params.input.status,
    investorClass: params.input.investorClass,
    docSignedDate: params.input.docSignedDate ?? null,
    commitmentAmount: params.input.commitmentAmount,
    extraContributionAmounts: params.input.extraContributionAmounts ?? [],
    documentStoragePath: params.input.documentStoragePath ?? null,
    fundingMethod: String(params.input.fundingMethod ?? "").trim(),
  };
  const [row] = await db.insert(dealInvestment).values(insertRow).returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function getDealInvestmentById(
  dealId: string,
  investmentId: string,
): Promise<DealInvestmentRow | undefined> {
  const rows = await db
    .select()
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.dealId, dealId),
        eq(dealInvestment.id, investmentId),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Latest `deal_investment.commitment_amount` for `(deal_id, contact_id)` (newest `created_at`).
 * Returns `null` when no row exists or the stored amount is blank.
 */
export async function getLatestCommitmentAmountForDealContact(
  dealId: string,
  contactId: string,
): Promise<string | null> {
  const did = String(dealId ?? "").trim();
  const cid = String(contactId ?? "").trim();
  if (!did || !cid) return null;

  const [row] = await db
    .select({ commitmentAmount: dealInvestment.commitmentAmount })
    .from(dealInvestment)
    .where(
      and(eq(dealInvestment.dealId, did), eq(dealInvestment.contactId, cid)),
    )
    .orderBy(desc(dealInvestment.createdAt))
    .limit(1);

  if (!row) return null;
  const raw = row.commitmentAmount?.trim() ?? "";
  return raw === "" ? null : raw;
}

export async function updateDealInvestment(params: {
  dealId: string;
  investmentId: string;
  input: CreateDealInvestmentInput;
}): Promise<DealInvestmentRow | null> {
  const [row] = await db
    .update(dealInvestment)
    .set({
      offeringId: params.input.offeringId,
      contactId: params.input.contactId,
      contactDisplayName: params.input.contactDisplayName?.trim() ?? "",
      profileId: params.input.profileId,
      ...(params.input.userInvestorProfileId === undefined
        ? {}
        : {
            userInvestorProfileId: params.input.userInvestorProfileId?.trim() || null,
          }),
      investor_role: params.input.investor_role,
      fundApproved: params.input.fundApproved,
      fundApprovedBy: params.input.fundApproved
        ? params.input.fundApprovedBy?.trim() ?? null
        : null,
      fundApprovedAt: params.input.fundApproved
        ? params.input.fundApprovedAt ?? null
        : null,
      ...(params.input.fundApproved
        ? {
            fundApprovedCommitmentSnapshot:
              fundApprovedSnapshotStoredFromInput(params.input),
          }
        : {}),
      status: params.input.status,
      investorClass: params.input.investorClass,
      docSignedDate: params.input.docSignedDate ?? null,
      commitmentAmount: params.input.commitmentAmount,
      extraContributionAmounts: params.input.extraContributionAmounts ?? [],
      documentStoragePath: params.input.documentStoragePath ?? null,
    })
    .where(
      and(
        eq(dealInvestment.dealId, params.dealId),
        eq(dealInvestment.id, params.investmentId),
      ),
    )
    .returning();
  return row ?? null;
}

const DEAL_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Number of `deal_investment` rows per deal (same cardinality as
 * `GET /deals/:dealId/investors` when each investment maps to one list row).
 */
export async function countInvestmentsByDealIds(
  dealIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of dealIds) {
    map.set(id, 0);
  }
  const ids = [...new Set(dealIds.filter((id) => DEAL_ID_UUID_RE.test(id)))];
  if (ids.length === 0) return map;

  const res = await pool.query<{ deal_id: string; cnt: string }>(
    `SELECT deal_id::text, COUNT(*)::int AS cnt
     FROM deal_investment
     WHERE deal_id = ANY($1::uuid[])
     GROUP BY deal_id`,
    [ids],
  );
  for (const row of res.rows) {
    map.set(row.deal_id, Number(row.cnt));
  }
  return map;
}
