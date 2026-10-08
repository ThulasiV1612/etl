import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  logSocDealOfferingAssetUpload,
  logSocDestructiveDealAction,
} from "../../audit/index.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { isPlatformAdminRole } from "../../constants/roles.js";
import type { AddDealFormRow } from "../../schema/deal.schema/add-deal-form.schema.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  getAddDealFormForViewer,
  getAddDealFormForViewerOrAssignedParticipant,
  getAddDealFormForViewerWithDraftCreatorRepair,
  listDealsForViewer,
  listDealsForViewerIncludingAssignedParticipation,
  filterDealsVisibleToInvestorParticipants,
  resolveDealViewerScope,
  type DealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { filterDealIdsByContactOfferingVisibility } from "../../services/contact/contactOfferingVisibility.service.js";
import { assignCreatorToDeal } from "../../services/deal/assigningDealUser.service.js";
import { assignCreatorAsLeadSponsorOnDeal } from "../../services/deal/dealMember.service.js";
import {
  requestedOrganizationIdFromRequest,
  userHasAccessToOrganization,
} from "../../services/org/orgResolution.service.js";
import { sendOfferingPreviewShareEmails } from "../../services/deal/offeringPreviewShareEmail.service.js";
import {
  decodeOfferingPreviewSponsorRefParam,
  mintOfferingPreviewSponsorRef,
  resolveDealMemberPortalUserId,
  resolveOfferingPreviewSponsorAttribution,
} from "../../services/deal/offeringPreviewSponsorRef.service.js";
import {
  isPortalUserSponsorOnDeal,
  listDealIdsWhereViewerIsLeadSponsor,
  listDealIdsWhereViewerIsLeadOrAdminSponsor,
  listDealIdsWhereViewerIsCoSponsor,
  viewerIsDealSponsorOnAnyDeal,
  viewerMayEditDealProfile,
} from "../../services/deal/dealMemberScope.service.js";
import {
  mergeCoSponsorOfferingInvestorPreviewJson,
  scopeOfferingInvestorPreviewJsonForViewer,
} from "../../services/deal/dealDocumentCoSponsorVisibility.service.js";
import { canInvestorAccessPublicOffering } from "../../constants/deal-lifecycle/index.js";
import { isDealStageDraft } from "../../constants/deal-lifecycle/deal-stage.js";
import {
  getAddDealFormById,
  insertAddDealForm,
  listAddDealFormsByIds,
  listAddDealFormsByOrganizationId,
  listAddDealFormsForViewer,
  deleteAddDealFormById,
  saveDealAssetFiles,
  appendDealGalleryUploadsById,
  updateAddDealFormById,
  updateDealInvestorSummaryById,
  updateDealAnnouncementById,
  updateDealGalleryCoverById,
  updateDealKeyHighlightsById,
  updateDealFundingInstructionsById,
  updateDealOfferingInvestorPreviewById,
  updateDealOfferingOverviewById,
  type OfferingOverviewFieldErrors,
  updateDealOfferingGalleryPathsById,
  updateDealArchivedById,
  sanitizeOfferingOverviewPatch,
  normalizeOverviewAssetIdsFromBody,
  parseStoredOfferingOverviewAssetIds,
  parseStoredOfferingGalleryPaths,
  normalizeOfferingGalleryPathsFromBody,
  ensureDealOfferingPreviewTokenStored,
  type OfferingOverviewPatchInput,
  type CreateDealFormInput,
  type DealFormFieldErrors,
} from "../../services/deal/dealForm.service.js";
import { sanitizeDealAnnouncement } from "../../utils/sanitizeDealAnnouncement.js";
import {
  FundingInstructionsJsonInvalidError,
  FundingInstructionsJsonTooLargeError,
} from "../../utils/sanitizeFundingInstructionsJson.js";
import {
  KeyHighlightsJsonInvalidError,
  KeyHighlightsJsonTooLargeError,
} from "../../utils/sanitizeKeyHighlightsJson.js";
import {
  OfferingInvestorPreviewJsonInvalidError,
  OfferingInvestorPreviewJsonTooLargeError,
  sanitizeOfferingInvestorPreviewBody,
} from "../../utils/sanitizeOfferingInvestorPreviewJson.js";
import { InvestorSummaryTooLargeError } from "../../utils/sanitizeInvestorSummaryHtml.js";
import {
  GalleryCoverUrlTooLargeError,
  sanitizeGalleryCoverImageUrl,
} from "../../utils/sanitizeGalleryCoverImageUrl.js";
import {
  requireDealDocumentMultipartFiles,
  requireDealMultipartFiles,
  optionalDealMultipartFiles,
} from "../../utils/dealMultipartUpload.util.js";
import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import {
  encryptOfferingPreviewDealId,
  resolvePublicPreviewDealId,
} from "../../utils/offeringPreviewCrypto.js";
import {
  buildInvestorKpisFromRows,
  listDealInvestmentsByDealId,
  mapDealInvestmentsToInvestorApi,
} from "../../services/deal/dealInvestment.service.js";
import { countDealLpInvestorsByDealIdsForViewer } from "../../services/deal/dealLpInvestor.service.js";
import {
  listInvestingParticipantDealIdsForUser,
  mapLpInvestorRoleDisplayByDealIdForUserEmail,
} from "../../services/investing/lpInvestorAccess.service.js";
import {
  listInvestorClassesByDealId,
  mapRowToJson as mapInvestorClassRowToJson,
} from "../../services/deal/dealInvestorClass.service.js";
import { enrichDealListRowForApi } from "../../services/deal/dealListRowEnrichment.service.js";
import {
  dealSaasBillingListFields,
  dealSaasPaymentRequiredPayload,
  ensureDealSaasComplimentaryPeriod,
  evaluateDealSaasWorkspaceAccess,
  refreshDealSaasSubscriptionFromStripe,
} from "../../services/billing/dealBilling.service.js";
import { isInvestingPortalRequest } from "../../middleware/portalMode.middleware.js";

