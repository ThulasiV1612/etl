import { eq } from "drizzle-orm";
import {
  isDealInDirectInvestingParticipationForUser,
  isDealInInvestingParticipantListForUser,
} from "../investing/lpInvestorAccess.service.js";
import { isDealStageDraft } from "../../constants/deal-lifecycle/deal-stage.js";
import {
  DEAL_PARTICIPANT,
  isCompanyAdminRole,
  isPlatformAdminRole,
  PLATFORM_USER,
} from "../../constants/roles.js";
import { db } from "../../database/db.js";
import type { AddDealFormRow } from "../../schema/deal.schema/add-deal-form.schema.js";
import { users } from "../../schema/schema.js";
import {
  assignCreatorToDeal,
  isUserAssignedToDeal,
  listDealIdsAssignedToUser,
} from "./assigningDealUser.service.js";
import {
  resolveActiveOrganizationIdForUser,
} from "../org/orgResolution.service.js";
import {
  getAddDealFormById,
  isAddDealFormInOrganizationScope,
  listAddDealFormsByIds,
  listAddDealFormsForViewer,
  type DealViewerScope,
} from "./dealForm.service.js";
import { isAddDealFormIncomplete } from "./dealFormCompleteness.service.js";
import {
  isPortalUserOnDealMemberRoster,
  listDealIdsFromDealMemberRosterForUser,
  listDealIdsWhereViewerIsCoSponsor,
  viewerHasNonCoSponsorDealMemberRole,
} from "./dealMemberScope.service.js";
import { assignCreatorAsLeadSponsorOnDeal } from "./dealMember.service.js";
import { listLpInvestorDealIdsForUserEmail, listInvestingParticipantDealIdsForUser } from "../investing/lpInvestorAccess.service.js";
import { isDealAllowedByContactOfferingVisibility } from "../contact/contactOfferingVisibility.service.js";
import { isInvestingPortalRequest } from "../../middleware/portalMode.middleware.js";

export type { DealViewerScope } from "./dealForm.service.js";

async function viewerEmailNormForScope(scope: DealViewerScope): Promise<string> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, scope.userId))
    .limit(1);
  return String(row?.email ?? "").trim().toLowerCase();
}