function parseBoolField(
  v: unknown,
): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return undefined;
}

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

/** Platform admin may set customer company on a deal via multipart field. */
function organizationIdFromBody(b: Record<string, unknown>): string | null {
  const raw = bodyString(b.organization_id ?? b.organizationId).trim();
  return DEALS_ORG_UUID_RE.test(raw) ? raw : null;
}

/**
 * Billable deals stay in the list. This month they remain viewable; from next
 * month unpaid MRR locks view/edit (Deal billing / Upgrade the plan to continue).
 * Returns true when the response has already been sent.
 */
async function sendDealSaasLockIfNeeded(
  res: Response,
  row: AddDealFormRow,
  scope: DealViewerScope,
  opts?: { allowInvestingRead?: boolean },
): Promise<boolean> {
  if (scope.isPlatformAdmin) return false;
  if (opts?.allowInvestingRead && isInvestingPortalRequest()) return false;
  if (!row.saasBillingStartsAt) {
    void ensureDealSaasComplimentaryPeriod(row).catch((err) => {
      console.warn("ensureDealSaasComplimentaryPeriod:", row.id, err);
    });
  }
  let access = evaluateDealSaasWorkspaceAccess(row);
  if (access.locked && row.stripeSubscriptionId?.trim()) {
    try {
      const fresh = await refreshDealSaasSubscriptionFromStripe(row);
      if (fresh) {
        row = fresh;
        access = evaluateDealSaasWorkspaceAccess(fresh);
      }
    } catch (err) {
      console.warn("sendDealSaasLockIfNeeded stripe refresh:", row.id, err);
    }
  }
  if (!access.locked) return false;
  const dealKey = String(row.id ?? "").trim().toLowerCase();
  let viewerIsLeadSponsor = false;
  try {
    const leadIds = await listDealIdsWhereViewerIsLeadSponsor(scope.userId);
    viewerIsLeadSponsor = leadIds.some(
      (id) => String(id).trim().toLowerCase() === dealKey,
    );
  } catch (err) {
    console.warn("sendDealSaasLockIfNeeded lead sponsor:", err);
  }
  res
    .status(402)
    .json(dealSaasPaymentRequiredPayload(row, access, { viewerIsLeadSponsor }));
  return true;
}

function mapRowToJson(
  row: AddDealFormRow,
  opts?: { investmentRowCount?: number },
) {
  const investorsDisplay =
    opts?.investmentRowCount !== undefined
      ? String(Math.max(0, Math.floor(opts.investmentRowCount)))
      : "—";
  return {
    id: row.id,
    dealName: row.dealName,
    dealType: row.dealType,
    dealStage: row.dealStage,
    secType: row.secType,
    closeDate: row.closeDate ?? null,
    owningEntityName: row.owningEntityName,
    fundsRequiredBeforeGpSign: row.fundsRequiredBeforeGpSign,
    autoSendFundingInstructions: row.autoSendFundingInstructions,
    propertyName: row.propertyName,
    country: row.country,
    addressLine1: row.addressLine1 ?? "",
    addressLine2: row.addressLine2 ?? "",
    city: row.city,
    state: row.state ?? "",
    zipCode: row.zipCode ?? "",
    assetImagePath: row.assetImagePath ?? null,
    investorSummaryHtml: row.investorSummaryHtml ?? "",
    galleryCoverImageUrl: row.galleryCoverImageUrl ?? "",
    keyHighlightsJson: row.keyHighlightsJson ?? "",
    fundingInstructionsJson: row.fundingInstructionsJson ?? "",
    dealAnnouncementTitle: row.dealAnnouncementTitle ?? "",
    dealAnnouncementMessage: row.dealAnnouncementMessage ?? "",
    offeringStatus: row.offeringStatus ?? "draft_hidden",
    offeringVisibility: row.offeringVisibility ?? "show_on_dashboard",
    showOnInvestbase: Boolean(row.showOnInvestbase),
    internalName: row.internalName ?? "",
    offeringOverviewAssetIds: parseStoredOfferingOverviewAssetIds(
      row.offeringOverviewAssetIds,
    ),
    offeringOverviewClassId: row.offeringOverviewClassId ?? null,
    offeringGalleryPaths: parseStoredOfferingGalleryPaths(
      row.offeringGalleryPaths,
    ),
    offeringPreviewToken: row.offeringPreviewToken ?? null,
    offeringInvestorPreviewJson: row.offeringInvestorPreviewJson ?? null,
    archived: Boolean(row.archived),
    createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    listRow: {
      id: row.id,
      dealName: row.dealName,
      dealType: row.dealType,
      dealStage: row.dealStage,
      totalInProgress: "—",
      totalAccepted: "—",
      raiseTarget: "—",
      distributions: "—",
      investors: investorsDisplay,
      closeDateDisplay: row.closeDate
        ? formatDdMmmYyyy(String(row.closeDate).slice(0, 10))
        : "—",
      createdDateDisplay: formatDdMmmYyyy(row.createdAt),
      startDateDisplay: formatDdMmmYyyy(row.createdAt),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      locationDisplay:
        [row.city, row.state, row.country].filter((x) => x?.trim()).join(", ") ||
        "—",
      assetImagePath: row.assetImagePath ?? null,
      secType: row.secType,
      owningEntityName: row.owningEntityName,
      propertyName: row.propertyName,
      city: row.city,
      galleryCoverImageUrl: row.galleryCoverImageUrl ?? "",
      offeringStatus: row.offeringStatus ?? "draft_hidden",
      archived: Boolean(row.archived),
    },
  };
}

const DEALS_ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `listRow.investors` = distinct LP roster rows in `deal_lp_investor` for this deal,
 * scoped by viewer (platform admin: full roster; company users: rows added by their org).
 */
async function mapRowToJsonWithInvestmentCount(
  row: AddDealFormRow,
  scope?: DealViewerScope | null,
) {
  const id = String(row.id);
  const counts = await countDealLpInvestorsByDealIdsForViewer([id], scope ?? null);
  const n = counts.get(id) ?? 0;
  return mapRowToJson(row, {
    investmentRowCount: n,
  });
}

/**
 * Lists deals for the signed-in viewer.
 * Query `includeParticipantDeals=1`: org-scoped deals **plus** any deal linked via
 * `assigning_deal_user` — used by the investing dashboard and `/investing/deals`
 * so participants see syndicated + assigned deals in one list.
 */
export async function getDeals(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const orgQ = req.query.organizationId;
    const orgParam =
      typeof orgQ === "string"
        ? orgQ.trim()
        : Array.isArray(orgQ)
          ? String(orgQ[0] ?? "").trim()
          : "";

    const incRaw = req.query.includeParticipantDeals;
    const includeParticipantDeals =
      incRaw === "true" ||
      incRaw === "1" ||
      String(incRaw ?? "").toLowerCase() === "yes";

    const requestedOrg = includeParticipantDeals
      ? null
      : requestedOrganizationIdFromRequest(req);
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrg,
    );

    let rows: AddDealFormRow[];
    let includeParticipantViewerEmailNorm = "";

    if (includeParticipantDeals) {
      const [uRow] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      includeParticipantViewerEmailNorm = String(uRow?.email ?? "")
        .trim()
        .toLowerCase();
      /**
       * Lead / Admin / Co-sponsor (and LP-only viewers) see deals they are
       * invested in / invited to, then Contacts Visibility (Show / Hide /
       * 506(c) only). Company / platform workspace users keep org deals.
       */
      const dealSponsorUsesInvestorScope =
        !scope.seesAllDeals && (await viewerIsDealSponsorOnAnyDeal(user.id));
      const investingUsesWorkspaceDeals =
        !dealSponsorUsesInvestorScope &&
        (scope.seesAllDeals ||
          (scope.lpInvestorEmailScopedDealIds == null &&
            !scope.assignedParticipationOnly));
      if (investingUsesWorkspaceDeals) {
        rows = await listDealsForViewerIncludingAssignedParticipation(scope);
      } else {
        const participantDealIds = includeParticipantViewerEmailNorm
          ? await listInvestingParticipantDealIdsForUser({
              userId: user.id,
              emailNorm: includeParticipantViewerEmailNorm,
            })
          : [];
        rows =
          participantDealIds.length > 0
            ? await listAddDealFormsByIds(participantDealIds)
            : [];
      }
    } else if (orgParam && DEALS_ORG_UUID_RE.test(orgParam)) {
      if (!scope.isPlatformAdmin) {
        const allowed = await userHasAccessToOrganization(user.id, orgParam);
        if (!allowed) {
          res.status(403).json({ message: "Not allowed" });
          return;
        }
        /**
         * Non-admins must not receive the full org dump — that bypassed
         * co-sponsor / LP scope and CRM offering visibility (506c-only / hide).
         * Intersect viewer-scoped deals with the requested organization.
         */
        const scoped = await listDealsForViewer(scope);
        rows = scoped.filter(
          (r) =>
            String(r.organizationId ?? "").trim() === orgParam ||
            scope.organizationId == null ||
            String(r.organizationId ?? "").trim() ===
              String(scope.organizationId ?? "").trim(),
        );
        // If org filter emptied a valid co-sponsor/LP set (legacy null org_id),
        // keep the viewer-scoped list instead of falling back to all org deals.
        if (rows.length === 0 && scoped.length > 0) rows = scoped;
      } else {
        rows = await listAddDealFormsByOrganizationId(orgParam);
      }
    } else {
      rows = await listDealsForViewer(scope);
    }

    if (includeParticipantDeals && rows.length > 0) {
      rows = await filterDealsVisibleToInvestorParticipants(rows, scope);
    }

    /**
     * Investing Mode (and LP-email-scoped viewers): apply CRM Contacts Visibility.
     * Syndicating lists skip this so Lead / Admin / Co / company roles still see
     * every workspace deal.
     */
    if (scope.enforceContactOfferingVisibility && rows.length > 0) {
      const emailNorm =
        includeParticipantViewerEmailNorm ||
        String(
          (
            await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, user.id))
              .limit(1)
          )[0]?.email ?? "",
        )
          .trim()
          .toLowerCase();
      if (emailNorm) {
        const allowedIds = new Set(
          await filterDealIdsByContactOfferingVisibility(
            emailNorm,
            rows.map((r) => String(r.id ?? "")),
          ),
        );
        rows = rows.filter((r) => allowedIds.has(String(r.id ?? "")));
      }
    }

    const dealIds = rows.map((r) => String(r.id ?? ""));
    const lpInvestorCounts =
      dealIds.length > 0
        ? await countDealLpInvestorsByDealIdsForViewer(dealIds, scope)
        : new Map<string, number>();

    const [leadSponsorDealIds, leadOrAdminSponsorDealIds, coSponsorDealIds] =
      dealIds.length > 0
        ? await Promise.all([
            listDealIdsWhereViewerIsLeadSponsor(user.id),
            listDealIdsWhereViewerIsLeadOrAdminSponsor(user.id),
            listDealIdsWhereViewerIsCoSponsor(user.id),
          ]).then(
            ([lead, leadOrAdmin, co]) =>
              [
                new Set(lead.map((id) => String(id).trim().toLowerCase())),
                new Set(
                  leadOrAdmin.map((id) => String(id).trim().toLowerCase()),
                ),
                new Set(co.map((id) => String(id).trim().toLowerCase())),
              ] as const,
          )
        : [
            new Set<string>(),
            new Set<string>(),
            new Set<string>(),
          ];

    let lpRoleByDealId = new Map<string, string>();
    const shouldAttachLpRole =
      rows.length > 0 &&
      (Boolean(scope.lpInvestorEmailScopedDealIds?.length) ||
        includeParticipantDeals);
    if (shouldAttachLpRole) {
      const emailNorm =
        includeParticipantViewerEmailNorm ||
        String(
          (
            await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, user.id))
              .limit(1)
          )[0]?.email ?? "",
        )
          .trim()
          .toLowerCase();
      if (emailNorm) {
        lpRoleByDealId = await mapLpInvestorRoleDisplayByDealIdForUserEmail(
          emailNorm,
          rows.map((r) => String(r.id)),
        );
      }
    }

    const dealsPayload = (
      await Promise.all(
        rows.map(async (r: AddDealFormRow) => {
          const id = String(r.id);
          const n = lpInvestorCounts.get(id) ?? 0;
          const enriched = await enrichDealListRowForApi(r);
          const listRow = {
            ...mapRowToJson(r, {
              investmentRowCount: n,
            }).listRow,
            ...enriched,
          };
          const withRole = !shouldAttachLpRole
            ? listRow
            : {
                ...listRow,
                yourRole: lpRoleByDealId.get(id) ?? "LP Investor",
              };
          const dealKey = id.trim().toLowerCase();
          const viewerIsLeadSponsor = leadSponsorDealIds.has(dealKey);
          const withBilling =
            !includeParticipantDeals || viewerIsLeadSponsor
            ? {
                ...withRole,
                ...(await dealSaasBillingListFields(r)),
                viewerIsLeadSponsor,
                viewerCanEditDeal: (() => {
                  if (leadOrAdminSponsorDealIds.has(dealKey)) return true;
                  if (coSponsorDealIds.has(dealKey)) return false;
                  return !includeParticipantDeals;
                })(),
              }
            : withRole;
          if (!includeParticipantDeals) return withBilling;
          const readable = await assertDealIdReadableOrAssignedParticipant(
            id,
            scope,
          );
          // Do not return deals the viewer cannot open (e.g. contact offering
          // visibility Hide / 506c-only) — avoids "Deal not found" on click.
          if (!readable) return null;
          return { ...withBilling, rosterReadable: true as const };
        }),
      )
    ).filter((row): row is NonNullable<typeof row> => row != null);

    res.status(200).json({
      deals: dealsPayload,
    });
  } catch (err) {
    console.error("getDeals:", err);
    res.status(500).json({ message: "Could not load deals" });
  }
}