export async function resolveDealViewerScope(
  userId: string,
  jwtUserRole: string | undefined,
  requestedOrganizationId?: string | null,
): Promise<DealViewerScope> {
  const [row] = await db
    .select({
      organizationId: users.organizationId,
      role: users.role,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const preloaded = row
    ? {
        organizationId: row.organizationId,
        role: row.role,
      }
    : null;
  const organizationId = await resolveActiveOrganizationIdForUser(
    userId,
    requestedOrganizationId,
    preloaded,
  );
  const dbRole = String(row?.role ?? "").trim();
  const jwtRole = String(jwtUserRole ?? "").trim();
  const role = dbRole || jwtRole;
  const isPlatformAdmin = isPlatformAdminRole(role);
  const assignedParticipationOnly = role === DEAL_PARTICIPANT;
  const seesAllDeals =
    !assignedParticipationOnly &&
    (isPlatformAdmin || (role === PLATFORM_USER && organizationId == null));

  const emailNorm = String(row?.email ?? "").trim().toLowerCase();
  const [lpDealIds, coSponsorDealIdsEarly] = await Promise.all([
    listLpInvestorDealIdsForUserEmail(emailNorm),
    listDealIdsWhereViewerIsCoSponsor(userId),
  ]);
  /**
   * Co-sponsors keep syndication deal scope (co-sponsor / org roster). LP email
   * scope must not replace that list — Investing uses `includeParticipantDeals`
   * separately when they have an investor profile / LP rows.
   */
  const applyLpEmailScope =
    lpDealIds.length > 0 &&
    coSponsorDealIdsEarly.length === 0 &&
    !isPlatformAdminRole(role) &&
    !isCompanyAdminRole(role);

  let lpInvestorEmailScopedDealIds: string[] | null = null;
  if (applyLpEmailScope) {
    // Direct LP deals + sponsor-scoped offerings, already filtered by
    // contact.show_offerings_visibility (ALL / HIDE / 506C_ONLY).
    lpInvestorEmailScopedDealIds =
      await listInvestingParticipantDealIdsForUser({
        userId,
        emailNorm,
      });
  }

  let coSponsorDashboardDealIds: string[] | null = null;
  if (
    !applyLpEmailScope &&
    !assignedParticipationOnly &&
    !isPlatformAdmin &&
    !isCompanyAdminRole(role)
  ) {
    const hasOtherRosterRole = await viewerHasNonCoSponsorDealMemberRole(
      userId,
    );
    if (coSponsorDealIdsEarly.length > 0 && !hasOtherRosterRole) {
      coSponsorDashboardDealIds = coSponsorDealIdsEarly;
    }
  }

  /**
   * Contacts Visibility (Show / Hide / 506(c) only) applies in Investing Mode for
   * LP investors and for Lead, Admin, Co-sponsor, company member, and company admin.
   * Pure LP email scope always enforces it. Platform admins skip.
   */
  const enforceContactOfferingVisibility =
    !isPlatformAdmin &&
    (isInvestingPortalRequest() || lpInvestorEmailScopedDealIds != null);

  return {
    userId,
    organizationId,
    isPlatformAdmin,
    seesAllDeals,
    assignedParticipationOnly,
    lpInvestorEmailScopedDealIds,
    coSponsorDashboardDealIds,
    enforceContactOfferingVisibility,
  };
}

/** Syndication workspace (org, roster sponsor, platform admin) — not LP-only access. */
export async function viewerHasSyndicationDealWorkspaceAccess(
  deal: AddDealFormRow,
  scope: DealViewerScope,
): Promise<boolean> {
  const dealId = String(deal.id);
  if (scope.seesAllDeals) return true;
  if (await isPortalUserOnDealMemberRoster(dealId, scope.userId)) return true;
  if (scope.coSponsorDashboardDealIds?.includes(dealId)) return true;
  if (
    scope.organizationId &&
    (await isAddDealFormInOrganizationScope(deal, scope.organizationId))
  ) {
    return true;
  }
  return false;
}

async function investorParticipantMayReadDeal(
  deal: AddDealFormRow,
  scope: DealViewerScope,
): Promise<boolean> {
  if (!isAddDealFormIncomplete(deal)) return true;
  return viewerHasSyndicationDealWorkspaceAccess(deal, scope);
}

/** Investing lists: hide draft / incomplete deals unless viewer has sponsor workspace access. */
export async function filterDealsVisibleToInvestorParticipants(
  rows: AddDealFormRow[],
  scope: DealViewerScope,
): Promise<AddDealFormRow[]> {
  const out: AddDealFormRow[] = [];
  for (const row of rows) {
    if (await investorParticipantMayReadDeal(row, scope)) out.push(row);
  }
  return out;
}

export async function dealAccessibleToViewerScope(
  deal: AddDealFormRow | undefined | null,
  scope: DealViewerScope,
): Promise<boolean> {
  if (!deal) return false;
  const dealRow = deal;
  const dealId = String(dealRow.id);
  const dealSecType = dealRow.secType;

  /**
   * CRM Contacts Visibility (Hide / 506c-only) gates Investing Mode deal access
   * for LP investors and for Lead / Admin / Co / company roles who switched modes.
   * Syndicating workspace access still bypasses it so sponsors can open org deals.
   */
  async function passesContactOfferingVisibility(): Promise<boolean> {
    if (scope.isPlatformAdmin) return true;
    if (!scope.enforceContactOfferingVisibility) {
      if (await viewerHasSyndicationDealWorkspaceAccess(dealRow, scope))
        return true;
      if (
        scope.assignedParticipationOnly &&
        (await isUserAssignedToDeal(scope.userId, dealId))
      ) {
        return true;
      }
    }
    const emailNorm = await viewerEmailNormForScope(scope);
    if (!emailNorm) return true;
    return isDealAllowedByContactOfferingVisibility({
      emailNorm,
      dealId,
      secType: dealSecType,
    });
  }

  let baseOk = false;
  if (await isPortalUserOnDealMemberRoster(dealId, scope.userId)) {
    baseOk = true;
  } else if (scope.lpInvestorEmailScopedDealIds != null) {
    if (scope.lpInvestorEmailScopedDealIds.includes(dealId)) {
      baseOk = true;
    } else {
      const emailNorm = await viewerEmailNormForScope(scope);
      if (
        emailNorm &&
        (await isDealInDirectInvestingParticipationForUser(dealId, {
          userId: scope.userId,
          emailNorm,
        }))
      ) {
        baseOk = true;
      }
    }
  } else if (scope.coSponsorDashboardDealIds?.length) {
    baseOk = scope.coSponsorDashboardDealIds.includes(dealId);
  } else if (scope.assignedParticipationOnly) {
    baseOk = await isUserAssignedToDeal(scope.userId, dealId);
  } else if (scope.seesAllDeals) {
    baseOk = true;
  } else if (scope.organizationId) {
    baseOk = await isAddDealFormInOrganizationScope(
      dealRow,
      scope.organizationId,
    );
  }

  if (!baseOk) return false;
  return passesContactOfferingVisibility();
}

export async function getAddDealFormForViewer(
  dealId: string,
  scope: DealViewerScope,
): Promise<AddDealFormRow | undefined> {
  const row = await getAddDealFormById(dealId);
  if (!(await dealAccessibleToViewerScope(row, scope))) return undefined;
  return row;
}

/**
 * Draft deals created via POST before creator assignment was linked — repair
 * org-scoped in-progress drafts for `deal_participant` on read/write.
 */
export async function getAddDealFormForViewerWithDraftCreatorRepair(
  dealId: string,
  scope: DealViewerScope,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormForViewerOrAssignedParticipant(
    dealId,
    scope,
  );
  if (existing) return existing;
  if (!scope.assignedParticipationOnly || !scope.organizationId) {
    return undefined;
  }
  const row = await getAddDealFormById(dealId);
  if (!row || !isDealStageDraft(row.dealStage)) return undefined;
  if (!(await isAddDealFormInOrganizationScope(row, scope.organizationId))) {
    return undefined;
  }
  await assignCreatorToDeal(dealId, scope.userId);
  await assignCreatorAsLeadSponsorOnDeal(dealId, scope.userId);
  return getAddDealFormForViewer(dealId, scope);
}

export async function assertDealIdInViewerScope(
  dealId: string,
  scope: DealViewerScope,
): Promise<boolean> {
  const row = await getAddDealFormById(dealId);
  return dealAccessibleToViewerScope(row, scope);
}

/**
 * Read access: company-scoped deals **or** deals where the user is linked on the
 * roster / investments (`assigning_deal_user` / `deal_investment` / LP roster).
 */
export async function assertDealIdReadableOrAssignedParticipant(
  dealId: string,
  scope: DealViewerScope,
): Promise<boolean> {
  const row = await getAddDealFormById(dealId);
  if (!row) return false;
  const dealSecType = row.secType;
  if (!(await investorParticipantMayReadDeal(row, scope))) return false;
  if (await dealAccessibleToViewerScope(row, scope)) return true;
  /** LP email scope (incl. empty after Hide Offerings) — no org/assigned fallthrough. */
  if (scope.lpInvestorEmailScopedDealIds != null) return false;
  if (scope.coSponsorDashboardDealIds != null) return false;
  const emailNorm = await viewerEmailNormForScope(scope);
  async function passesOffering(): Promise<boolean> {
    if (scope.isPlatformAdmin || !emailNorm) return true;
    return isDealAllowedByContactOfferingVisibility({
      emailNorm,
      dealId,
      secType: dealSecType,
    });
  }
  if (await isUserAssignedToDeal(scope.userId, dealId)) {
    return passesOffering();
  }
  if (
    emailNorm &&
    (await isDealInDirectInvestingParticipationForUser(dealId, {
      userId: scope.userId,
      emailNorm,
    }))
  ) {
    return passesOffering();
  }
  if (
    emailNorm &&
    (await isDealInInvestingParticipantListForUser(dealId, {
      userId: scope.userId,
      emailNorm,
    }))
  ) {
    return passesOffering();
  }
  return false;
}

/** Same as {@link getAddDealFormForViewer} plus portal users assigned to the deal as investors. */
export async function getAddDealFormForViewerOrAssignedParticipant(
  dealId: string,
  scope: DealViewerScope,
): Promise<AddDealFormRow | undefined> {
  const row = await getAddDealFormById(dealId);
  if (!row) return undefined;
  const dealSecType = row.secType;
  if (!(await investorParticipantMayReadDeal(row, scope))) return undefined;
  if (await dealAccessibleToViewerScope(row, scope)) return row;
  if (scope.lpInvestorEmailScopedDealIds != null) return undefined;
  if (scope.coSponsorDashboardDealIds != null) return undefined;
  const emailNorm = await viewerEmailNormForScope(scope);
  async function passesOffering(): Promise<boolean> {
    if (scope.isPlatformAdmin || !emailNorm) return true;
    return isDealAllowedByContactOfferingVisibility({
      emailNorm,
      dealId,
      secType: dealSecType,
    });
  }
  if (await isUserAssignedToDeal(scope.userId, dealId)) {
    return (await passesOffering()) ? row : undefined;
  }
  if (
    emailNorm &&
    (await isDealInInvestingParticipantListForUser(dealId, {
      userId: scope.userId,
      emailNorm,
    }))
  ) {
    return (await passesOffering()) ? row : undefined;
  }
  return undefined;
}

export async function listDealsForViewer(
  scope: DealViewerScope,
): Promise<AddDealFormRow[]> {
  const base = await listAddDealFormsForViewer(scope);
  if (scope.seesAllDeals) return base;
  // LP email–scoped viewers already have the full visible set (incl. contact
  // offering visibility). Do not re-add deal_member roster rows that would
  // bypass Hide Offerings / 506(c)-only.
  if (scope.lpInvestorEmailScopedDealIds != null) return base;

  const rosterIds = await listDealIdsFromDealMemberRosterForUser(scope.userId);
  if (rosterIds.length === 0) return base;

  const visibleIds = new Set(base.map((r) => String(r.id)));
  const missing = rosterIds.filter((id) => !visibleIds.has(id));
  if (missing.length === 0) return base;

  const extraRows = await listAddDealFormsByIds(missing);
  const orgId = scope.organizationId;
  const scopedExtras =
    orgId != null
      ? (
          await Promise.all(
            extraRows.map(async (r) =>
              (await isAddDealFormInOrganizationScope(r, orgId)) ? r : null,
            ),
          )
        ).filter((r): r is AddDealFormRow => r != null)
      : extraRows;
  if (scopedExtras.length === 0) return base;

  const byId = new Map<string, AddDealFormRow>();
  for (const r of base) byId.set(String(r.id), r);
  for (const r of scopedExtras) byId.set(String(r.id), r);
  return [...byId.values()].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  );
}

/**
 * Deals the viewer’s company syndicates **plus** any deal where they appear as
 * a portal participant (`assigning_deal_user`).
 */
export async function listDealsForViewerIncludingAssignedParticipation(
  scope: DealViewerScope,
): Promise<AddDealFormRow[]> {
  if (scope.lpInvestorEmailScopedDealIds != null) {
    return listAddDealFormsForViewer(scope);
  }
  if (scope.coSponsorDashboardDealIds?.length) {
    return listAddDealFormsForViewer(scope);
  }
  const orgDeals = await listAddDealFormsForViewer(scope);
  const orgIds = new Set(orgDeals.map((r) => String(r.id)));
  const assignedIds = await listDealIdsAssignedToUser(scope.userId);
  const missing = assignedIds.filter((id) => !orgIds.has(id));
  if (missing.length === 0) return orgDeals;
  const extraRows = await listAddDealFormsByIds(missing);
  const byId = new Map<string, AddDealFormRow>();
  for (const r of orgDeals) byId.set(String(r.id), r);
  for (const r of extraRows) byId.set(String(r.id), r);
  return [...byId.values()].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  );
}