export async function patchDealInvestorSummary(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const htmlRaw =
    typeof b.investor_summary_html === "string"
      ? b.investor_summary_html
      : b.investor_summary_html != null
        ? String(b.investor_summary_html)
        : "";

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const updated = await updateDealInvestorSummaryById(dealId, htmlRaw);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Summary updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    if (err instanceof InvestorSummaryTooLargeError) {
      res.status(400).json({ message: "Summary is too large." });
      return;
    }
    console.error("patchDealInvestorSummary:", err);
    res.status(500).json({ message: "Could not update summary" });
  }
}

export async function patchDealAnnouncement(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const titleRaw =
    typeof b.deal_announcement_title === "string"
      ? b.deal_announcement_title
      : b.deal_announcement_title != null
        ? String(b.deal_announcement_title)
        : typeof b.dealAnnouncementTitle === "string"
          ? b.dealAnnouncementTitle
          : b.dealAnnouncementTitle != null
            ? String(b.dealAnnouncementTitle)
            : "";
  const messageRaw =
    typeof b.deal_announcement_message === "string"
      ? b.deal_announcement_message
      : b.deal_announcement_message != null
        ? String(b.deal_announcement_message)
        : typeof b.dealAnnouncementMessage === "string"
          ? b.dealAnnouncementMessage
          : b.dealAnnouncementMessage != null
            ? String(b.dealAnnouncementMessage)
            : "";

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const { title, message } = sanitizeDealAnnouncement({
      title: titleRaw,
      message: messageRaw,
    });
    const updated = await updateDealAnnouncementById(dealId, title, message);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Announcement updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    console.error("patchDealAnnouncement:", err);
    res.status(500).json({ message: "Could not update announcement" });
  }
}

export async function patchDealOfferingOverview(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const patchIn: OfferingOverviewPatchInput = {};
  if ("offering_status" in b || "offeringStatus" in b) {
    patchIn.offeringStatus = bodyString(b.offering_status ?? b.offeringStatus);
  }
  if ("offering_visibility" in b || "offeringVisibility" in b) {
    patchIn.offeringVisibility = bodyString(
      b.offering_visibility ?? b.offeringVisibility,
    );
  }
  if ("show_on_investbase" in b || "showOnInvestbase" in b) {
    const p = parseBoolField(b.show_on_investbase ?? b.showOnInvestbase);
    if (p === undefined) {
      res.status(400).json({ message: "show_on_investbase must be a boolean." });
      return;
    }
    patchIn.showOnInvestbase = p;
  }
  if ("deal_name" in b || "dealName" in b) {
    patchIn.dealName = bodyString(b.deal_name ?? b.dealName);
  }
  if ("internal_name" in b || "internalName" in b) {
    patchIn.internalName = bodyString(b.internal_name ?? b.internalName);
  }
  if ("deal_type" in b || "dealType" in b) {
    patchIn.dealType = bodyString(b.deal_type ?? b.dealType);
  }
  if (
    "offering_overview_asset_ids" in b ||
    "offeringOverviewAssetIds" in b
  ) {
    const raw =
      b.offering_overview_asset_ids ?? b.offeringOverviewAssetIds;
    const n = normalizeOverviewAssetIdsFromBody(raw);
    if (!n.ok) {
      res.status(400).json({ message: n.message });
      return;
    }
    patchIn.offeringOverviewAssetIdsJson = JSON.stringify(n.ids);
  }
  if (
    "offering_overview_class_id" in b ||
    "offeringOverviewClassId" in b
  ) {
    const raw = b.offering_overview_class_id ?? b.offeringOverviewClassId;
    if (raw === null || raw === "" || raw === undefined) {
      patchIn.offeringOverviewClassId = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      patchIn.offeringOverviewClassId = trimmed || null;
    } else {
      patchIn.offeringOverviewClassId = null;
    }
  }

  const sanitized = sanitizeOfferingOverviewPatch(patchIn);
  if (!sanitized.ok) {
    res.status(400).json({ message: sanitized.message });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const updated = await updateDealOfferingOverviewById(
      dealId,
      sanitized.set,
    );
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Offering overview updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "VALIDATION" && "fieldErrors" in err) {
      const fieldErrors = (err as Error & { fieldErrors: unknown }).fieldErrors;
      res.status(400).json({
        message: "Validation failed",
        errors: fieldErrors as DealFormFieldErrors & OfferingOverviewFieldErrors,
      });
      return;
    }
    console.error("patchDealOfferingOverview:", err);
    res.status(500).json({ message: "Could not update offering overview" });
  }
}

export async function getDealOfferingInvestorPreview(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const row = await getAddDealFormForViewerOrAssignedParticipant(dealId, scope);
    if (!row) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (
      await sendDealSaasLockIfNeeded(res, row, scope, { allowInvestingRead: true })
    ) {
      return;
    }
    res.status(200).json({
      offeringInvestorPreviewJson: await scopeOfferingInvestorPreviewJsonForViewer({
        dealId,
        viewerUserId: user.id,
        viewerRole: user.userRole,
        json: row.offeringInvestorPreviewJson ?? null,
      }),
    });
  } catch (err) {
    console.error("getDealOfferingInvestorPreview:", err);
    res.status(500).json({
      message: "Could not load offering investor preview",
    });
  }
}

export async function patchDealOfferingInvestorPreview(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const body = req.body;
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const canonical = sanitizeOfferingInvestorPreviewBody(body);
    const merged = await mergeCoSponsorOfferingInvestorPreviewJson({
      dealId,
      viewerUserId: user.id,
      viewerRole: user.userRole,
      existingJson: visible.offeringInvestorPreviewJson ?? null,
      incomingCanonicalJson: canonical,
    });
    const updated = await updateDealOfferingInvestorPreviewById(
      dealId,
      merged,
    );
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const deal = await mapRowToJsonWithInvestmentCount(updated, scope);
    deal.offeringInvestorPreviewJson =
      await scopeOfferingInvestorPreviewJsonForViewer({
        dealId,
        viewerUserId: user.id,
        viewerRole: user.userRole,
        json: deal.offeringInvestorPreviewJson ?? null,
      });
    res.status(200).json({
      message: "Offering investor preview updated",
      deal,
    });
  } catch (err: unknown) {
    if (err instanceof OfferingInvestorPreviewJsonInvalidError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof OfferingInvestorPreviewJsonTooLargeError) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("patchDealOfferingInvestorPreview:", err);
    res.status(500).json({ message: "Could not update offering investor preview" });
  }
}

export async function patchDealKeyHighlights(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const jsonRaw =
    typeof b.key_highlights_json === "string"
      ? b.key_highlights_json
      : b.key_highlights_json != null
        ? String(b.key_highlights_json)
        : typeof b.keyHighlightsJson === "string"
          ? b.keyHighlightsJson
          : b.keyHighlightsJson != null
            ? String(b.keyHighlightsJson)
            : "";

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const updated = await updateDealKeyHighlightsById(dealId, jsonRaw);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Key highlights updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    if (err instanceof KeyHighlightsJsonInvalidError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof KeyHighlightsJsonTooLargeError) {
      res.status(400).json({ message: "Key highlights payload is too large." });
      return;
    }
    console.error("patchDealKeyHighlights:", err);
    res.status(500).json({ message: "Could not update key highlights" });
  }
}

export async function patchDealFundingInstructions(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const jsonRaw =
    typeof b.funding_instructions_json === "string"
      ? b.funding_instructions_json
      : b.funding_instructions_json != null
        ? String(b.funding_instructions_json)
        : typeof b.fundingInstructionsJson === "string"
          ? b.fundingInstructionsJson
          : b.fundingInstructionsJson != null
            ? String(b.fundingInstructionsJson)
            : "";

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const updated = await updateDealFundingInstructionsById(dealId, jsonRaw);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Funding instructions updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    if (err instanceof FundingInstructionsJsonInvalidError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof FundingInstructionsJsonTooLargeError) {
      res.status(400).json({
        message: "Funding instructions payload is too large.",
      });
      return;
    }
    console.error("patchDealFundingInstructions:", err);
    res.status(500).json({ message: "Could not update funding instructions" });
  }
}

export async function patchDealGalleryCover(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const raw = b.gallery_cover_image_url ?? b.galleryCoverImageUrl;
  let toStore: string | null;
  if (raw === null || raw === undefined) {
    toStore = null;
  } else if (typeof raw === "string" && raw.trim() === "") {
    toStore = null;
  } else if (typeof raw === "string") {
    try {
      const s = sanitizeGalleryCoverImageUrl(raw);
      if (s === null && raw.trim() !== "") {
        res.status(400).json({ message: "Invalid cover image URL." });
        return;
      }
      toStore = s;
    } catch (e: unknown) {
      if (e instanceof GalleryCoverUrlTooLargeError) {
        res.status(400).json({ message: "Cover image URL is too large." });
        return;
      }
      throw e;
    }
  } else {
    res.status(400).json({ message: "Invalid cover image URL." });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const updated = await updateDealGalleryCoverById(dealId, toStore);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Cover image updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    if (err instanceof GalleryCoverUrlTooLargeError) {
      res.status(400).json({ message: "Cover image URL is too large." });
      return;
    }
    console.error("patchDealGalleryCover:", err);
    res.status(500).json({ message: "Could not update cover image" });
  }
}

export async function patchDealOfferingGallery(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const raw = b.offering_gallery_paths ?? b.offeringGalleryPaths;
  const norm = normalizeOfferingGalleryPathsFromBody(raw);
  if (!norm.ok) {
    res.status(400).json({ message: norm.message });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const updated = await updateDealOfferingGalleryPathsById(
      dealId,
      norm.paths,
    );
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Offering gallery updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    console.error("patchDealOfferingGallery:", err);
    res.status(500).json({ message: "Could not update offering gallery" });
  }
}

/** Multipart upload of offering documents (Documents tab); paths are stored in offering investor preview JSON. */
export async function postDealOfferingDocumentUploads(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const fileList = requireDealDocumentMultipartFiles(req, res);
  if (!fileList) return;
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewerOrAssignedParticipant(
      dealId,
      scope,
    );
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const newPaths = await saveDealAssetFiles({ files: fileList, dealId });
    logSocDealOfferingAssetUpload({
      actorUserId: user.id,
      dealId,
      assetKind: "offering_documents",
      fileCount: fileList.length,
    });
    res.status(200).json({
      message: "Offering documents uploaded",
      newPaths,
    });
  } catch (err: unknown) {
    console.error("postDealOfferingDocumentUploads:", err);
    res.status(500).json({ message: "Could not upload offering documents" });
  }
}

/** Multipart upload of gallery images (e.g. from Add Asset); merges into deal paths for public preview. */
export async function postDealOfferingGalleryUploads(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const fileList = requireDealMultipartFiles(req, res, "galleryFiles");
  if (!fileList) return;
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    const newPaths = await saveDealAssetFiles({
      files: fileList,
      dealId,
      useCloudinaryForImages: true,
    });
    const updated = await appendDealGalleryUploadsById(dealId, newPaths);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    logSocDealOfferingAssetUpload({
      actorUserId: user.id,
      dealId,
      assetKind: "offering_gallery",
      fileCount: fileList.length,
    });
    res.status(200).json({
      message: "Gallery images uploaded",
      newPaths,
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    console.error("postDealOfferingGalleryUploads:", err);
    res.status(500).json({ message: "Could not upload gallery images" });
  }
}

/**
 * Authenticated: mint encrypted token for LP preview links (no raw UUID in URL).
 */
export async function getOfferingPreviewToken(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealIdParam =
    typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealIdParam) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewerOrAssignedParticipant(
      dealIdParam,
      scope,
    );
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (
      await sendDealSaasLockIfNeeded(res, visible, scope, { allowInvestingRead: true })
    ) {
      return;
    }
    if (isDealStageDraft(visible.dealStage)) {
      res.status(403).json({
        message:
          "Offering preview links are not available while the deal is in Draft.",
      });
      return;
    }
    if (visible.archived) {
      res.status(403).json({
        message:
          "Offering preview links are not available for archived deals.",
      });
      return;
    }
    const token = encryptOfferingPreviewDealId(dealIdParam);
    let sponsorRef: string | undefined;
    const sponsorContactRaw =
      req.query.sponsor_contact_id ?? req.query.sponsorContactId;
    const sponsorContactId =
      typeof sponsorContactRaw === "string"
        ? sponsorContactRaw.trim()
        : Array.isArray(sponsorContactRaw) && typeof sponsorContactRaw[0] === "string"
          ? sponsorContactRaw[0].trim()
          : "";
    let sponsorUserId = user.id;
    if (sponsorContactId) {
      const resolved = await resolveDealMemberPortalUserId(
        dealIdParam,
        sponsorContactId,
      );
      if (!resolved) {
        res.status(400).json({
          message:
            "Could not create a sponsor-specific link for that team member.",
        });
        return;
      }
      sponsorUserId = resolved;
    } else if (!(await isPortalUserSponsorOnDeal(dealIdParam, user.id))) {
      sponsorUserId = "";
    }
    if (sponsorUserId) {
      const ref = await mintOfferingPreviewSponsorRef(dealIdParam, sponsorUserId);
      if (ref) sponsorRef = ref;
    }
    res.status(200).json({ token, previewToken: token, sponsorRef });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("OFFERING_PREVIEW_SECRET")) {
      res.status(503).json({ message: "Preview links are not configured." });
      return;
    }
    console.error("getOfferingPreviewToken:", err);
    res.status(500).json({ message: "Could not create preview token." });
  }
}

/**
 * Authenticated: email the public offering preview link to one or more addresses.
 */
export async function postOfferingPreviewShareEmail(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const emailsRaw = b.emails ?? b.recipients;
  if (!Array.isArray(emailsRaw) || emailsRaw.length === 0) {
    res
      .status(400)
      .json({ message: "Provide a non-empty emails array (recipient addresses)." });
    return;
  }
  const emails = emailsRaw.map((x) => String(x).trim()).filter(Boolean);
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;
    if (isDealStageDraft(visible.dealStage)) {
      res.status(403).json({
        message:
          "Offering preview emails are not available while the deal is in Draft.",
      });
      return;
    }
    if (visible.archived) {
      res.status(403).json({
        message:
          "Offering preview emails are not available for archived deals.",
      });
      return;
    }
    const result = await sendOfferingPreviewShareEmails({
      dealId,
      emails,
      sharingUserId: user.id,
    });
    res.status(200).json({
      message:
        result.sent > 0
          ? `Sent ${result.sent} message(s).`
          : "No messages were sent.",
      sent: result.sent,
      failures: result.failures,
      previewUrl: result.previewUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("encryption is not configured") ||
      msg.includes("OFFERING_PREVIEW_SECRET")
    ) {
      res.status(503).json({ message: msg });
      return;
    }
    if (msg.includes("FRONTEND_URL") || msg.includes("BASE_URL")) {
      res.status(503).json({ message: msg });
      return;
    }
    if (msg.includes("At most")) {
      res.status(400).json({ message: msg });
      return;
    }
    if (msg === "No valid email addresses.") {
      res.status(400).json({ message: msg });
      return;
    }
    console.error("postOfferingPreviewShareEmail:", err);
    res.status(500).json({ message: "Could not send offering preview emails." });
  }
}

/**
 * LP-facing offering preview: no auth. `preview` is an encrypted token (preferred) or legacy URL-encoded UUID.
 * Returns aggregate KPIs only (no investor PII rows).
 */
export async function getPublicOfferingPreview(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.query.preview;
  const encoded =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && typeof raw[0] === "string"
        ? raw[0]
        : "";
  if (!encoded.trim()) {
    res.status(400).json({ message: "Missing preview parameter." });
    return;
  }
  let previewValue: string;
  try {
    previewValue = decodeURIComponent(encoded.trim());
  } catch {
    res.status(400).json({ message: "Invalid preview parameter." });
    return;
  }
  let dealId: string | null;
  try {
    dealId = resolvePublicPreviewDealId(previewValue);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("OFFERING_PREVIEW_SECRET")) {
      res.status(503).json({ message: "Preview links are not configured." });
      return;
    }
    console.error("getPublicOfferingPreview resolve:", err);
    res.status(500).json({ message: "Could not load offering preview." });
    return;
  }
  if (!dealId) {
    res.status(400).json({ message: "Invalid preview link." });
    return;
  }
  const refRaw = req.query.ref;
  const sponsorRefValue = decodeOfferingPreviewSponsorRefParam(
    typeof refRaw === "string"
      ? refRaw
      : Array.isArray(refRaw) && typeof refRaw[0] === "string"
        ? refRaw[0]
        : "",
  );
  try {
    const row = await getAddDealFormById(dealId);
    if (!row) {
      res.status(404).json({ message: "Offering not found." });
      return;
    }
    if (
      !canInvestorAccessPublicOffering(row.dealStage, row.offeringStatus)
    ) {
      res.status(403).json({
        message: "This offering is not available.",
      });
      return;
    }
    const referringSponsor = sponsorRefValue
      ? await resolveOfferingPreviewSponsorAttribution(dealId, sponsorRefValue)
      : null;
    const deal = await mapRowToJsonWithInvestmentCount(row, null);
    const classRows = await listInvestorClassesByDealId(dealId);
    const invRows = await listDealInvestmentsByDealId(dealId, {
      lpInvestorsOnly: false,
    });
    const kpis = buildInvestorKpisFromRows(invRows);
    const investors = await mapDealInvestmentsToInvestorApi(invRows);
    res.status(200).json({
      deal,
      investorClasses: classRows.map(mapInvestorClassRowToJson),
      kpis,
      investors,
      ...(referringSponsor
        ? {
            referringSponsorDisplayName: referringSponsor.displayName,
            referringSponsorRef: sponsorRefValue,
          }
        : {}),
    });
  } catch (err) {
    console.error("getPublicOfferingPreview:", err);
    res.status(500).json({ message: "Could not load offering preview." });
  }
}

export async function getDealById(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const row = await getAddDealFormForViewerWithDraftCreatorRepair(
      dealId,
      scope,
    );
    if (!row) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (
      await sendDealSaasLockIfNeeded(res, row, scope, { allowInvestingRead: true })
    ) {
      return;
    }
    const withPreview = await ensureDealOfferingPreviewTokenStored(dealId);
    const rowForJson = withPreview ?? row;
    const deal = await mapRowToJsonWithInvestmentCount(rowForJson, scope);
    deal.offeringInvestorPreviewJson =
      await scopeOfferingInvestorPreviewJsonForViewer({
        dealId,
        viewerUserId: user.id,
        viewerRole: user.userRole,
        json: deal.offeringInvestorPreviewJson ?? null,
      });
    const billing = await dealSaasBillingListFields(rowForJson);
    let viewerIsLeadSponsor = false;
    try {
      const leadIds = await listDealIdsWhereViewerIsLeadSponsor(scope.userId);
      viewerIsLeadSponsor = leadIds.some(
        (id) => String(id).trim().toLowerCase() === String(dealId).trim().toLowerCase(),
      );
    } catch (err) {
      console.warn("getDealById lead sponsor:", err);
    }
    const listRow =
      deal && typeof deal === "object" && "listRow" in deal
        ? {
            ...(deal as { listRow?: Record<string, unknown> }).listRow,
            ...billing,
            viewerIsLeadSponsor,
          }
        : undefined;
    res.status(200).json({
      deal: {
        ...deal,
        ...billing,
        viewerIsLeadSponsor,
        viewerCanEditDeal: await viewerMayEditDealProfile(dealId, user.id),
        ...(listRow ? { listRow } : {}),
      },
    });
  } catch (err) {
    console.error("getDealById:", err);
    res.status(500).json({ message: "Could not load deal" });
  }
}

export async function postDeal(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const funds = parseBoolField(b.funds_required_before_gp_sign);
  const auto = parseBoolField(b.auto_send_funding_instructions);

  const input: CreateDealFormInput = {
    dealName: bodyString(b.deal_name),
    dealType: bodyString(b.deal_type),
    dealStage: bodyString(b.deal_stage),
    secType: bodyString(b.sec_type),
    closeDate: bodyString(b.close_date) || null,
    owningEntityName: bodyString(b.owning_entity_name),
    fundsRequiredBeforeGpSign: funds,
    autoSendFundingInstructions: auto,
    propertyName: bodyString(b.property_name),
    country: bodyString(b.country),
    addressLine1: bodyString(b.address_line_1 ?? b.addressLine1),
    addressLine2: bodyString(b.address_line_2 ?? b.addressLine2),
    city: bodyString(b.city),
    state: bodyString(b.state),
    zipCode: bodyString(b.zip_code ?? b.zipCode),
  };

  const fileList = optionalDealMultipartFiles(req, res);
  if (fileList == null) return;

  try {
    const [actor] = await db
      .select({ organizationId: users.organizationId, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    let organizationId = actor?.organizationId ?? null;
    if (actor && isPlatformAdminRole(actor.role)) {
      const fromBody = organizationIdFromBody(b);
      if (fromBody) organizationId = fromBody;
    }

    const assetPaths = await saveDealAssetFiles({
      files: fileList,
      useCloudinaryForImages: true,
    });
    const created = await insertAddDealForm(input, assetPaths, organizationId);
    const dealId = String(created.id);
    await assignCreatorToDeal(dealId, user.id);
    await assignCreatorAsLeadSponsorOnDeal(dealId, user.id);
    res.status(201).json({
      message: "Deal created",
      deal: mapRowToJson(created, { investmentRowCount: 0 }),
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message === "VALIDATION" &&
      "fieldErrors" in err
    ) {
      res.status(400).json({
        message: "Validation failed",
        errors: (err as Error & { fieldErrors: DealFormFieldErrors })
          .fieldErrors,
      });
      return;
    }
    console.error("postDeal:", err);
    res.status(500).json({ message: "Could not create deal" });
  }
}

export async function putDeal(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const funds = parseBoolField(b.funds_required_before_gp_sign);
  const auto = parseBoolField(b.auto_send_funding_instructions);

  const input: CreateDealFormInput = {
    dealName: bodyString(b.deal_name),
    dealType: bodyString(b.deal_type),
    dealStage: bodyString(b.deal_stage),
    secType: bodyString(b.sec_type),
    closeDate: bodyString(b.close_date) || null,
    owningEntityName: bodyString(b.owning_entity_name),
    fundsRequiredBeforeGpSign: funds,
    autoSendFundingInstructions: auto,
    propertyName: bodyString(b.property_name),
    country: bodyString(b.country),
    addressLine1: bodyString(b.address_line_1 ?? b.addressLine1),
    addressLine2: bodyString(b.address_line_2 ?? b.addressLine2),
    city: bodyString(b.city),
    state: bodyString(b.state),
    zipCode: bodyString(b.zip_code ?? b.zipCode),
  };

  const fileList = optionalDealMultipartFiles(req, res);
  if (fileList == null) return;

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewerWithDraftCreatorRepair(
      dealId,
      scope,
    );
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (!(await viewerMayEditDealProfile(dealId, user.id))) {
      res.status(403).json({
        message:
          "Only the lead or admin sponsor on this deal can edit it",
      });
      return;
    }
    if (await sendDealSaasLockIfNeeded(res, visible, scope)) return;

    const [actor] = await db
      .select({ organizationId: users.organizationId, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    let organizationId = actor?.organizationId ?? null;
    if (actor && isPlatformAdminRole(actor.role)) {
      const fromBody = organizationIdFromBody(b);
      if (fromBody) organizationId = fromBody;
    }

    const assetPaths = await saveDealAssetFiles({
      files: fileList,
      dealId,
      useCloudinaryForImages: true,
    });
    const retainedProvided = Object.prototype.hasOwnProperty.call(
      b,
      "retained_asset_image_path",
    );
    const retainedStr = retainedProvided
      ? bodyString(b.retained_asset_image_path)
      : "";
    const replaceAssetImageBase = retainedProvided
      ? retainedStr
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const updated = await updateAddDealFormById(dealId, input, assetPaths, {
      organizationId,
      ...(replaceAssetImageBase !== undefined
        ? { replaceAssetImageBase }
        : {}),
    });
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({
      message: "Deal updated",
      deal: await mapRowToJsonWithInvestmentCount(updated, scope),
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message === "VALIDATION" &&
      "fieldErrors" in err
    ) {
      res.status(400).json({
        message: "Validation failed",
        errors: (err as Error & { fieldErrors: DealFormFieldErrors })
          .fieldErrors,
      });
      return;
    }
    console.error("putDeal:", err);
    res.status(500).json({ message: "Could not update deal" });
  }
}

export async function patchDealArchived(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const archived = parseBoolField(b.archived ?? b.isArchived);
  if (archived === undefined) {
    res.status(400).json({ message: "Field archived (boolean) is required" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const updated = await updateDealArchivedById(dealId, archived);
    if (!updated) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const n =
      (await countDealLpInvestorsByDealIdsForViewer([dealId], scope)).get(
        dealId,
      ) ?? 0;
    const enriched = await enrichDealListRowForApi(updated);
    const listRow = {
      ...mapRowToJson(updated, { investmentRowCount: n }).listRow,
      ...enriched,
      archived: Boolean(updated.archived),
    };
    res.status(200).json({
      message: archived ? "Deal archived" : "Deal restored",
      deal: listRow,
    });
  } catch (err) {
    console.error("patchDealArchived:", err);
    res.status(500).json({ message: "Could not update deal archive status" });
  }
}

export async function deleteDeal(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const rawId = req.params.dealId;
  const dealId = typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const visible = await getAddDealFormForViewer(dealId, scope);
    if (!visible) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const ok = await deleteAddDealFormById(dealId);
    if (!ok) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    logSocDestructiveDealAction({
      action: "deal.delete",
      actorUserId: user.id,
      dealId,
    });
    res.status(204).send();
  } catch (err) {
    console.error("deleteDeal:", err);
    res.status(500).json({ message: "Could not delete deal" });
  }
}
