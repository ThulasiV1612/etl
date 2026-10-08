import { isPlatformAdmin } from "../../../../common/auth/roleUtils"
import { isAccessibleCompanyId } from "../../../../common/auth/sessionMemberships"
import {
  organizationIdQueryParam,
  portalAuthHeaders,
  PORTAL_OMIT_ACTIVE_ORG_HEADER,
} from "../../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../../common/utils/apiBaseUrl"
import {
  MAX_DEAL_IMAGE_FILE_BYTES,
  materializeImageFilesForUpload,
} from "../../../../common/utils/materializeImageFileForUpload"
import { formatDateDdMmmYyyy } from "../../../../common/utils/formatDateDisplay"
import {
  parseDropboxDetailFromApi,
  esignWorkflowColumnLabel,
  parseEsignSendsFromApi,
  parseEsignStatusFromApi,
  type DealEsignDropboxDetail,
} from "../utils/investorEsignStatus"
import {
  logInvestorsApiResponseDebug,
  logInvestorsDataTableDebug,
} from "../tabs/investors/investorsTabDebug"
import type { AddInvestmentFormValues } from "../tabs/deal_members/add-investment/add_deal_member_types"
import type {
  DealInvestorEsignSendStatus,
  DealInvestorEsignStatus,
  DealInvestorRow,
  DealInvestorsKpis,
  DealInvestorsPayload,
  DealMembersPayload,
} from "../types/deal-investors.types"
import { emptyDealMembersPayload } from "../types/deal-investors.types"
import type {
  DealInvestorClass,
  DealInvestorClassFormValues,
} from "../types/deal-investor-class.types"
import {
  DEFAULT_ASSET_COUNTRY,
  type AssetStepDraft,
  type DealListRow,
  type DealStepDraft,
} from "../types/deals.types"
import {
  formatCommittedFromRawParts,
  formatCommittedZeroUsd,
  formatCurrencyTableDisplay,
} from "../utils/offeringMoneyFormat"
import {
  DEFAULT_OFFERING_VISIBILITY,
  mapLegacyOfferingVisibility,
  OFFERING_VISIBILITY_OPTIONS,
} from "../utils/offeringOverviewForm"
import {
  DealSaasPaymentRequiredError,
  parseDealSaasPaymentRequiredBody,
} from "../utils/dealSaasAccess"
import {
  parseExtraCompanyUserPaymentBody,
  type ExtraCompanyUserPaymentRequired,
} from "../utils/extraCompanyUserBilling"

export { DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER } from "../constants/investor-profile"

export interface DealDetailApi {
  id: string
  dealName: string
  dealType: string
  dealStage: string
  secType: string
  closeDate: string | null
  owningEntityName: string
  fundsRequiredBeforeGpSign: boolean
  autoSendFundingInstructions: boolean
  propertyName: string
  country: string
  /** Street line 1 (matches `address_line_1` from API). */
  addressLine1?: string
  addressLine2?: string
  city: string
  state?: string
  zipCode?: string
  assetImagePath: string | null
  createdAt: string
  /** When API sends a dedicated deal offering size (snake_case normalized here). */
  offeringSize?: string | null
  /** Sanitized HTML for “Summary for all investors” (Offering details). */
  investorSummaryHtml?: string
  /** Cover image URL chosen from gallery (dashboard + preview hero). */
  galleryCoverImageUrl?: string
  /** JSON string: Key Highlights rows `{ id, metric, newClass, isPreset }[]`. */
  keyHighlightsJson?: string
  /** JSON string: Funding Info (payment methods + investment fee). */
  fundingInstructionsJson?: string
  /** Plain text; shown at top of deal detail for everyone with access. */
  dealAnnouncementTitle?: string
  dealAnnouncementMessage?: string
  /** Offering workflow status (Overview). */
  offeringStatus?: string
  offeringVisibility?: string
  showOnInvestbase?: boolean
  internalName?: string
  /** Asset row ids selected for offering overview (persisted). */
  offeringOverviewAssetIds?: string[]
  /** Investor class selected on Offering overview (drives public offering economics). */
  offeringOverviewClassId?: string | null
  /** Upload-relative paths for offering gallery (persisted for public preview). */
  offeringGalleryPaths?: string[]
  /** Encrypted `preview` query value; persisted on `add_deal_form` for share links. */
  offeringPreviewToken?: string | null
  /** False when the signed-in viewer is a co-sponsor (or LP) on this deal. */
  viewerCanEditDeal?: boolean
  viewerIsLeadSponsor?: boolean
  suggestedPlanId?: string | null
  needsPlanUpgrade?: boolean
  billingPlanId?: string | null
  /**
   * JSON string `{ v, visibility, sections }` for offering preview (documents + investor toggles).
   * Synced to the server for the shared preview link.
   */
  offeringInvestorPreviewJson?: string | null
  /** Archived deals are hidden from active lists; offering share is disabled. */
  archived?: boolean
  listRow: DealListRow
}

function authHeaders(options?: {
  omitActiveOrganization?: boolean
}): HeadersInit {
  const h = { ...portalAuthHeaders(options) } as Record<string, string>
  if (options?.omitActiveOrganization) {
    h[PORTAL_OMIT_ACTIVE_ORG_HEADER] = "1"
  }
  return h
}

/**
 * Same member directory as User Management — for Add Investment Member dropdown.
 */
export async function fetchUsersForMemberSelect(): Promise<
  Record<string, unknown>[]
> {
  const base = getApiV1Base()
  if (!base) return []
  try {
    const res = await fetch(`${base}/users`, {
      headers: { ...authHeaders() },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as { users?: unknown }
    if (!res.ok) return []
    const list = data.users
    if (!Array.isArray(list)) return []
    return list.filter(
      (x): x is Record<string, unknown> =>
        x !== null && typeof x === "object" && !Array.isArray(x),
    )
  } catch {
    return []
  }
}

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback
  if (typeof v === "string") return v
  return String(v)
}

function firstDefined(
  raw: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const k of keys) {
    if (k in raw && raw[k] != null && raw[k] !== "") return raw[k]
  }
  return undefined
}

/** Key highlights JSON from API (camelCase or snake_case). Empty string is valid; do not use firstDefined (it skips ""). */
function pickKeyHighlightsJsonFromDealPayload(
  raw: Record<string, unknown>,
): string {
  if ("keyHighlightsJson" in raw && raw.keyHighlightsJson != null) {
    return String(raw.keyHighlightsJson)
  }
  if ("key_highlights_json" in raw && raw.key_highlights_json != null) {
    return String(raw.key_highlights_json)
  }
  return ""
}

function pickFundingInstructionsJsonFromDealPayload(
  raw: Record<string, unknown>,
): string {
  if ("fundingInstructionsJson" in raw && raw.fundingInstructionsJson != null) {
    return String(raw.fundingInstructionsJson)
  }
  if (
    "funding_instructions_json" in raw &&
    raw.funding_instructions_json != null
  ) {
    return String(raw.funding_instructions_json)
  }
  return ""
}

function pickDealAnnouncementField(
  raw: Record<string, unknown>,
  camel: string,
  snake: string,
): string {
  if (camel in raw && raw[camel] != null) return String(raw[camel])
  if (snake in raw && raw[snake] != null) return String(raw[snake])
  return ""
}

/** Ensures every list field exists so table cells / sort accessors never throw. */
function normalizeDealListRow(
  raw: Partial<DealListRow> & Record<string, unknown>,
  index: number,
): DealListRow {
  const r = raw as Record<string, unknown>
  const idVal = firstDefined(r, ["id", "deal_id"])
  const loc = firstDefined(r, ["locationDisplay", "location_display"])
  const createdAtVal = firstDefined(r, ["createdAt", "created_at"])
  const assetImg =
    firstDefined(r, ["assetImagePath", "asset_image_path"]) ?? r.assetImagePath
  const assetImagePath =
    assetImg != null && String(assetImg).trim() !== ""
      ? String(assetImg)
      : null

  const totalInProgressVal = str(
    firstDefined(r, ["totalInProgress", "total_in_progress"]) ??
      raw.totalInProgress,
    "—",
  )
  const createdDateDisplay = str(
    firstDefined(r, ["createdDateDisplay", "created_date_display"]) ??
      raw.createdDateDisplay,
    "—",
  )
  const startRaw = firstDefined(r, [
    "startDateDisplay",
    "start_date_display",
    "startDate",
    "start_date",
  ])
  const startDateDisplay =
    startRaw != null && String(startRaw).trim() !== ""
      ? str(startRaw)
      : createdDateDisplay

  const invRaw = firstDefined(r, [
    "investmentsDisplay",
    "investments_display",
    "investments",
  ])
  const investmentsDisplay =
    invRaw != null && String(invRaw).trim() !== ""
      ? str(invRaw)
      : totalInProgressVal

  const archivedVal = (() => {
    const a = firstDefined(r, ["archived", "is_archived", "isArchived"])
    if (a === true || a === "true" || a === 1 || a === "1") return true
    if (a === false || a === "false" || a === 0 || a === "0") return false
    return Boolean(raw.archived)
  })()

  const galleryCoverRaw = firstDefined(r, [
    "galleryCoverImageUrl",
    "gallery_cover_image_url",
  ])
  const galleryCoverImageUrl =
    galleryCoverRaw != null && String(galleryCoverRaw).trim() !== ""
      ? str(galleryCoverRaw)
      : undefined

  return {
    id: str(idVal ?? raw.id, `row-${index}`),
    dealName: str(firstDefined(r, ["dealName", "deal_name"]) ?? raw.dealName),
    dealType: str(firstDefined(r, ["dealType", "deal_type"]) ?? raw.dealType),
    dealStage: str(
      firstDefined(r, ["dealStage", "deal_stage"]) ?? raw.dealStage,
    ),
    totalInProgress: totalInProgressVal,
    totalAccepted: str(
      firstDefined(r, ["totalAccepted", "total_accepted"]) ??
        raw.totalAccepted,
      "—",
    ),
    raiseTarget: str(
      firstDefined(r, ["raiseTarget", "raise_target"]) ?? raw.raiseTarget,
      "—",
    ),
    distributions: str(
      firstDefined(r, ["distributions"]) ?? raw.distributions,
      "—",
    ),
    investors: str(
      firstDefined(r, ["investors", "investor_count", "investorCount"]) ??
        raw.investors,
      "—",
    ),
    closeDateDisplay: str(
      firstDefined(r, ["closeDateDisplay", "close_date_display"]) ??
        raw.closeDateDisplay,
      "—",
    ),
    createdDateDisplay,
    startDateDisplay,
    investmentsDisplay,
    investorClass: str(
      firstDefined(r, ["investorClass", "investor_class", "investor_class_label"]) ??
        raw.investorClass,
      "—",
    ),
    archived: archivedVal,
    locationDisplay:
      loc != null ? str(loc) : raw.locationDisplay != null
        ? str(raw.locationDisplay)
        : undefined,
    createdAt:
      createdAtVal != null
        ? str(createdAtVal)
        : raw.createdAt != null
          ? str(raw.createdAt)
          : undefined,
    assetImagePath,
    secType: str(firstDefined(r, ["secType", "sec_type"]) ?? raw.secType),
    owningEntityName: str(
      firstDefined(r, ["owningEntityName", "owning_entity_name"]) ??
        raw.owningEntityName,
    ),
    propertyName: str(
      firstDefined(r, ["propertyName", "property_name"]) ?? raw.propertyName,
    ),
    city: str(firstDefined(r, ["city"]) ?? raw.city),
    offeringStatus: (() => {
      const rawStatus = firstDefined(r, ["offeringStatus", "offering_status"])
      return rawStatus != null ? str(rawStatus) : undefined
    })(),
    investmentType: str(
      firstDefined(r, ["investmentType", "investment_type"]) ??
        raw.investmentType,
      "—",
    ),
    propertyType: str(
      firstDefined(r, ["propertyType", "property_type"]) ?? raw.propertyType,
      "—",
    ),
    ...(galleryCoverImageUrl !== undefined
      ? { galleryCoverImageUrl }
      : {}),
    ...(() => {
      const v = firstDefined(r, ["rosterReadable", "roster_readable"])
      if (v === true || v === "true" || v === 1 || v === "1") {
        return { rosterReadable: true as const }
      }
      if (v === false || v === "false" || v === 0 || v === "0") {
        return { rosterReadable: false as const }
      }
      return {}
    })(),
    ...(firstDefined(r, ["yourRole", "your_role"]) != null
      ? {
          yourRole: str(
            firstDefined(r, ["yourRole", "your_role"]) ?? raw.yourRole,
          ),
        }
      : {}),
    ...(() => {
      const lead = firstDefined(r, [
        "viewerIsLeadSponsor",
        "viewer_is_lead_sponsor",
      ])
      const isLead =
        lead === true || lead === "true" || lead === 1 || lead === "1"
      const nextRaw = firstDefined(r, [
        "nextBillingDate",
        "next_billing_date",
      ])
      const nextBillingDate =
        nextRaw != null && String(nextRaw).trim() !== ""
          ? str(nextRaw)
          : null
      const startRaw = firstDefined(r, [
        "saasBillingStartsAt",
        "saas_billing_starts_at",
      ])
      const saasBillingStartsAt =
        startRaw != null && String(startRaw).trim() !== ""
          ? str(startRaw)
          : null
      const statusRaw = firstDefined(r, [
        "billingSubscriptionStatus",
        "billing_subscription_status",
      ])
      const planRaw = firstDefined(r, ["billingPlanId", "billing_plan_id"])
      const suggestedRaw = firstDefined(r, [
        "suggestedPlanId",
        "suggested_plan_id",
      ])
      const upgradeRaw = firstDefined(r, [
        "needsPlanUpgrade",
        "needs_plan_upgrade",
      ])
      const lockedRaw = firstDefined(r, [
        "billingAccessLocked",
        "billing_access_locked",
      ])
      const lockReasonRaw = firstDefined(r, [
        "billingLockReason",
        "billing_lock_reason",
      ])
      const hasBilling =
        nextBillingDate != null ||
        saasBillingStartsAt != null ||
        statusRaw != null ||
        planRaw != null ||
        suggestedRaw != null ||
        upgradeRaw != null ||
        lockedRaw != null
      if (!isLead && !hasBilling) return {}
      const lockReason = String(lockReasonRaw ?? "").trim().toLowerCase()
      return {
        ...(isLead ? { viewerIsLeadSponsor: true as const } : {}),
        nextBillingDate,
        saasBillingStartsAt,
        billingSubscriptionStatus:
          statusRaw != null ? str(statusRaw) : undefined,
        billingPlanId: planRaw != null ? str(planRaw) : null,
        suggestedPlanId:
          suggestedRaw != null && String(suggestedRaw).trim() !== ""
            ? str(suggestedRaw)
            : null,
        ...(upgradeRaw === true ||
        upgradeRaw === "true" ||
        upgradeRaw === 1 ||
        upgradeRaw === "1"
          ? { needsPlanUpgrade: true as const }
          : {}),
        ...(lockedRaw === true ||
        lockedRaw === "true" ||
        lockedRaw === 1 ||
        lockedRaw === "1"
          ? { billingAccessLocked: true as const }
          : lockedRaw === false ||
              lockedRaw === "false" ||
              lockedRaw === 0 ||
              lockedRaw === "0"
            ? { billingAccessLocked: false as const }
            : {}),
        ...(lockReason === "unpaid" ||
        lockReason === "expired" ||
        lockReason === "past_due"
          ? { billingLockReason: lockReason }
          : {}),
      }
    })(),
    ...(() => {
      const raw = firstDefined(r, [
        "viewerCanEditDeal",
        "viewer_can_edit_deal",
      ])
      if (raw === true || raw === "true" || raw === 1 || raw === "1") {
        return { viewerCanEditDeal: true as const }
      }
      if (raw === false || raw === "false" || raw === 0 || raw === "0") {
        return { viewerCanEditDeal: false as const }
      }
      return {}
    })(),
  }
}

/** Returns normalized rows, or [] if the API is unreachable, unauthorized, or has no deals. */
export async function fetchDealsList(options?: {
  /** Syndication org deals plus deals where the user is on the roster (`assigning_deal_user`). */
  includeParticipantDeals?: boolean
  /**
   * Scope to one customer org (platform admin drill-in). Omit on the main dashboard
   * so platform admins receive the full deal roster.
   */
  organizationId?: string
}): Promise<DealListRow[]> {
  const base = getApiV1Base()
  if (!base) return []
  const includeParticipantDeals = options?.includeParticipantDeals === true
  const params = new URLSearchParams()
  if (includeParticipantDeals) {
    params.set("includeParticipantDeals", "1")
  } else {
    const explicitOrg = options?.organizationId?.trim()
    if (explicitOrg && isAccessibleCompanyId(explicitOrg)) {
      params.set("organizationId", explicitOrg)
    } else if (!isPlatformAdmin()) {
      const activeOrg = organizationIdQueryParam()
      if (activeOrg && isAccessibleCompanyId(activeOrg)) {
        params.set("organizationId", activeOrg)
      }
    }
  }
  const q = params.toString() ? `?${params.toString()}` : ""
  try {
    const res = await fetch(`${base}/deals${q}`, {
      headers: {
        ...authHeaders(
          includeParticipantDeals ? { omitActiveOrganization: true } : undefined,
        ),
      },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      deals?: unknown[]
    }
    if (!res.ok) return []
    if (!Array.isArray(data.deals)) return []
    return data.deals.map((item, i) =>
      normalizeDealListRow(
        (item != null && typeof item === "object"
          ? item
          : {}) as Partial<DealListRow> & Record<string, unknown>,
        i,
      ),
    )
  } catch {
    return []
  }
}

/** Platform admin: deals for a single customer organization (`organization_id` on add_deal_form). */
export async function fetchDealsListForOrganization(
  organizationId: string,
): Promise<{ deals: DealListRow[]; error?: string }> {
  const id = organizationId.trim()
  const base = getApiV1Base()
  if (!base || !id) return { deals: [] }
  try {
    const res = await fetch(
      `${base}/deals?organizationId=${encodeURIComponent(id)}`,
      {
        headers: { ...authHeaders() },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      deals?: unknown[]
      message?: string
    }
    if (!res.ok) {
      return {
        deals: [],
        error: data.message || `Could not load deals (${res.status})`,
      }
    }
    if (!Array.isArray(data.deals)) return { deals: [] }
    return {
      deals: data.deals.map((item, i) =>
        normalizeDealListRow(
          (item != null && typeof item === "object"
            ? item
            : {}) as Partial<DealListRow> & Record<string, unknown>,
          i,
        ),
      ),
    }
  } catch {
    return { deals: [], error: "Unable to connect." }
  }
}

/** Normalizes GET/PATCH deal payloads (snake_case, optional fields). */
export function normalizeDealDetailApi(
  d: DealDetailApi & Record<string, unknown>,
): DealDetailApi {
  const offeringSizeRaw = firstDefined(d, [
    "offeringSize",
    "offering_size",
  ])
  const offeringSize =
    offeringSizeRaw != null && String(offeringSizeRaw).trim() !== ""
      ? str(offeringSizeRaw)
      : undefined
  const summaryRaw = firstDefined(d, [
    "investorSummaryHtml",
    "investor_summary_html",
  ])
  const investorSummaryHtml =
    summaryRaw != null ? str(summaryRaw) : ""
  const coverRaw = firstDefined(d, [
    "galleryCoverImageUrl",
    "gallery_cover_image_url",
  ])
  const galleryCoverImageUrl =
    coverRaw != null ? str(coverRaw) : ""
  const keyHighlightsJson = pickKeyHighlightsJsonFromDealPayload(d)
  const fundingInstructionsJson = pickFundingInstructionsJsonFromDealPayload(d)
  const dealAnnouncementTitle = pickDealAnnouncementField(
    d,
    "dealAnnouncementTitle",
    "deal_announcement_title",
  )
  const dealAnnouncementMessage = pickDealAnnouncementField(
    d,
    "dealAnnouncementMessage",
    "deal_announcement_message",
  )
  const offeringStatusRaw = firstDefined(d, [
    "offeringStatus",
    "offering_status",
  ])
  const offeringVisibilityRaw = firstDefined(d, [
    "offeringVisibility",
    "offering_visibility",
  ])
  const showOnInvestbaseRaw = firstDefined(d, [
    "showOnInvestbase",
    "show_on_investbase",
  ])
  const internalNameRaw = firstDefined(d, ["internalName", "internal_name"])
  const offeringStatus =
    offeringStatusRaw != null ? str(offeringStatusRaw) : ""
  const visStr =
    offeringVisibilityRaw != null ? str(offeringVisibilityRaw) : ""
  const visMapped = visStr ? mapLegacyOfferingVisibility(visStr) : ""
  const offeringVisibility = OFFERING_VISIBILITY_OPTIONS.some(
    (o) => o.value === visMapped,
  )
    ? visMapped
    : DEFAULT_OFFERING_VISIBILITY
  const showOnInvestbase =
    showOnInvestbaseRaw === true ||
    showOnInvestbaseRaw === "true" ||
    showOnInvestbaseRaw === 1 ||
    showOnInvestbaseRaw === "1"
  const internalName =
    internalNameRaw != null ? str(internalNameRaw) : ""
  const offeringPreviewTokenRaw = firstDefined(d, [
    "offeringPreviewToken",
    "offering_preview_token",
  ])
  const offeringPreviewToken =
    offeringPreviewTokenRaw != null && String(offeringPreviewTokenRaw).trim() !== ""
      ? str(offeringPreviewTokenRaw)
      : null
  const offeringInvestorPreviewJsonRaw = firstDefined(d, [
    "offeringInvestorPreviewJson",
    "offering_investor_preview_json",
  ])
  const offeringInvestorPreviewJson =
    offeringInvestorPreviewJsonRaw != null &&
    String(offeringInvestorPreviewJsonRaw).trim() !== ""
      ? str(offeringInvestorPreviewJsonRaw)
      : null
  const archivedRaw = firstDefined(d, ["archived", "is_archived", "isArchived"])
  const archivedFromListRow =
    d.listRow &&
    typeof d.listRow === "object" &&
    Boolean((d.listRow as { archived?: boolean }).archived)
  const archived =
    archivedRaw === true ||
    archivedRaw === "true" ||
    archivedRaw === 1 ||
    archivedRaw === "1" ||
    Boolean(d.archived) ||
    archivedFromListRow
  const assetIdsRaw = firstDefined(d, [
    "offeringOverviewAssetIds",
    "offering_overview_asset_ids",
  ])
  let offeringOverviewAssetIds: string[] = []
  if (Array.isArray(assetIdsRaw)) {
    offeringOverviewAssetIds = assetIdsRaw.filter(
      (x): x is string => typeof x === "string",
    )
  } else if (typeof assetIdsRaw === "string" && assetIdsRaw.trim()) {
    try {
      const p = JSON.parse(assetIdsRaw) as unknown
      if (Array.isArray(p)) {
        offeringOverviewAssetIds = p.filter(
          (x): x is string => typeof x === "string",
        )
      }
    } catch {
      offeringOverviewAssetIds = []
    }
  }

  const offeringOverviewClassIdRaw = firstDefined(d, [
    "offeringOverviewClassId",
    "offering_overview_class_id",
  ])
  const offeringOverviewClassId =
    offeringOverviewClassIdRaw != null &&
    String(offeringOverviewClassIdRaw).trim() !== ""
      ? str(offeringOverviewClassIdRaw)
      : null

  const galleryPathsRaw = firstDefined(d, [
    "offeringGalleryPaths",
    "offering_gallery_paths",
  ])
  let offeringGalleryPaths: string[] = []
  if (Array.isArray(galleryPathsRaw)) {
    offeringGalleryPaths = galleryPathsRaw.filter(
      (x): x is string => typeof x === "string",
    )
  } else if (typeof galleryPathsRaw === "string" && galleryPathsRaw.trim()) {
    try {
      const p = JSON.parse(galleryPathsRaw) as unknown
      if (Array.isArray(p)) {
        offeringGalleryPaths = p.filter(
          (x): x is string => typeof x === "string",
        )
      }
    } catch {
      offeringGalleryPaths = []
    }
  }

  const dealNameRaw = firstDefined(d, ["dealName", "deal_name"])
  const dealName =
    dealNameRaw !== undefined ? str(dealNameRaw) : str(d.dealName ?? "")
  const dealTypeRaw = firstDefined(d, ["dealType", "deal_type"])
  const dealType =
    dealTypeRaw !== undefined ? str(dealTypeRaw) : str(d.dealType ?? "")
  const dealStageRaw = firstDefined(d, ["dealStage", "deal_stage"])
  const dealStage =
    dealStageRaw !== undefined ? str(dealStageRaw) : str(d.dealStage ?? "")

  const assetImgRaw = firstDefined(d, ["assetImagePath", "asset_image_path"])
  const assetImagePath =
    assetImgRaw != null && String(assetImgRaw).trim() !== ""
      ? str(assetImgRaw)
      : null

  const addressLine1 = str(
    firstDefined(d, ["addressLine1", "address_line_1"]) ?? d.addressLine1 ?? "",
  )
  const addressLine2 = str(
    firstDefined(d, ["addressLine2", "address_line_2"]) ?? d.addressLine2 ?? "",
  )
  const stateNorm = str(firstDefined(d, ["state"]) ?? d.state ?? "")
  const zipCodeNorm = str(
    firstDefined(d, ["zipCode", "zip_code"]) ?? d.zipCode ?? "",
  )

  const lr = d.listRow
  const listRow =
    lr && typeof lr === "object"
      ? ({
          ...lr,
          dealName: dealName || str(lr.dealName ?? ""),
          dealType: dealType || str(lr.dealType ?? ""),
          dealStage: dealStage || str(lr.dealStage ?? ""),
        } as DealListRow)
      : lr

  return {
    ...d,
    dealName,
    dealType,
    dealStage,
    ...(listRow !== undefined ? { listRow } : {}),
    investorSummaryHtml,
    galleryCoverImageUrl,
    keyHighlightsJson,
    fundingInstructionsJson,
    dealAnnouncementTitle,
    dealAnnouncementMessage,
    offeringStatus,
    offeringVisibility,
    showOnInvestbase,
    internalName,
    offeringOverviewAssetIds,
    offeringOverviewClassId,
    offeringGalleryPaths,
    assetImagePath,
    addressLine1,
    addressLine2,
    state: stateNorm,
    zipCode: zipCodeNorm,
    ...(offeringSize !== undefined ? { offeringSize } : {}),
    offeringPreviewToken,
    offeringInvestorPreviewJson,
    archived,
    ...(() => {
      const raw = firstDefined(d, [
        "viewerCanEditDeal",
        "viewer_can_edit_deal",
      ])
      if (raw === true || raw === "true" || raw === 1 || raw === "1") {
        return { viewerCanEditDeal: true as const }
      }
      if (raw === false || raw === "false" || raw === 0 || raw === "0") {
        return { viewerCanEditDeal: false as const }
      }
      return {}
    })(),
  }
}

export async function fetchDealById(dealId: string): Promise<DealDetailApi> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const res = await fetch(`${base}/deals/${encodeURIComponent(dealId)}`, {
    headers: { ...authHeaders({ omitActiveOrganization: true }) },
    credentials: "include",
  })
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi
    message?: string
    code?: string
  }
  if (!res.ok) {
    if (res.status === 402) {
      throw new DealSaasPaymentRequiredError(
        parseDealSaasPaymentRequiredBody(data, dealId) ?? {
          id: dealId,
          dealName: "",
        },
        data.message,
      )
    }
    throw new Error(data.message || `Could not load deal (${res.status})`)
  }
  if (!data.deal) throw new Error("Invalid response")
  const d = data.deal as DealDetailApi & Record<string, unknown>
  return normalizeDealDetailApi(d)
}

export type OfferingPreviewTokenResponse = {
  token: string
  sponsorRef?: string | null
}

/**
 * Authenticated: encrypted token for LP preview URLs (hides deal UUID).
 * When the viewer is a sponsor on the deal, also returns a sponsor-specific `ref` token.
 */
export async function fetchOfferingPreviewToken(
  dealId: string,
  options?: { sponsorContactId?: string },
): Promise<OfferingPreviewTokenResponse> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const params = new URLSearchParams()
  const sponsorContactId = options?.sponsorContactId?.trim()
  if (sponsorContactId) params.set("sponsor_contact_id", sponsorContactId)
  const q = params.toString()
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/offering-preview-token${q ? `?${q}` : ""}`,
    {
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    token?: string
    previewToken?: string
    sponsorRef?: string | null
    message?: string
  }
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `Could not get preview token (${res.status})`,
    )
  }
  const t = data.token ?? data.previewToken
  if (typeof t !== "string" || !t.trim()) {
    throw new Error("Invalid preview token response.")
  }
  return {
    token: t.trim(),
    sponsorRef:
      typeof data.sponsorRef === "string" && data.sponsorRef.trim()
        ? data.sponsorRef.trim()
        : null,
  }
}

export type OfferingPreviewShareEmailFailure = {
  email: string
  message: string
}

export type OfferingPreviewShareEmailResponse = {
  sent: number
  failures: OfferingPreviewShareEmailFailure[]
  previewUrl?: string
  message?: string
}

/** Email the public offering preview link to the given addresses (authenticated). */
export async function postOfferingPreviewShareByEmail(
  dealId: string,
  emails: string[],
): Promise<OfferingPreviewShareEmailResponse> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/offering-preview-share-email`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ emails }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as OfferingPreviewShareEmailResponse & {
    message?: string
  }
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `Could not send emails (${res.status})`,
    )
  }
  return {
    sent: Number(data.sent) || 0,
    failures: Array.isArray(data.failures) ? data.failures : [],
    previewUrl:
      typeof data.previewUrl === "string" ? data.previewUrl : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
  }
}

function publicOfferingPortfolioPagePrefix(): string {
  const rawBase = import.meta.env.BASE_URL ?? "/"
  const baseSeg =
    rawBase === "/" || rawBase === "./"
      ? ""
      : rawBase.replace(/^\/+/, "").replace(/\/+$/, "")
  return baseSeg ? `/${baseSeg}` : ""
}

/** LP share link (no login): `/offering_portfolio?preview=<encrypted token>[&ref=<sponsor ref>]`. */
export function buildPublicOfferingPreviewPageUrl(
  previewToken: string,
  options?: { sponsorRef?: string | null },
): string {
  const prefix = publicOfferingPortfolioPagePrefix()
  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  const params = new URLSearchParams()
  params.set("preview", previewToken)
  const ref = options?.sponsorRef?.trim()
  if (ref) params.set("ref", ref)
  return `${origin}${prefix}/offering_portfolio?${params.toString()}`
}

/**
 * Fallback when the encrypted token API is unavailable: same page with plain deal UUID
 * (backend `resolvePublicPreviewDealId` accepts legacy `preview=<uuid>`).
 */
export function buildLegacyPublicOfferingPreviewPageUrl(dealId: string): string {
  const prefix = publicOfferingPortfolioPagePrefix()
  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  const params = new URLSearchParams()
  params.set("preview", dealId.trim())
  return `${origin}${prefix}/offering_portfolio?${params.toString()}`
}

const OFFERING_PREVIEW_DEAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isDealUuidForOfferingPreview(id: string): boolean {
  return Boolean(id?.trim() && OFFERING_PREVIEW_DEAL_UUID_RE.test(id.trim()))
}

/**
 * Authenticated: full public offering preview URL for clipboard (encrypted `preview` token).
 * Falls back to legacy `preview=<deal uuid>` when the token endpoint fails but `dealId` is a UUID
 * (same behavior as the Offering Preview page share control).
 */
export async function buildDealOfferingPreviewShareUrl(
  dealId: string,
  options?: {
    previewToken?: string | null
    sponsorRef?: string | null
    sponsorContactId?: string
  },
): Promise<string> {
  const id = dealId.trim()
  if (!id) throw new Error("Missing deal id.")
  const cachedToken = options?.previewToken?.trim()
  const cachedRef = options?.sponsorRef?.trim()
  if (cachedToken) {
    return buildPublicOfferingPreviewPageUrl(cachedToken, {
      sponsorRef: cachedRef,
    })
  }
  try {
    const { token, sponsorRef } = await fetchOfferingPreviewToken(id, {
      sponsorContactId: options?.sponsorContactId,
    })
    return buildPublicOfferingPreviewPageUrl(token, {
      sponsorRef: cachedRef ?? sponsorRef,
    })
  } catch {
    if (isDealUuidForOfferingPreview(id))
      return buildLegacyPublicOfferingPreviewPageUrl(id)
    throw new Error("Could not create offering preview link.")
  }
}

/**
 * Unauthenticated preview for LPs. `previewQueryValue` is the encrypted token (or legacy plain UUID).
 * Backend returns the same deal / classes / KPIs / investors payload shape as the authenticated investors endpoint.
 */
export async function fetchPublicOfferingPreview(
  previewQueryValue: string,
  options?: { sponsorRef?: string | null },
): Promise<{
  deal: DealDetailApi
  investorClasses: DealInvestorClass[]
  investorsPayload: DealInvestorsPayload
  referringSponsorDisplayName?: string
  referringSponsorRef?: string
}> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const params = new URLSearchParams()
  params.set("preview", previewQueryValue)
  const ref = options?.sponsorRef?.trim()
  if (ref) params.set("ref", ref)
  const res = await fetch(
    `${base}/public/offering-preview?${params.toString()}`,
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `Could not load preview (${res.status})`,
    )
  }
  const dealRaw = data.deal
  if (!dealRaw || typeof dealRaw !== "object") {
    throw new Error("Invalid response")
  }
  const deal = normalizeDealDetailApi(
    dealRaw as DealDetailApi & Record<string, unknown>,
  )
  const list = extractInvestorClassesPayload(data)
  const investorClasses: DealInvestorClass[] = Array.isArray(list)
    ? list
        .filter(
          (x): x is Record<string, unknown> =>
            x != null && typeof x === "object",
        )
        .map((x, i) => {
          try {
            return normalizeInvestorClass(x, i)
          } catch {
            return null
          }
        })
        .filter((x): x is DealInvestorClass => x != null)
    : []
  const investorsPayload = normalizeDealInvestorsResponse({
    kpis: data.kpis,
    investors: data.investors,
  })
  const referringSponsorDisplayName =
    typeof data.referringSponsorDisplayName === "string"
      ? data.referringSponsorDisplayName.trim()
      : typeof data.referring_sponsor_display_name === "string"
        ? data.referring_sponsor_display_name.trim()
        : undefined
  const referringSponsorRef =
    typeof data.referringSponsorRef === "string"
      ? data.referringSponsorRef.trim()
      : typeof data.referring_sponsor_ref === "string"
        ? data.referring_sponsor_ref.trim()
        : undefined
  return {
    deal,
    investorClasses,
    investorsPayload,
    ...(referringSponsorDisplayName
      ? { referringSponsorDisplayName }
      : {}),
    ...(referringSponsorRef ? { referringSponsorRef } : {}),
  }
}

export async function patchDealInvestorSummary(
  dealId: string,
  investorSummaryHtml: string,
): Promise<
  { ok: true; deal: DealDetailApi } | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/investor-summary`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ investor_summary_html: investorSummaryHtml }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return { ok: true, deal: normalizeDealDetailApi(data.deal) }
  }
  return {
    ok: false,
    message: data.message || `Could not save summary (${res.status})`,
  }
}

export async function fetchDealOfferingInvestorPreviewJson(
  dealId: string,
): Promise<string | null> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/offering-investor-preview`,
    {
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    offeringInvestorPreviewJson?: string | null
    message?: string
  }
  if (!res.ok) {
    throw new Error(
      data.message || `Could not load offering documents (${res.status})`,
    )
  }
  const raw = data.offeringInvestorPreviewJson
  if (raw == null || !String(raw).trim()) return null
  return String(raw)
}

export async function patchDealOfferingInvestorPreview(
  dealId: string,
  body: {
    visibility: Record<string, boolean>
    sections: unknown[]
    offeringDocuments?: unknown[]
  },
): Promise<DealDetailApi> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/offering-investor-preview`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return normalizeDealDetailApi(data.deal)
  }
  throw new Error(
    data.message || `Could not save offering preview (${res.status})`,
  )
}

export async function patchDealKeyHighlights(
  dealId: string,
  keyHighlightsJson: string,
): Promise<
  { ok: true; deal: DealDetailApi } | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/key-highlights`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ key_highlights_json: keyHighlightsJson }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return { ok: true, deal: normalizeDealDetailApi(data.deal) }
  }
  return {
    ok: false,
    message: data.message || `Could not save key highlights (${res.status})`,
  }
}

export async function patchDealFundingInstructions(
  dealId: string,
  fundingInstructionsJson: string,
): Promise<
  { ok: true; deal: DealDetailApi } | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/funding-instructions`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        funding_instructions_json: fundingInstructionsJson,
      }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return { ok: true, deal: normalizeDealDetailApi(data.deal) }
  }
  return {
    ok: false,
    message:
      data.message || `Could not save funding instructions (${res.status})`,
  }
}

export async function syncCompletedEsignDocumentsToDocumentsTab(
  dealId: string,
): Promise<
  | { ok: true; offeringInvestorPreviewJson: string | null }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/documents/sync-esign-completed`,
    {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    offeringInvestorPreviewJson?: string | null
    message?: string
  }
  if (res.status === 200) {
    return {
      ok: true,
      offeringInvestorPreviewJson: data.offeringInvestorPreviewJson ?? null,
    }
  }
  return {
    ok: false,
    message:
      data.message || `Could not sync esign documents (${res.status})`,
  }
}

export type DealSponsorEsignSignerOption = {
  rowId: string
  name: string
  email: string
  role: string
}

export type DealSponsorEsignSignSessionResult =
  | {
      ok: true
      alreadyCompleted: boolean
      needsSignerSelection?: boolean
      provider: "signflow" | "dropbox"
      signUrl: string | null
      clientId: string | null
      testMode: boolean
      configured: boolean
      signatureRequestId: string
      embedApiKey?: string | null
      appBaseUrl?: string | null
      documentId?: string | null
      canAssignSigner: boolean
      signerOptions: DealSponsorEsignSignerOption[]
      assignedSignerEmail: string
      assignedSignerName: string
    }
  | {
      ok: false
      message: string
      code?: string
      waitingFor?: "sponsor" | "investor" | "prior_investor"
    }

export async function fetchDealSponsorEsignSignSession(
  dealId: string,
  signatureRequestId: string,
  assigneeMemberRowId?: string,
): Promise<DealSponsorEsignSignSessionResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  }
  const q = new URLSearchParams()
  q.set("signatureRequestId", signatureRequestId.trim())
  if (assigneeMemberRowId?.trim()) {
    q.set("assigneeMemberRowId", assigneeMemberRowId.trim())
  }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/sponsor-esign-sign-session?${q}`,
    {
      headers: authHeaders(),
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      ok: false,
      message:
        typeof data.message === "string"
          ? data.message
          : `Could not load sponsor signing session (${res.status})`,
      ...(typeof data.code === "string" ? { code: data.code } : {}),
      ...(data.waitingFor === "sponsor" ||
      data.waitingFor === "investor" ||
      data.waitingFor === "prior_investor"
        ? { waitingFor: data.waitingFor }
        : {}),
    }
  }
  return {
    ok: true,
    alreadyCompleted: Boolean(data.alreadyCompleted),
    needsSignerSelection: Boolean(data.needsSignerSelection),
    provider:
      data.provider === "signflow" || data.provider === "dropbox"
        ? data.provider
        : "signflow",
    signUrl: typeof data.signUrl === "string" ? data.signUrl : null,
    clientId: typeof data.clientId === "string" ? data.clientId : null,
    testMode: Boolean(data.testMode),
    configured: data.configured !== false,
    signatureRequestId: String(data.signatureRequestId ?? signatureRequestId),
    embedApiKey:
      typeof data.embedApiKey === "string" ? data.embedApiKey : null,
    appBaseUrl: typeof data.appBaseUrl === "string" ? data.appBaseUrl : null,
    documentId: typeof data.documentId === "string" ? data.documentId : null,
    canAssignSigner: Boolean(data.canAssignSigner),
    signerOptions: Array.isArray(data.signerOptions)
      ? data.signerOptions
          .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
          .map((o) => ({
            rowId: String(o.rowId ?? "").trim(),
            name: String(o.name ?? "").trim() || "—",
            email: String(o.email ?? "").trim(),
            role: String(o.role ?? "").trim() || "Sponsor",
          }))
          .filter((o) => o.rowId && o.email)
      : [],
    assignedSignerEmail: String(data.assignedSignerEmail ?? "").trim(),
    assignedSignerName: String(data.assignedSignerName ?? "").trim(),
  }
}

export async function postDealSponsorEsignSync(
  dealId: string,
  signatureRequestId: string,
): Promise<
  | { ok: true; offeringInvestorPreviewJson: string | null }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/sponsor-esign-sync`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ signatureRequestId }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    offeringInvestorPreviewJson?: string | null
    message?: string
  }
  if (res.status === 200) {
    return {
      ok: true,
      offeringInvestorPreviewJson: data.offeringInvestorPreviewJson ?? null,
    }
  }
  return {
    ok: false,
    message:
      data.message || `Could not sync sponsor eSign (${res.status})`,
  }
}

export type OfferingOverviewPayload = {
  offeringStatus: string
  offeringVisibility: string
  dealName: string
  dealType: string
  offeringOverviewAssetIds: string[]
  offeringOverviewClassId?: string | null
}

export async function patchDealOfferingOverview(
  dealId: string,
  payload: OfferingOverviewPayload,
): Promise<
  | { ok: true; deal: DealDetailApi }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/offering-overview`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          offering_status: payload.offeringStatus,
          offering_visibility: payload.offeringVisibility,
          deal_name: payload.dealName,
          deal_type: payload.dealType,
          offering_overview_asset_ids: payload.offeringOverviewAssetIds,
          ...(payload.offeringOverviewClassId !== undefined
            ? {
                offering_overview_class_id: payload.offeringOverviewClassId,
              }
            : {}),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      deal?: DealDetailApi & Record<string, unknown>
      message?: string
      errors?: Record<string, string>
    }
    if (res.status === 200 && data.deal) {
      return { ok: true, deal: normalizeDealDetailApi(data.deal) }
    }
    if (res.status === 400 && data.errors) {
      return {
        ok: false,
        message: data.message || "Validation failed",
        fieldErrors: data.errors,
      }
    }
    return {
      ok: false,
      message:
        data.message || `Could not save offering overview (${res.status})`,
    }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "Network error while saving offering overview.",
    }
  }
}

export async function patchDealAnnouncement(
  dealId: string,
  title: string,
  message: string,
): Promise<
  { ok: true; deal: DealDetailApi } | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/deal-announcement`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        deal_announcement_title: title,
        deal_announcement_message: message,
      }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return { ok: true, deal: normalizeDealDetailApi(data.deal) }
  }
  return {
    ok: false,
    message: data.message || `Could not save announcement (${res.status})`,
  }
}

export async function patchDealOfferingGallery(
  dealId: string,
  offeringGalleryPaths: string[],
): Promise<
  { ok: true; deal: DealDetailApi } | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/offering-gallery`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        offering_gallery_paths: offeringGalleryPaths,
      }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return { ok: true, deal: normalizeDealDetailApi(data.deal) }
  }
  return {
    ok: false,
    message: data.message || `Could not save gallery (${res.status})`,
  }
}

/** Upload new gallery files to the server (Add Asset / offering images) so public preview can load them. */
async function postSingleDealGalleryImageUpload(
  dealId: string,
  file: File,
): Promise<
  | { ok: true; deal: DealDetailApi; newPaths: string[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const form = new FormData()
  form.append("galleryFiles", file, file.name)
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/offering-gallery-uploads`,
      {
        method: "POST",
        headers: { ...authHeaders() },
        body: form,
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      deal?: DealDetailApi & Record<string, unknown>
      newPaths?: unknown
      message?: string
    }
    if (!res.ok) {
      const status = res.status
      const fromServer =
        typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : ""
      let msg =
        fromServer ||
        (status ? `Upload failed (HTTP ${status}).` : "Upload failed (unknown status).")
      if (status === 502 || status === 503 || status === 504) {
        const hint =
          "The dev server could not connect to the API. Start the backend (e.g. `npm run dev` in the `backend` folder) and ensure the port matches `BACKEND_PORT` / the Vite proxy, or set `VITE_DEV_API_PROXY` in the frontend `.env` to your API base URL. Check the terminal where Vite is running for proxy errors."
        if (import.meta.env.DEV) {
          msg = fromServer ? `${fromServer} ${hint}` : hint
        } else {
          msg = fromServer || msg
        }
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- dev-only upload diagnostics
        console.warn("postSingleDealGalleryImageUpload", res.status, msg)
      }
      return { ok: false, message: msg }
    }
    if (res.status === 200 && data.deal) {
      const np = data.newPaths
      const newPaths = Array.isArray(np)
        ? np.filter((x): x is string => typeof x === "string")
        : []
      return {
        ok: true,
        deal: normalizeDealDetailApi(data.deal),
        newPaths,
      }
    }
    return {
      ok: false,
      message: "Server did not confirm the gallery upload.",
    }
  } catch (e) {
    const message =
      e instanceof Error && e.message
        ? e.message
        : "Network error while uploading."
    return { ok: false, message }
  }
}

export async function postDealOfferingGalleryUploads(
  dealId: string,
  files: File[],
): Promise<
  | { ok: true; deal: DealDetailApi; newPaths: string[] }
  | { ok: false; message: string }
> {
  if (!dealId.trim())
    return { ok: false, message: "Missing deal id." }
  if (files.length === 0)
    return { ok: false, message: "No images to upload." }
  const fileKey = (f: File) => `${f.name}\0${f.size}\0${f.lastModified}`
  const seen = new Set<string>()
  const unique: File[] = []
  for (const f of files) {
    if (typeof f.size === "number" && f.size <= 0) {
      return { ok: false, message: "Choose a non-empty image file." }
    }
    if (typeof f.size === "number" && f.size > MAX_DEAL_IMAGE_FILE_BYTES) {
      return { ok: false, message: "Image too large (max 20 MB each)." }
    }
    const k = fileKey(f)
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(f)
  }
  let materialized: File[]
  try {
    materialized = await materializeDealImageFiles(unique)
  } catch (e) {
    const message =
      e instanceof Error && e.message
        ? e.message
        : "Could not read the selected image file."
    return { ok: false, message }
  }
  const allNewPaths: string[] = []
  let lastDeal: DealDetailApi | null = null
  for (const f of materialized) {
    const one = await postSingleDealGalleryImageUpload(dealId, f)
    if (!one.ok) return one
    if (one.newPaths.length > 0) allNewPaths.push(...one.newPaths)
    lastDeal = one.deal
  }
  if (!lastDeal) {
    return { ok: false, message: "Server did not return deal details after upload." }
  }
  return { ok: true, deal: lastDeal, newPaths: allNewPaths }
}

const DEAL_OFFERING_DOCUMENT_EXTS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
])

const DEAL_OFFERING_DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

export const DEAL_OFFERING_DOCUMENT_ACCEPT = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",")

export const DEAL_OFFERING_DOCUMENT_TYPES_LABEL =
  "PDF, Word, PowerPoint, or Excel"

/** Documents tab: max files and size per upload request. */
export const MAX_DEAL_OFFERING_DOCUMENT_FILES = 50
export const MAX_DEAL_OFFERING_DOCUMENT_FILE_BYTES = 100 * 1024 * 1024
export const DEAL_OFFERING_DOCUMENT_LIMITS_HINT = "Up to 50 files, 100 MB each"

function offeringDocumentExt(fileName: string): string {
  const name = fileName.trim().toLowerCase()
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return ""
  return name.slice(dot + 1)
}

/** Offering document uploads (Documents tab): PDF, Word, PowerPoint, Excel. */
export function isDealOfferingDocumentFile(file: File): boolean {
  const ext = offeringDocumentExt(file.name)
  if (!DEAL_OFFERING_DOCUMENT_EXTS.has(ext)) return false
  const mime = file.type.trim().toLowerCase()
  if (
    mime === "" ||
    mime === "application/octet-stream" ||
    DEAL_OFFERING_DOCUMENT_MIMES.has(mime)
  ) {
    return true
  }
  if (
    mime.startsWith("application/vnd.ms-") ||
    mime.startsWith("application/vnd.openxmlformats-officedocument.")
  ) {
    return true
  }
  return false
}

export function dealOfferingDocumentRejectMessage(
  rejectedNames: string[],
): string {
  if (rejectedNames.length === 1) {
    return `"${rejectedNames[0]!}" is not supported. Upload ${DEAL_OFFERING_DOCUMENT_TYPES_LABEL} files.`
  }
  return `Only ${DEAL_OFFERING_DOCUMENT_TYPES_LABEL} files can be uploaded. Skipped: ${rejectedNames.join(", ")}.`
}

export function dealOfferingDocumentTooLargeMessage(fileName: string): string {
  return `"${fileName}" is too large (max 100 MB each).`
}

/** Upload offering documents (Documents tab) so preview / investors get stable `/uploads/...` links. */
export async function postDealOfferingDocumentUploads(
  dealId: string,
  files: File[],
): Promise<
  | { ok: true; newPaths: string[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  if (files.length === 0)
    return { ok: false, message: "No documents to upload." }
  if (files.length > MAX_DEAL_OFFERING_DOCUMENT_FILES) {
    return {
      ok: false,
      message: "Too many documents (max 50 per upload).",
    }
  }
  const nonAllowed = files.filter((f) => !isDealOfferingDocumentFile(f))
  if (nonAllowed.length > 0) {
    return {
      ok: false,
      message: dealOfferingDocumentRejectMessage(
        nonAllowed.map((f) => f.name),
      ),
    }
  }
  const tooLarge = files.find(
    (f) =>
      typeof f.size === "number" &&
      f.size > MAX_DEAL_OFFERING_DOCUMENT_FILE_BYTES,
  )
  if (tooLarge) {
    return {
      ok: false,
      message: dealOfferingDocumentTooLargeMessage(tooLarge.name),
    }
  }
  const fd = new FormData()
  for (const f of files) fd.append("documentFiles", f)
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/offering-document-uploads`,
    {
      method: "POST",
      headers: { ...authHeaders() },
      body: fd,
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    newPaths?: unknown
    message?: string
  }
  if (res.status === 200) {
    const np = data.newPaths
    const newPaths = Array.isArray(np)
      ? np.filter((x): x is string => typeof x === "string")
      : []
    return { ok: true, newPaths }
  }
  return {
    ok: false,
    message:
      data.message || `Could not upload documents (${res.status})`,
  }
}

export async function patchDealGalleryCover(
  dealId: string,
  galleryCoverImageUrl: string | null,
): Promise<
  { ok: true; deal: DealDetailApi } | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/gallery-cover`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        gallery_cover_image_url: galleryCoverImageUrl,
      }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    deal?: DealDetailApi & Record<string, unknown>
    message?: string
  }
  if (res.status === 200 && data.deal) {
    return { ok: true, deal: normalizeDealDetailApi(data.deal) }
  }
  return {
    ok: false,
    message: data.message || `Could not save cover image (${res.status})`,
  }
}

function normalizeInvestorClass(
  raw: Record<string, unknown>,
  index: number,
): DealInvestorClass {
  return {
    id: str(raw.id, `ic-${index}`),
    dealId: str(raw.dealId ?? raw.deal_id),
    name: str(
      firstDefined(raw, [
        "name",
        "className",
        "class_name",
        "title",
        "label",
        "investor_class_name",
      ]) ?? raw.name,
    ),
    subscriptionType: str(raw.subscriptionType ?? raw.subscription_type),
    entityName: str(raw.entityName ?? raw.entity_name),
    startDate: str(raw.startDate ?? raw.start_date),
    offeringSize: str(raw.offeringSize ?? raw.offering_size),
    raiseAmountDistributions: str(
      raw.raiseAmountDistributions ?? raw.raise_amount_distributions,
    ),
    billingRaiseQuota: str(
      raw.billingRaiseQuota ?? raw.billing_raise_quota,
    ),
    minimumInvestment: str(
      raw.minimumInvestment ?? raw.minimum_investment,
    ),
    numberOfUnits: str(raw.numberOfUnits ?? raw.number_of_units),
    pricePerUnit: str(raw.pricePerUnit ?? raw.price_per_unit),
    status: str(raw.status, "draft"),
    visibility: str(raw.visibility),
    advancedOptionsJson: str(
      raw.advancedOptionsJson ?? raw.advanced_options_json,
      "{}",
    ),
    createdAt: str(raw.createdAt ?? raw.created_at),
    updatedAt: str(raw.updatedAt ?? raw.updated_at),
  }
}

function extractInvestorClassesPayload(data: Record<string, unknown>): unknown[] {
  const direct =
    data.investorClasses ??
    data.investor_classes ??
    data.classes ??
    data.items
  if (Array.isArray(direct)) return direct
  const nested = data.data
  if (Array.isArray(nested)) return nested
  if (nested != null && typeof nested === "object") {
    const n = nested as Record<string, unknown>
    const inner =
      n.investorClasses ?? n.investor_classes ?? n.classes ?? n.items
    if (Array.isArray(inner)) return inner
  }
  return []
}

export async function fetchDealInvestorClasses(
  dealId: string,
): Promise<DealInvestorClass[]> {
  const base = getApiV1Base()
  if (!base) return []
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/investor-classes`,
      {
        // Match fetchDealById / fetchDealInvestors — LP invest-now is user-scoped, not active-org-scoped.
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return []
    const list = extractInvestorClassesPayload(data)
    if (!Array.isArray(list) || list.length === 0) return []
    return list
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x, i) => {
        try {
          return normalizeInvestorClass(x, i)
        } catch {
          return null
        }
      })
      .filter((x): x is DealInvestorClass => x != null)
  } catch {
    return []
  }
}

function jsonBody(values: DealInvestorClassFormValues): Record<string, string> {
  return {
    name: values.name,
    subscription_type: values.subscriptionType,
    entity_name: values.entityName,
    start_date: values.startDate,
    offering_size: values.offeringSize,
    raise_amount_distributions: values.raiseAmountDistributions,
    billing_raise_quota: values.billingRaiseQuota,
    minimum_investment: values.minimumInvestment,
    number_of_units: values.numberOfUnits,
    price_per_unit: values.pricePerUnit,
    status: values.status,
    visibility: values.visibility,
    advanced_options_json: JSON.stringify(values.advanced),
  }
}

export async function createDealInvestorClass(
  dealId: string,
  values: DealInvestorClassFormValues,
): Promise<DealInvestorClass> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/investor-classes`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(jsonBody(values)),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    investorClass?: Record<string, unknown>
  }
  if (!res.ok)
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  const c = data.investorClass
  if (!c || typeof c !== "object") throw new Error("Invalid response")
  return normalizeInvestorClass(c as Record<string, unknown>, 0)
}

export async function updateDealInvestorClass(
  dealId: string,
  classId: string,
  values: DealInvestorClassFormValues,
): Promise<DealInvestorClass> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/investor-classes/${encodeURIComponent(classId)}`,
    {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(jsonBody(values)),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    investorClass?: Record<string, unknown>
  }
  if (!res.ok)
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  const c = data.investorClass
  if (!c || typeof c !== "object") throw new Error("Invalid response")
  return normalizeInvestorClass(c as Record<string, unknown>, 0)
}

export async function deleteDealInvestorClass(
  dealId: string,
  classId: string,
): Promise<void> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/investor-classes/${encodeURIComponent(classId)}`,
    {
      method: "DELETE",
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  }
}

const AUTOSAVE_PLACEHOLDER_TEXT = "Pending"

/** Default deal title sent on autosave when the name field is empty; must match {@link buildCreateDealFormDataForAutosave}. */
export const AUTOSAVE_DEFAULT_DEAL_NAME = "Untitled deal"

function isAutosavePlaceholderStored(value: string): boolean {
  return value.trim().toLowerCase() === AUTOSAVE_PLACEHOLDER_TEXT.toLowerCase()
}

/** True when the API stored the autosave placeholder instead of a real value. */
export function isDealAutosavePlaceholderText(
  value: string | undefined | null,
): boolean {
  return isAutosavePlaceholderStored(String(value ?? "").trim())
}

/** Trim and drop autosave placeholder tokens for investor-facing copy. */
export function dealDisplayFieldText(
  value: string | undefined | null,
): string {
  const t = String(value ?? "").trim()
  if (!t || isAutosavePlaceholderStored(t)) return ""
  return t
}

/**
 * Maps GET /deals/:id strings into create-wizard controlled fields. Strips autosave
 * placeholders so "Pending" / default "Untitled deal" never show as literal input values.
 */
export function dealDetailFieldForCreateWizard(
  field:
    | "dealName"
    | "secType"
    | "owningEntityName"
    | "propertyName"
    | "city"
    | "streetAddress1"
    | "streetAddress2"
    | "state"
    | "zipCode",
  stored: string | undefined | null,
  detailIncomplete: boolean,
): string {
  const raw = String(stored ?? "")
  const t = raw.trim()
  if (!t) return ""
  if (isAutosavePlaceholderStored(t)) return ""
  if (
    field === "dealName" &&
    detailIncomplete &&
    t.toLowerCase() === AUTOSAVE_DEFAULT_DEAL_NAME.toLowerCase()
  )
    return ""
  return raw
}

/**
 * True when required deal fields still hold autosave placeholders (see
 * {@link buildCreateDealFormDataForAutosave}). Ignores lifecycle stage — sponsors may
 * invite investors while the deal is still in Draft.
 */
export function areRequiredDealDetailFieldsIncomplete(
  d: DealDetailApi,
): boolean {
  if (isAutosavePlaceholderStored(String(d.secType ?? ""))) return true
  if (isAutosavePlaceholderStored(String(d.owningEntityName ?? ""))) return true
  if (isAutosavePlaceholderStored(String(d.propertyName ?? ""))) return true
  if (isAutosavePlaceholderStored(String(d.city ?? ""))) return true
  return false
}

/**
 * True when the create/edit deal form is not fully completed: lifecycle stage is Draft
 * and/or required fields still hold autosave placeholders (see
 * {@link buildCreateDealFormDataForAutosave}).
 */
export function isDealDetailFormIncomplete(d: DealDetailApi): boolean {
  const stage = String(d.dealStage ?? "").trim().toLowerCase()
  if (stage === "draft") return true
  return areRequiredDealDetailFieldsIncomplete(d)
}

/**
 * Same rules as {@link isDealDetailFormIncomplete} for list rows (requires
 * `secType`, `owningEntityName`, `propertyName`, `city` on the row when the API sends them).
 */
export function isDealListRowIncomplete(row: DealListRow): boolean {
  const stage = String(row.dealStage ?? "").trim().toLowerCase()
  if (stage === "draft") return true
  if (isAutosavePlaceholderStored(String(row.secType ?? ""))) return true
  if (isAutosavePlaceholderStored(String(row.owningEntityName ?? ""))) return true
  if (isAutosavePlaceholderStored(String(row.propertyName ?? ""))) return true
  if (isAutosavePlaceholderStored(String(row.city ?? ""))) return true
  return false
}

/** Optional image fields for {@link buildCreateDealFormData} / autosave (edit deal PUT). */
export type CreateDealMultipartImageOptions = {
  /** Upload-relative path segments still on the property (after optional removals). */
  retainedAssetImagePath?: string[]
}

/**
 * Same fields as {@link buildCreateDealFormData}, with placeholders so the API accepts
 * incomplete wizard data during debounced autosave.
 */
export function buildCreateDealFormDataForAutosave(
  deal: DealStepDraft,
  asset: AssetStepDraft,
  imageFiles: File[],
  imageOpts?: CreateDealMultipartImageOptions,
): FormData {
  const dealName = deal.dealName.trim() || AUTOSAVE_DEFAULT_DEAL_NAME
  /** Do not default — create autosave waits until the sponsor picks a stage explicitly. */
  const dealStage = String(deal.dealStage ?? "").trim()
  const secType = deal.secType.trim() || AUTOSAVE_PLACEHOLDER_TEXT
  const owningEntityName =
    deal.owningEntityName.trim() || AUTOSAVE_PLACEHOLDER_TEXT
  const propertyName = asset.propertyName.trim() || AUTOSAVE_PLACEHOLDER_TEXT
  const country =
    (asset.country ?? DEFAULT_ASSET_COUNTRY).trim() || DEFAULT_ASSET_COUNTRY
  const city = asset.city.trim() || AUTOSAVE_PLACEHOLDER_TEXT

  const fd = new FormData()
  fd.append("deal_name", dealName)
  fd.append("deal_type", deal.dealType.trim())
  fd.append("deal_stage", dealStage)
  fd.append("sec_type", secType)
  if (deal.closeDate) fd.append("close_date", deal.closeDate)
  fd.append("owning_entity_name", owningEntityName)
  fd.append(
    "funds_required_before_gp_sign",
    deal.fundsBeforeGpCountersigns === "yes" ? "true" : "false",
  )
  fd.append(
    "auto_send_funding_instructions",
    deal.autoFundingAfterGpCountersigns === "yes" ? "true" : "false",
  )
  fd.append("property_name", propertyName)
  fd.append("country", country)
  fd.append("address_line_1", asset.streetAddress1.trim())
  fd.append("address_line_2", asset.streetAddress2.trim())
  fd.append("city", city)
  fd.append("state", asset.state.trim())
  fd.append("zip_code", asset.zipCode.trim())
  if (imageOpts?.retainedAssetImagePath !== undefined) {
    fd.append(
      "retained_asset_image_path",
      imageOpts.retainedAssetImagePath.join(";"),
    )
  }
  for (const file of imageFiles) {
    fd.append("assetImages", file, file.name)
  }
  return fd
}

export function buildCreateDealFormData(
  deal: DealStepDraft,
  asset: AssetStepDraft,
  imageFiles: File[],
  imageOpts?: CreateDealMultipartImageOptions,
): FormData {
  const fd = new FormData()
  fd.append("deal_name", deal.dealName.trim())
  fd.append("deal_type", deal.dealType)
  fd.append("deal_stage", deal.dealStage)
  fd.append("sec_type", deal.secType.trim())
  if (deal.closeDate) fd.append("close_date", deal.closeDate)
  fd.append("owning_entity_name", deal.owningEntityName.trim())
  fd.append(
    "funds_required_before_gp_sign",
    deal.fundsBeforeGpCountersigns === "yes" ? "true" : "false",
  )
  fd.append(
    "auto_send_funding_instructions",
    deal.autoFundingAfterGpCountersigns === "yes" ? "true" : "false",
  )
  fd.append("property_name", asset.propertyName.trim())
  fd.append("country", asset.country)
  fd.append("address_line_1", asset.streetAddress1.trim())
  fd.append("address_line_2", asset.streetAddress2.trim())
  fd.append("city", asset.city.trim())
  fd.append("state", asset.state.trim())
  fd.append("zip_code", asset.zipCode.trim())
  if (imageOpts?.retainedAssetImagePath !== undefined) {
    fd.append(
      "retained_asset_image_path",
      imageOpts.retainedAssetImagePath.join(";"),
    )
  }
  for (const file of imageFiles) {
    fd.append("assetImages", file, file.name)
  }
  return fd
}

/** Chrome-safe copy of picker files before multipart upload (same as org branding assets). */
export async function materializeDealImageFiles(files: File[]): Promise<File[]> {
  return materializeImageFilesForUpload(files, {
    fallbackBasename: "property-image",
    maxBytes: MAX_DEAL_IMAGE_FILE_BYTES,
  })
}

export async function createDealMultipart(
  formData: FormData,
): Promise<
  | { ok: true; dealId?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(`${base}/deals`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
    credentials: "include",
  })
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    errors?: Record<string, string>
    deal?: { id?: string }
  }
  if (res.status === 201) {
    const rawId = data.deal?.id
    const dealId =
      rawId != null && String(rawId).trim() ? String(rawId).trim() : undefined
    return { ok: true, dealId }
  }
  if (res.status === 400 && data.errors)
    return { ok: false, message: data.message || "Validation failed", fieldErrors: data.errors }
  return {
    ok: false,
    message: data.message || `Could not create deal (${res.status})`,
  }
}

export async function updateDealMultipart(
  dealId: string,
  formData: FormData,
): Promise<
  | { ok: true }
  | {
      ok: false
      message: string
      fieldErrors?: Record<string, string>
      notFound?: boolean
    }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(`${base}/deals/${encodeURIComponent(dealId)}`, {
    method: "PUT",
    headers: { ...authHeaders() },
    body: formData,
    credentials: "include",
  })
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    errors?: Record<string, string>
  }
  if (res.status === 200) return { ok: true }
  if (res.status === 404)
    return {
      ok: false,
      message: data.message || "Deal not found",
      notFound: true,
    }
  if (res.status === 400 && data.errors)
    return { ok: false, message: data.message || "Validation failed", fieldErrors: data.errors }
  return {
    ok: false,
    message: data.message || `Could not update deal (${res.status})`,
  }
}

export async function deleteDeal(
  dealId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(`${base}/deals/${encodeURIComponent(dealId)}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
    credentials: "include",
  })
  if (res.status === 204 || res.status === 200) return { ok: true }
  const data = (await res.json().catch(() => ({}))) as { message?: string }
  return {
    ok: false,
    message: data.message || `Could not delete deal (${res.status})`,
  }
}

export async function patchDealArchived(
  dealId: string,
  archived: boolean,
): Promise<
  | { ok: true; deal: DealListRow }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/archived`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ archived }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    message?: string
    deal?: unknown
  }
  if (!res.ok) {
    return {
      ok: false,
      message: data.message || `Could not update deal (${res.status})`,
    }
  }
  const raw = data.deal
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "Invalid response from server." }
  }
  return {
    ok: true,
    deal: normalizeDealListRow(
      raw as Partial<DealListRow> & Record<string, unknown>,
      0,
    ),
  }
}

function emptyInvestorsKpis(): DealInvestorsKpis {
  const z = "—"
  return {
    offeringSize: z,
    committed: z,
    remaining: z,
    totalApproved: z,
    totalPending: z,
    totalFunded: z,
    approvedCount: z,
    pendingCount: z,
    waitlistCount: z,
    averageApproved: z,
    nonAccreditedCount: z,
  }
}

export function emptyDealInvestorsPayload(): DealInvestorsPayload {
  return { kpis: emptyInvestorsKpis(), investors: [] }
}

function parseExtraContributionAmountsFromRaw(
  raw: Record<string, unknown>,
): string[] {
  const v =
    raw.extraContributionAmounts ?? raw.extra_contribution_amounts
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v) as unknown
      if (Array.isArray(p)) return p.map((x) => String(x))
    } catch {
      /* ignore */
    }
  }
  return []
}

function normalizeInvestorRowApi(
  raw: Record<string, unknown>,
  index: number,
): DealInvestorRow {
  const commitmentAmountRaw = str(
    firstDefined(raw, [
      "commitmentAmountRaw",
      "commitment_amount_raw",
      "commitmentAmount",
      "commitment_amount",
    ]),
  )
  const extras = parseExtraContributionAmountsFromRaw(raw)

  const committedFromApi = firstDefined(raw, [
    "committed",
    "amount_committed",
    "committed_amount",
    "total_committed",
  ])
  const committedTrimmed =
    committedFromApi == null ? "" : String(committedFromApi).trim()
  const hasCommittedString =
    committedTrimmed !== "" && committedTrimmed !== "—"

  /** Sum of deal_investment.commitment_amount + extra_contribution_amounts (DB source of truth). */
  const fromRawParts = formatCommittedFromRawParts(
    commitmentAmountRaw,
    extras,
  )

  /**
   * Show commitment from the investment row first; fall back to API `committed` when raw is absent
   * (e.g. older payloads).
   */
  const committedDisplay =
    fromRawParts !== "—"
      ? fromRawParts
      : hasCommittedString
        ? formatCurrencyTableDisplay(committedTrimmed)
        : formatCommittedZeroUsd()

  const esignStatus =
    parseEsignStatusFromApi(raw.esignStatus ?? raw.esign_status) ??
    parseEsignStatusFromApi(
      raw.esignStatusBundleJson ??
        raw.esign_status_bundle_json ??
        raw.esignStatusJson ??
        raw.esign_status_json,
    )
  const esignStatusBundleJson = String(
    raw.esignStatusBundleJson ??
      raw.esign_status_bundle_json ??
      raw.esignStatusJson ??
      raw.esign_status_json ??
      "",
  ).trim()
  const signedDateRaw = str(
    firstDefined(raw, [
      "signedDate",
      "signed_date",
      "signed",
      "docSignedDate",
      "doc_signed_date",
    ]),
  )

  return {
    id: str(firstDefined(raw, ["id", "investor_id"]) ?? raw.id, `inv-${index}`),
    displayName: str(
      firstDefined(raw, [
        "displayName",
        "display_name",
        "contact_display_name",
        "contactDisplayName",
        "name",
        "full_name",
      ]),
    ),
    entitySubtitle: str(
      firstDefined(raw, [
        "entitySubtitle",
        "entity_subtitle",
        "entity_type",
        "subtitle",
      ]),
    ),
    investorClass: str(
      firstDefined(raw, [
        "investorClass",
        "investor_class",
        "class",
        "investorClassName",
        "investor_class_name",
        "className",
        "class_name",
        "offeringClass",
        "offering_class",
      ]),
    ),
    investorRole: str(
      firstDefined(raw, ["investorRole", "investor_role", "role"]),
    ),
    memberRoleLabels: (() => {
      const v =
        raw.memberRoleLabels ??
        raw.member_role_labels ??
        raw.dealMemberRoleLabels ??
        raw.deal_member_role_labels
      if (!Array.isArray(v)) return undefined
      const out = v
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
      return out.length > 0 ? out : undefined
    })(),
    status: str(
      firstDefined(raw, [
        "status",
        "investment_status",
        "investmentStatus",
      ]),
    ),
    committed: committedDisplay,
    esignStatus,
    esignStatusBundleJson: esignStatusBundleJson || null,
    signedDate: esignWorkflowColumnLabel(esignStatus, signedDateRaw),
    fundedDate: formatDateDdMmmYyyy(
      str(firstDefined(raw, ["fundedDate", "funded_date", "funded"])),
    ),
    selfAccredited: str(
      firstDefined(raw, ["selfAccredited", "self_accredited", "self_acc"]),
      "—",
    ),
    verifiedAccLabel: str(
      firstDefined(raw, [
        "verifiedAccLabel",
        "verified_acc_label",
        "verified_accreditation",
      ]),
      "—",
    ),
    userDisplayName: str(
      firstDefined(raw, [
        "userDisplayName",
        "user_display_name",
        "username",
        "user_name",
        "portal_user",
      ]),
      "—",
    ),
    userEmail: str(
      firstDefined(raw, ["userEmail", "user_email", "email"]),
      "—",
    ),
    firstName: str(
      firstDefined(raw, ["firstName", "first_name"]),
      "",
    ),
    lastName: str(
      firstDefined(raw, ["lastName", "last_name"]),
      "",
    ),
    contactId: str(firstDefined(raw, ["contactId", "contact_id"])),
    profileId: str(firstDefined(raw, ["profileId", "profile_id"])),
    userInvestorProfileId: str(
      firstDefined(raw, ["userInvestorProfileId", "user_investor_profile_id"]),
    ),
    userInvestorProfileName: str(
      firstDefined(raw, [
        "userInvestorProfileName",
        "user_investor_profile_name",
        "savedProfileName",
        "saved_profile_name",
      ]),
    ),
    offeringId: str(firstDefined(raw, ["offeringId", "offering_id"])),
    commitmentAmountRaw:
      commitmentAmountRaw.trim() !== ""
        ? commitmentAmountRaw
        : hasCommittedString
          ? String(committedFromApi).trim()
          : "",
    extraContributionAmounts: extras,
    docSignedDateIso: str(
      firstDefined(raw, [
        "docSignedDateIso",
        "doc_signed_date_iso",
        "docSignedDate",
        "doc_signed_date",
      ]),
    ),
    addedByDisplayName: str(
      firstDefined(raw, [
        "addedByDisplayName",
        "added_by_display_name",
      ]),
      "—",
    ),
    ...(() => {
      const email = firstDefined(raw, ["addedByEmail", "added_by_email"])
      if (email == null || !String(email).trim()) return {}
      return { addedByEmail: String(email).trim() }
    })(),
    ...(() => {
      const adder = firstDefined(raw, ["addedByUserId", "added_by_user_id"]);
      if (adder == null || !String(adder).trim()) return {}
      return { addedByUserId: String(adder).trim() }
    })(),
    ...(() => {
      const v = firstDefined(raw, [
        "addedByIsCoSponsorOnDeal",
        "added_by_is_co_sponsor_on_deal",
      ])
      if (v === true || v === "true" || v === 1 || v === "1") {
        return { addedByIsCoSponsorOnDeal: true as const }
      }
      if (v === false || v === "false" || v === 0 || v === "0") {
        return { addedByIsCoSponsorOnDeal: false as const }
      }
      return {}
    })(),
    ...(() => {
      const v = firstDefined(raw, [
        "addedByCoSponsorEmailIntercept",
        "added_by_co_sponsor_email_intercept",
      ])
      const t = String(v ?? "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
      if (
        t === "no" ||
        t === "no intercept" ||
        t === "false" ||
        t === "0"
      ) {
        return { addedByCoSponsorEmailIntercept: "no" as const }
      }
      if (
        t === "yes" ||
        t === "yes intercept" ||
        t === "true" ||
        t === "1"
      ) {
        return { addedByCoSponsorEmailIntercept: "yes" as const }
      }
      return {}
    })(),
    addedInvestorsCommitted: str(
      firstDefined(raw, [
        "addedInvestorsCommitted",
        "added_investors_committed",
      ]),
      "—",
    ),
    investorKind: (() => {
      const ik = firstDefined(raw, ["investorKind", "investor_kind"])
      if (ik === "lp_roster" || ik === "investment") return ik
      if (ik === "lp_investor") return "lp_roster"
      return undefined
    })(),
    ...(() => {
      const v = firstDefined(raw, [
        "invitationMailSent",
        "invitation_mail_sent",
        "sendInvitationMail",
        "send_invitation_mail",
      ])
      if (v === true) return { invitationMailSent: true as const }
      if (v === false) return { invitationMailSent: false as const }
      const s = String(v ?? "")
        .trim()
        .toLowerCase()
      if (s === "yes" || s === "1" || s === "true" || s === "y")
        return { invitationMailSent: true as const }
      if (s === "no" || s === "0" || s === "false" || s === "n" || s === "")
        return { invitationMailSent: false as const }
      return {}
    })(),
    ...(() => {
      const v = firstDefined(raw, ["fundApproved", "fund_approved"])
      if (v === true) return { fundApproved: true as const }
      if (v === false) return { fundApproved: false as const }
      const s = String(v ?? "")
        .trim()
        .toLowerCase()
      if (s === "true" || s === "1" || s === "yes") return { fundApproved: true as const }
      if (s === "false" || s === "0" || s === "no")
        return { fundApproved: false as const }
      return {}
    })(),
    fundApprovedByUserId: str(
      firstDefined(raw, ["fundApprovedByUserId", "fund_approved_by_user_id", "fundApprovedBy", "fund_approved_by"]),
    ),
    fundApprovedByDisplayName: str(
      firstDefined(raw, ["fundApprovedByDisplayName", "fund_approved_by_display_name"]),
    ),
    fundApprovedAtIso: str(
      firstDefined(raw, ["fundApprovedAtIso", "fund_approved_at_iso", "fundApprovedAt", "fund_approved_at"]),
    ),
    fundApprovedCommitmentSnapshot: str(
      firstDefined(raw, [
        "fundApprovedCommitmentSnapshot",
        "fund_approved_commitment_snapshot",
      ]),
      "",
    ),
    investedAtIso: str(
      firstDefined(raw, ["investedAtIso", "invested_at_iso", "createdAt", "created_at"]),
    ),
    percentOfClassOwnership: str(
      firstDefined(raw, [
        "percentOfClassOwnership",
        "percent_of_class_ownership",
      ]),
      "",
    ),
    percentOfClassDistributions: str(
      firstDefined(raw, [
        "percentOfClassDistributions",
        "percent_of_class_distributions",
      ]),
      "",
    ),
    entityOwnershipPercent: str(
      firstDefined(raw, [
        "entityOwnershipPercent",
        "entity_ownership_percent",
      ]),
      "",
    ),
    distributionAllocationPercent: str(
      firstDefined(raw, [
        "distributionAllocationPercent",
        "distribution_allocation_percent",
      ]),
      "",
    ),
  }
}

function normalizeDealInvestorsResponse(data: unknown): DealInvestorsPayload {
  if (!data || typeof data !== "object") {
    return { kpis: emptyInvestorsKpis(), investors: [] }
  }
  const d = data as Record<string, unknown>
  const inv = d.investors ?? d.rows
  const kpisObj = (d.kpis ?? d.summary ?? {}) as Record<string, unknown>

  const kpis: DealInvestorsKpis = {
    offeringSize: str(
      firstDefined(kpisObj, ["offeringSize", "offering_size"]),
      "—",
    ),
    committed: str(firstDefined(kpisObj, ["committed"]), "—"),
    remaining: str(firstDefined(kpisObj, ["remaining"]), "—"),
    totalApproved: str(
      firstDefined(kpisObj, ["totalApproved", "total_approved"]),
      "—",
    ),
    totalPending: str(
      firstDefined(kpisObj, ["totalPending", "total_pending"]),
      "—",
    ),
    totalFunded: str(
      firstDefined(kpisObj, ["totalFunded", "total_funded"]),
      "—",
    ),
    approvedCount: str(
      firstDefined(kpisObj, ["approvedCount", "approved_count"]),
      "—",
    ),
    pendingCount: str(
      firstDefined(kpisObj, ["pendingCount", "pending_count"]),
      "—",
    ),
    waitlistCount: str(
      firstDefined(kpisObj, ["waitlistCount", "waitlist_count"]),
      "—",
    ),
    averageApproved: str(
      firstDefined(kpisObj, ["averageApproved", "average_approved"]),
      "—",
    ),
    nonAccreditedCount: str(
      firstDefined(kpisObj, ["nonAccreditedCount", "non_accredited_count"]),
      "—",
    ),
  }

  if (!Array.isArray(inv)) return { kpis, investors: [] }
  return {
    kpis,
    investors: inv.map((item, i) =>
      normalizeInvestorRowApi(
        item != null && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {},
        i,
      ),
    ),
  }
}

function normalizeDealMembersResponse(data: unknown): DealMembersPayload {
  if (!data || typeof data !== "object") return emptyDealMembersPayload()
  const d = data as Record<string, unknown>
  const raw = d.members ?? d.rows ?? d.investors
  const members = Array.isArray(raw)
    ? raw.map((item, i) =>
        normalizeInvestorRowApi(
          item != null && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {},
          i,
        ),
      )
    : []
  const viewerDealMemberRole = firstDefined(d, [
    "viewerDealMemberRole",
    "viewer_deal_member_role",
  ])
  const leadSponsorDisplayName = str(
    firstDefined(d, [
      "leadSponsorDisplayName",
      "lead_sponsor_display_name",
    ]),
  )
  const referringSponsorDisplayName = str(
    firstDefined(d, [
      "referringSponsorDisplayName",
      "referring_sponsor_display_name",
    ]),
  )
  const referringSponsorRef = str(
    firstDefined(d, ["referringSponsorRef", "referring_sponsor_ref"]),
  )
  return {
    members,
    ...(viewerDealMemberRole !== undefined ? { viewerDealMemberRole } : {}),
    ...(leadSponsorDisplayName ? { leadSponsorDisplayName } : {}),
    ...(referringSponsorDisplayName ? { referringSponsorDisplayName } : {}),
    ...(referringSponsorRef ? { referringSponsorRef } : {}),
  }
}

/**
 * Loads KPIs + investor rows for the deal detail Investors tab.
 * Expected API: `GET /deals/:dealId/investors` → `{ kpis?: {...}, investors: [...] }`.
 * Pass `lpInvestorsOnly` to limit rows to LP investor role (`lpInvestorsOnly=1`).
 */
export async function fetchDealInvestors(
  dealId: string,
  options?: { lpInvestorsOnly?: boolean },
): Promise<DealInvestorsPayload> {
  const base = getApiV1Base()
  if (!base) {
    console.warn(
      "[InvestorsTab DEBUG] VITE_BASE_URL / API base is not set — investors list is empty",
    )
    return { kpis: emptyInvestorsKpis(), investors: [] }
  }
  try {
    const lpOnly = Boolean(options?.lpInvestorsOnly)
    const q = lpOnly ? "?lpInvestorsOnly=1" : ""
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/investors${q}`,
      {
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = await res.json().catch(() => ({}))
    logInvestorsApiResponseDebug({
      dealId,
      lpInvestorsOnly: lpOnly,
      ok: res.ok,
      status: res.status,
      raw: data,
    })
    if (!res.ok) return { kpis: emptyInvestorsKpis(), investors: [] }
    const normalized = normalizeDealInvestorsResponse(data)
    logInvestorsDataTableDebug({
      context: "after normalizeInvestorRowApi (fetchDealInvestors)",
      dealId,
      rows: normalized.investors,
    })
    return normalized
  } catch (err) {
    console.error("[InvestorsTab DEBUG] fetchDealInvestors failed", err)
    return { kpis: emptyInvestorsKpis(), investors: [] }
  }
}

/** Response from GET /deals/:dealId/commitment-amount?contact_id=… */
export interface DealCommitmentAmountResult {
  dealId: string
  contactId: string
  /** Raw stored `commitment_amount` text, or null when none / blank. */
  commitmentAmount: string | null
  found: boolean
}

/**
 * Latest `commitment_amount` for `(deal_id, contact_id)` (viewer-scoped).
 * @throws If config is missing, ids are blank, or the request fails (401/404/500).
 */
export async function fetchDealCommitmentAmount(
  dealId: string,
  contactId: string,
): Promise<DealCommitmentAmountResult> {
  const did = dealId.trim()
  const cid = contactId.trim()
  if (!did) throw new Error("Missing deal id.")
  if (!cid) throw new Error("Missing contact id.")
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const params = new URLSearchParams()
  params.set("contact_id", cid)
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(did)}/commitment-amount?${params.toString()}`,
    {
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `Could not load commitment amount (${res.status})`,
    )
  }
  const rawAmt = firstDefined(data, [
    "commitmentAmount",
    "commitment_amount",
  ])
  const commitmentAmount =
    rawAmt == null || String(rawAmt).trim() === ""
      ? null
      : String(rawAmt).trim()
  const found =
    typeof data.found === "boolean"
      ? data.found
      : Boolean(commitmentAmount)
  return {
    dealId: str(firstDefined(data, ["dealId", "deal_id"]) ?? did),
    contactId: str(firstDefined(data, ["contactId", "contact_id"]) ?? cid),
    commitmentAmount,
    found,
  }
}

/**
 * GET /deals/:dealId/members — roster from `deal_member` merged with investments
 * (commitment = sum of all `deal_investment` rows per contact on this deal).
 */
export async function fetchDealMembers(
  dealId: string,
  options?: { referringSponsorRef?: string | null },
): Promise<DealMembersPayload> {
  const base = getApiV1Base()
  if (!base) return emptyDealMembersPayload()
  try {
    const params = new URLSearchParams()
    const ref = options?.referringSponsorRef?.trim()
    if (ref) params.set("referring_sponsor_ref", ref)
    const q = params.toString()
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/members${q ? `?${q}` : ""}`,
      {
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return emptyDealMembersPayload()
    return normalizeDealMembersResponse(data)
  } catch {
    return emptyDealMembersPayload()
  }
}

export type CoSponsorEmailIntercept = "yes" | "no"

export async function fetchCoSponsorEmailIntercept(
  dealId: string,
): Promise<{ applicable: boolean; intercept: CoSponsorEmailIntercept | null }> {
  const base = getApiV1Base()
  const did = dealId.trim()
  if (!base || !did) return { applicable: false, intercept: null }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/co-sponsor-email-intercept`,
      {
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { applicable: false, intercept: null }
    const applicable = data.applicable === true
    const raw = String(data.intercept ?? "").trim().toLowerCase()
    const intercept: CoSponsorEmailIntercept | null =
      raw === "no" ? "no" : raw === "yes" ? "yes" : null
    return { applicable, intercept: applicable ? intercept ?? "yes" : null }
  } catch {
    return { applicable: false, intercept: null }
  }
}

export async function patchCoSponsorEmailIntercept(
  dealId: string,
  intercept: CoSponsorEmailIntercept,
): Promise<
  | { ok: true; intercept: CoSponsorEmailIntercept }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  const did = dealId.trim()
  if (!base || !did)
    return { ok: false, message: "VITE_BASE_URL is not configured." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/co-sponsor-email-intercept`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders({ omitActiveOrganization: true }),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ intercept }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      intercept?: unknown
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message: data.message?.trim() || "Could not save intercept setting.",
      }
    }
    const raw = String(data.intercept ?? intercept).trim().toLowerCase()
    return { ok: true, intercept: raw === "no" ? "no" : "yes" }
  } catch {
    return { ok: false, message: "Could not save intercept setting." }
  }
}

/** Resolve sponsor display name from an offering preview `ref` token (Invest Now onboarding). */
export async function fetchReferringSponsorDisplayName(
  dealId: string,
  referringSponsorRef: string,
): Promise<string | null> {
  const base = getApiV1Base()
  const did = dealId.trim()
  const ref = referringSponsorRef.trim()
  if (!base || !did || !ref) return null
  try {
    const params = new URLSearchParams()
    params.set("referring_sponsor_ref", ref)
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/referring-sponsor?${params.toString()}`,
      {
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return null
    const name =
      typeof data.referringSponsorDisplayName === "string"
        ? data.referringSponsorDisplayName.trim()
        : typeof data.referring_sponsor_display_name === "string"
          ? data.referring_sponsor_display_name.trim()
          : ""
    return name && name !== "—" ? name : null
  } catch {
    return null
  }
}

export interface DealReviewSummary {
  reviewRating: number
  reviewCount: number
}

/**
 * Optional enrichment when the list API omits review fields. If you add
 * `GET /deals/:dealId/review-summary` → `{ reviewRating, reviewCount }` (or
 * snake_case), implement a `fetch` here (same pattern as `fetchDealMembers`).
 * The current backend has no such route, so this returns `null` and the
 * dashboard uses `DealListRow.reviewRating` / `reviewCount` from the list.
 */
export async function fetchDealReviewSummary(
  _dealId: string,
): Promise<DealReviewSummary | null> {
  return null
}

export type PostDealMemberInvitationEmailResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * POST `/deals/:dealId/members/send-invitation-email` — sends HTML/text from
 * backend template using SMTP settings in server `.env.local`.
 * Use `invitation_source: "investor"` from the **Investors** tab; `"deal_member"` from **Deal
 * members** and pass the row `Role` in `deal_member_role`.
 */
export async function postDealMemberInvitationEmail(
  dealId: string,
  input: {
    to_email: string
    member_display_name?: string
    invitation_source?: "investor" | "deal_member"
    deal_member_role?: string
    contact_member_id?: string
  },
): Promise<PostDealMemberInvitationEmailResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/members/send-invitation-email`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          to_email: input.to_email.trim(),
          member_display_name: input.member_display_name?.trim() ?? "",
          invitation_source: input.invitation_source ?? "investor",
          deal_member_role: input.deal_member_role?.trim() ?? "",
          ...(input.contact_member_id?.trim()
            ? { contact_member_id: input.contact_member_id.trim() }
            : {}),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      return { ok: false, message: msg || "Could not send email" }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export const DEAL_ESIGN_TEMPLATES_CHANGED_EVENT = "deal-esign-templates-changed"

export type DropboxSignTemplateStatus = "none" | "draft" | "ready"

/** True when template field setup is complete (SignFlow or Dropbox). */
export function isDealEsignTemplateReady(
  file: DealEsignTemplateFileRecord | null | undefined,
): boolean {
  if (!file) return false
  if (file.esignProvider === "signflow") {
    return file.signflowStatus === "ready" && Boolean(file.signflowDocumentId?.trim())
  }
  if (file.esignProvider === "dropbox") {
    return file.dropboxSignStatus === "ready" && Boolean(file.dropboxSignTemplateId?.trim())
  }
  return (
    (file.signflowStatus === "ready" && Boolean(file.signflowDocumentId?.trim())) ||
    (file.dropboxSignStatus === "ready" && Boolean(file.dropboxSignTemplateId?.trim()))
  )
}

export type DealEsignTemplateFileRecord = {
  id: string
  categoryId: string
  relativePath: string
  originalName: string
  uploadedAt: string
  templateName?: string
  includeQuestionnaire?: boolean
  dropboxSignTemplateId?: string
  dropboxSignStatus?: DropboxSignTemplateStatus
  dropboxSignTitle?: string
  dropboxSignSavedAt?: string
  signflowDocumentId?: string
  signflowStatus?: DropboxSignTemplateStatus
  signflowTitle?: string
  signflowSavedAt?: string
  esignProvider?: "dropbox" | "signflow"
  signflowWorkflowType?: "parallel" | "sequential"
  signflowSigningOrder?: "investor_first" | "sponsor_first"
  /** PDF includes appendix W-9 form after the uploaded document. */
  includesW9Appendix?: boolean
  /** True when an investor has a filled preview or signed PDF for this profile template. */
  latestInvestorFilled?: boolean
  latestInvestorFilledSource?: "signed" | "preview"
}

export type EsignTemplateUploadMetaInput = {
  templateName: string
  includeQuestionnaire: boolean
  signflowWorkflowType?: "parallel" | "sequential"
  signflowSigningOrder?: "investor_first" | "sponsor_first"
}

export type FetchDealEsignDropboxSignConfigResult =
  | {
      ok: true
      configured: boolean
      provider?: "signflow" | "dropbox"
      clientId: string | null
      testMode: boolean
      embedApiKey?: string | null
      appBaseUrl?: string | null
      baseUrl?: string | null
    }
  | { ok: false; message: string }

/** Dropbox Sign public config (client id only — API key stays on server). */
export async function fetchDealEsignDropboxSignConfig(): Promise<FetchDealEsignDropboxSignConfigResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(`${base}/deals/esign-templates/dropbox-sign-config`, {
      headers: { ...authHeaders() },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      configured?: unknown
      provider?: unknown
      clientId?: unknown
      testMode?: unknown
      embedApiKey?: unknown
      appBaseUrl?: unknown
      baseUrl?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not load Dropbox Sign config",
      }
    }
    return {
      ok: true,
      configured: Boolean(data.configured),
      provider:
        data.provider === "signflow" || data.provider === "dropbox"
          ? data.provider
          : undefined,
      clientId: typeof data.clientId === "string" ? data.clientId : null,
      testMode: Boolean(data.testMode),
      embedApiKey:
        typeof data.embedApiKey === "string" ? data.embedApiKey : null,
      appBaseUrl: typeof data.appBaseUrl === "string" ? data.appBaseUrl : null,
      baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : null,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PostDealEsignEmbeddedDraftResult =
  | {
      ok: true
      provider?: "signflow" | "dropbox"
      editUrl: string
      templateId: string
      expiresAt: number
      clientId: string
      testMode: boolean
      embedApiKey?: string | null
      appBaseUrl?: string | null
      hasDocuments: boolean
      filesByCategory: Record<string, DealEsignTemplateFileRecord[]>
    }
  | { ok: false; message: string }

/**
 * Starts Dropbox Sign embedded template draft (server: create_embedded_draft).
 * Returns edit_url for hellosign-embedded modal.
 */
export async function postDealEsignEmbeddedDraft(
  dealId: string,
  fileId: string,
  options?: { title?: string },
): Promise<PostDealEsignEmbeddedDraftResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}/embedded-draft`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ title: options?.title?.trim() ?? "" }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      provider?: unknown
      editUrl?: unknown
      templateId?: unknown
      expiresAt?: unknown
      clientId?: unknown
      testMode?: unknown
      embedApiKey?: unknown
      appBaseUrl?: unknown
      hasDocuments?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "The server did not return a template editor session. Check Dropbox Sign configuration and try again.",
      }
    }
    const editUrl = typeof data.editUrl === "string" ? data.editUrl : ""
    const templateId = typeof data.templateId === "string" ? data.templateId : ""
    const clientId = typeof data.clientId === "string" ? data.clientId : ""
    const provider =
      data.provider === "signflow" || data.provider === "dropbox"
        ? data.provider
        : undefined
    if (!editUrl || !templateId || (provider !== "signflow" && !clientId)) {
      return { ok: false, message: "Invalid embedded draft response" }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      provider,
      editUrl,
      templateId,
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0,
      clientId,
      testMode: Boolean(data.testMode),
      embedApiKey:
        typeof data.embedApiKey === "string" ? data.embedApiKey : null,
      appBaseUrl: typeof data.appBaseUrl === "string" ? data.appBaseUrl : null,
      hasDocuments: Boolean(data.hasDocuments),
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PostDealEsignCompleteEmbeddedTemplateResult =
  | {
      ok: true
      hasDocuments: boolean
      templatesFullyConfigured?: boolean
      filesByCategory: Record<string, DealEsignTemplateFileRecord[]>
    }
  | { ok: false; message: string }

export type PostDealEsignAddInvestorDataFieldResult =
  | {
      ok: true
      esignLabel: string
      label: string
      fieldCount: number
    }
  | { ok: false; message: string }

/** Place an investor-profile data field onto the open SignFlow draft. */
export async function postDealEsignAddInvestorDataField(
  dealId: string,
  fileId: string,
  fieldKey: string,
  profileIds?: string[],
): Promise<PostDealEsignAddInvestorDataFieldResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}/add-investor-data-field`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          fieldKey,
          profileIds: profileIds ?? [],
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      esignLabel?: unknown
      label?: unknown
      fieldCount?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "Could not add investor data field",
      }
    }
    return {
      ok: true,
      esignLabel:
        typeof data.esignLabel === "string" ? data.esignLabel : fieldKey,
      label: typeof data.label === "string" ? data.label : fieldKey,
      fieldCount: typeof data.fieldCount === "number" ? data.fieldCount : 0,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

/** Persists template_id after sponsor saves in embedded editor. */
export async function postDealEsignCompleteEmbeddedTemplate(
  dealId: string,
  fileId: string,
  input: {
    templateId: string
    title?: string
    dropboxSignTemplateId?: string
    signflowDocumentId?: string
  },
): Promise<PostDealEsignCompleteEmbeddedTemplateResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}/complete-embedded-template`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          dropboxSignTemplateId: input.dropboxSignTemplateId?.trim() ?? input.templateId?.trim(),
          signflowDocumentId: input.signflowDocumentId?.trim() ?? input.templateId?.trim(),
          templateId: input.templateId?.trim(),
          title: input.title?.trim() ?? "",
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      hasDocuments?: unknown
      templatesFullyConfigured?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not save template",
      }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      hasDocuments: Boolean(data.hasDocuments),
      templatesFullyConfigured:
        typeof data.templatesFullyConfigured === "boolean"
          ? data.templatesFullyConfigured
          : undefined,
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type FetchDealEsignTemplatesResult =
  | {
      ok: true
      hasDocuments: boolean
      /** Server-computed: every uploaded template is eSign-ready. */
      templatesFullyConfigured?: boolean
      filesByCategory: Record<string, DealEsignTemplateFileRecord[]>
    }
  | { ok: false; message: string }

/**
 * Read-only preview URL for an eSign template (W-9 merged on server when needed).
 */
export async function fetchDealEsignTemplateViewUrl(
  dealId: string,
  fileId: string,
  options?: { profileId?: string },
): Promise<
  | {
      ok: true
      viewUrl: string
      displayName: string
      isPdf: boolean
    }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const params = new URLSearchParams()
    const profileId = options?.profileId?.trim()
    if (profileId) params.set("profile_id", profileId)
    const q = params.toString()
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}/view-url${q ? `?${q}` : ""}`,
      {
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      viewUrl?: unknown
      displayName?: unknown
      isPdf?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not open document",
      }
    }
    const viewUrl = typeof data.viewUrl === "string" ? data.viewUrl.trim() : ""
    if (!viewUrl) {
      return { ok: false, message: "Preview URL is not available" }
    }
    return {
      ok: true,
      viewUrl,
      displayName:
        typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : "Document",
      isPdf: Boolean(data.isPdf),
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function fetchDealEsignTemplates(
  dealId: string,
  options?: { profileId?: string },
): Promise<FetchDealEsignTemplatesResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const params = new URLSearchParams()
    const profileId = options?.profileId?.trim()
    if (profileId) params.set("profile_id", profileId)
    const q = params.toString()
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates${q ? `?${q}` : ""}`,
      {
        headers: { ...authHeaders({ omitActiveOrganization: true }) },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      hasDocuments?: unknown
      templatesFullyConfigured?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not load eSign templates",
      }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      hasDocuments: Boolean(data.hasDocuments),
      templatesFullyConfigured:
        typeof data.templatesFullyConfigured === "boolean"
          ? data.templatesFullyConfigured
          : undefined,
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PostDealEsignTemplateUploadsResult =
  | {
      ok: true
      hasDocuments: boolean
      filesByCategory: Record<string, DealEsignTemplateFileRecord[]>
    }
  | { ok: false; message: string }

export async function postDealEsignTemplateUploads(
  dealId: string,
  categoryId: string,
  uploads: Array<{ file: File; meta: EsignTemplateUploadMetaInput }>,
): Promise<PostDealEsignTemplateUploadsResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  if (uploads.length === 0) {
    return { ok: false, message: "No documents to upload." }
  }
  if (uploads.length > 1) {
    return {
      ok: false,
      message: "Only one file can be uploaded per profile type.",
    }
  }
  const fd = new FormData()
  fd.append("categoryId", categoryId)
  fd.append(
    "templateMeta",
    JSON.stringify(
      uploads.map((u) => ({
        templateName: u.meta.templateName,
        includeQuestionnaire: u.meta.includeQuestionnaire,
        signflowWorkflowType: u.meta.signflowWorkflowType,
        signflowSigningOrder: u.meta.signflowSigningOrder,
      })),
    ),
  )
  for (const u of uploads) {
    fd.append("esignFiles", u.file, u.file.name || "template.pdf")
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-template-uploads`,
      {
        method: "POST",
        headers: { ...authHeaders() },
        body: fd,
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      hasDocuments?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      const fromServer =
        typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : ""
      return {
        ok: false,
        message:
          fromServer ||
          (res.status
            ? `Could not upload eSign template (HTTP ${res.status}).`
            : "Could not upload eSign templates"),
      }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      hasDocuments: Boolean(data.hasDocuments),
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function patchDealEsignTemplateName(
  dealId: string,
  fileId: string,
  templateName: string,
): Promise<FetchDealEsignTemplatesResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ templateName: templateName.trim() }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      hasDocuments?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "Could not update template name",
      }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      hasDocuments: Boolean(data.hasDocuments),
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function patchDealEsignTemplateSigningWorkflow(
  dealId: string,
  fileId: string,
  settings: {
    signflowWorkflowType: "parallel" | "sequential"
    signflowSigningOrder: "investor_first" | "sponsor_first"
  },
): Promise<FetchDealEsignTemplatesResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(settings),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      hasDocuments?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "Could not update signing workflow",
      }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      hasDocuments: Boolean(data.hasDocuments),
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function deleteDealEsignTemplateFile(
  dealId: string,
  fileId: string,
): Promise<FetchDealEsignTemplatesResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/esign-templates/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: { ...authHeaders() },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      hasDocuments?: unknown
      filesByCategory?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not remove file",
      }
    }
    const filesByCategory =
      data.filesByCategory &&
      typeof data.filesByCategory === "object" &&
      !Array.isArray(data.filesByCategory)
        ? (data.filesByCategory as Record<string, DealEsignTemplateFileRecord[]>)
        : {}
    return {
      ok: true,
      hasDocuments: Boolean(data.hasDocuments),
      filesByCategory,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export function notifyDealEsignTemplatesChanged(dealId: string): void {
  window.dispatchEvent(
    new CustomEvent(DEAL_ESIGN_TEMPLATES_CHANGED_EVENT, {
      detail: { dealId },
    }),
  )
}

export type InvestorQuestionnaireFieldType =
  | "text"
  | "phone"
  | "address"
  | "date"
  | "ssn"
  | "ein"
  | "boolean"
  | "textarea"
  | "paragraph"
  | "radio"
  | "checkboxes"

export type InvestorQuestionnaireSection = {
  id: string
  label: string
  sortOrder: number
  isDefault?: boolean
}

export type InvestorQuestionnaireQuestion = {
  id: string
  sectionId: string
  label: string
  sortOrder: number
  required: boolean
  fieldType: InvestorQuestionnaireFieldType
  subtext?: string
  options?: string[]
  isDefault?: boolean
  investorProfileFieldKey?: string
}

export type InvestorQuestionnaireProfileSectionVisibility = Record<
  string,
  Record<string, boolean>
>

export type InvestorQuestionnaireConfig = {
  v: 1
  sections: InvestorQuestionnaireSection[]
  questions: InvestorQuestionnaireQuestion[]
  profileSectionVisibility?: InvestorQuestionnaireProfileSectionVisibility
}

export type FetchDealInvestorQuestionnaireResult =
  | { ok: true; config: InvestorQuestionnaireConfig }
  | { ok: false; message: string }

export async function fetchDealInvestorQuestionnaire(
  dealId: string,
): Promise<FetchDealInvestorQuestionnaireResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/investor-questionnaire`,
      { headers: { ...authHeaders() }, credentials: "include" },
    )
    const data = (await res.json().catch(() => ({}))) as {
      config?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "Could not load investor questionnaire",
      }
    }
    const config = data.config as InvestorQuestionnaireConfig | undefined
    if (
      !config ||
      config.v !== 1 ||
      !Array.isArray(config.sections) ||
      !Array.isArray(config.questions)
    ) {
      return { ok: false, message: "Invalid questionnaire response" }
    }
    return { ok: true, config }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PutDealInvestorQuestionnaireResult =
  | { ok: true; config: InvestorQuestionnaireConfig }
  | { ok: false; message: string }

export async function putDealInvestorQuestionnaire(
  dealId: string,
  config: InvestorQuestionnaireConfig,
): Promise<PutDealInvestorQuestionnaireResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/investor-questionnaire`,
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ config }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      config?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "Could not save investor questionnaire",
      }
    }
    const saved = data.config as InvestorQuestionnaireConfig | undefined
    if (
      !saved ||
      saved.v !== 1 ||
      !Array.isArray(saved.sections) ||
      !Array.isArray(saved.questions)
    ) {
      return { ok: false, message: "Invalid questionnaire response" }
    }
    return { ok: true, config: saved }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PostDealInvestorSendEsignResult =
  | { ok: true }
  | { ok: false; message: string }


export type DealMyEsignDocument = {
  fileId: string
  name: string
  url: string | null
  status: "pending" | "signed"
  categoryId?: string
  signatureRequestId?: string
}

export type DealMyEsignDocumentsResult = {
  documents: DealMyEsignDocument[]
  esignCompleted: boolean
  esignPending: boolean
  /** Sequential eSign: signed PDFs hidden until every investor has signed. */
  investorPortalDocumentsGateOpen?: boolean
  /** Sequential eSign: investor may sign now (prior signers finished). */
  sequentialSignTurnOpen?: boolean
  /** Sequential eSign: waiting for prior signers — no Sign action yet. */
  awaitingSequentialSignTurn?: boolean
  /** Sequential eSign: investor signed; waiting for sponsor counter-sign on their packet. */
  awaitingSponsorCounterSign?: boolean
  /** Sent | Viewed | Signed | Completed — same workflow as Investors tab Signed column. */
  workflowLabel?: string | null
  completedAt?: string | null
  sentAt?: string | null
  loadError?: string | null
}

export type DealMyEsignSignSessionResult =
  | {
      ok: true
      alreadyCompleted: boolean
      provider?: "signflow" | "dropbox"
      signUrl: string | null
      clientId: string | null
      testMode: boolean
      configured: boolean
      signatureRequestId: string | null
      embedApiKey?: string | null
      appBaseUrl?: string | null
      documentId?: string | null
    }
  | {
      ok: false
      message: string
      code?: string
      waitingFor?: "sponsor" | "investor" | "prior_investor"
    }

export type DealMyEsignSyncResult =
  | {
      ok: true
      esignCompleted: boolean
      esignPending: boolean
      workflowLabel?: string | null
    }
  | { ok: false; message: string }

export type DealMyEsignScopeQuery = {
  userInvestorProfileId?: string
  investmentId?: string
  profileId?: string
}

function dealMyEsignScopeSearchParams(
  scope?: DealMyEsignScopeQuery,
): URLSearchParams {
  const params = new URLSearchParams()
  const uip = scope?.userInvestorProfileId?.trim()
  const inv = scope?.investmentId?.trim()
  const profile = scope?.profileId?.trim()
  if (uip) params.set("user_investor_profile_id", uip)
  if (inv) params.set("investment_id", inv)
  if (profile) params.set("profile_id", profile)
  return params
}

/** GET `/deals/:dealId/my-esign-sign-session` — fresh embedded sign URL for portal signing. */
export async function fetchDealMyEsignSignSession(
  dealId: string,
  signatureRequestId?: string,
  scope?: DealMyEsignScopeQuery,
): Promise<DealMyEsignSignSessionResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  const sig = signatureRequestId?.trim()
  const params = dealMyEsignScopeSearchParams(scope)
  if (sig) params.set("signatureRequestId", sig)
  const query = params.toString() ? `?${params.toString()}` : ""
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/my-esign-sign-session${query}`,
      {
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      code?: unknown
      waitingFor?: unknown
      alreadyCompleted?: boolean
      provider?: unknown
      signUrl?: string | null
      clientId?: string | null
      testMode?: boolean
      configured?: boolean
      signatureRequestId?: string | null
      embedApiKey?: string | null
      appBaseUrl?: string | null
      documentId?: string | null
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      const code = data.code != null ? String(data.code) : undefined
      const waitingFor =
        data.waitingFor === "sponsor" ||
        data.waitingFor === "investor" ||
        data.waitingFor === "prior_investor"
          ? data.waitingFor
          : undefined
      return {
        ok: false,
        message: msg || "Could not load signing session",
        ...(code ? { code } : {}),
        ...(waitingFor ? { waitingFor } : {}),
      }
    }
    const sessionSig = String(data.signatureRequestId ?? "").trim()
    return {
      ok: true,
      alreadyCompleted: Boolean(data.alreadyCompleted),
      provider:
        data.provider === "signflow" || data.provider === "dropbox"
          ? data.provider
          : undefined,
      signUrl: data.signUrl ?? null,
      clientId: data.clientId ?? null,
      testMode: Boolean(data.testMode),
      configured: Boolean(data.configured),
      signatureRequestId: sessionSig || sig || null,
      embedApiKey:
        typeof data.embedApiKey === "string" ? data.embedApiKey : null,
      appBaseUrl: typeof data.appBaseUrl === "string" ? data.appBaseUrl : null,
      documentId: typeof data.documentId === "string" ? data.documentId : null,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

/** POST `/deals/:dealId/my-esign-sync` — Invest Now: `phase` sign | finish (Dropbox events). */
export async function postDealMyEsignSync(
  dealId: string,
  signatureRequestId?: string,
  options?: { phase?: "sign" | "finish" } & DealMyEsignScopeQuery,
): Promise<DealMyEsignSyncResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  const sig = signatureRequestId?.trim()
  const phase = options?.phase ?? "finish"
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/my-esign-sync`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          ...(sig ? { signatureRequestId: sig } : {}),
          phase,
          ...(options?.userInvestorProfileId?.trim()
            ? {
                user_investor_profile_id: options.userInvestorProfileId.trim(),
              }
            : {}),
          ...(options?.investmentId?.trim()
            ? { investment_id: options.investmentId.trim() }
            : {}),
          ...(options?.profileId?.trim()
            ? { profile_id: options.profileId.trim() }
            : {}),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      esignCompleted?: boolean
      esignPending?: boolean
      workflowLabel?: string | null
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      return { ok: false, message: msg || "Could not sync eSign status" }
    }
    return {
      ok: true,
      esignCompleted: Boolean(data.esignCompleted),
      esignPending: Boolean(data.esignPending),
      workflowLabel: data.workflowLabel ?? null,
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

/** POST `/deals/:dealId/my-esign-mark-viewed` — Invest Now View / open signing. */
export async function postDealMyEsignMarkViewed(
  dealId: string,
  signatureRequestId: string,
  scope?: DealMyEsignScopeQuery,
): Promise<{ ok: boolean; workflowLabel?: string | null }> {
  const base = getApiV1Base()
  if (!base) return { ok: false }
  const sig = signatureRequestId.trim()
  if (!sig) return { ok: false }
  const uip = scope?.userInvestorProfileId?.trim()
  const inv = scope?.investmentId?.trim()
  const profile = scope?.profileId?.trim()
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/my-esign-mark-viewed`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          signatureRequestId: sig,
          ...(uip ? { user_investor_profile_id: uip } : {}),
          ...(inv ? { investment_id: inv } : {}),
          ...(profile ? { profile_id: profile } : {}),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      workflowLabel?: string | null
    }
    return {
      ok: res.ok && Boolean(data.ok),
      workflowLabel: data.workflowLabel ?? null,
    }
  } catch {
    return { ok: false }
  }
}

/** GET `/deals/:dealId/my-esign-documents` — signed PDFs after investor completes eSign. */
export async function fetchDealMyEsignDocuments(
  dealId: string,
  scope?: DealMyEsignScopeQuery,
): Promise<DealMyEsignDocumentsResult> {
  const base = getApiV1Base()
  if (!base) {
    return {
      documents: [],
      esignCompleted: false,
      esignPending: false,
      loadError: "API base URL is not configured",
    }
  }
  const params = dealMyEsignScopeSearchParams(scope)
  const query = params.toString() ? `?${params.toString()}` : ""
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/my-esign-documents${query}`,
      {
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = (await res.json()) as {
      message?: unknown
      documents?: Array<{
        fileId?: string
        name?: string
        url?: string | null
        status?: string
        categoryId?: string
        signatureRequestId?: string
      }>
      esignCompleted?: boolean
      esignPending?: boolean
      investorPortalDocumentsGateOpen?: boolean
      sequentialSignTurnOpen?: boolean
      awaitingSequentialSignTurn?: boolean
      awaitingSponsorCounterSign?: boolean
      workflowLabel?: string | null
      completedAt?: string | null
      sentAt?: string | null
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      return {
        documents: [],
        esignCompleted: false,
        esignPending: false,
        loadError: msg || "Could not load e-sign documents",
      }
    }
    const documents = Array.isArray(data.documents)
      ? data.documents
          .map((d) => {
            const fileId = String(d.fileId ?? "").trim()
            const name = String(d.name ?? "").trim()
            const rawUrl = d.url != null ? String(d.url).trim() : ""
            const statusRaw = String(d.status ?? "").trim().toLowerCase()
            const status: DealMyEsignDocument["status"] =
              statusRaw === "signed" ? "signed" : "pending"
            const categoryId = String(d.categoryId ?? "").trim()
            const signatureRequestId = String(d.signatureRequestId ?? "").trim()
            return {
              fileId,
              name,
              url: rawUrl || null,
              status,
              ...(categoryId ? { categoryId } : {}),
              ...(signatureRequestId ? { signatureRequestId } : {}),
            }
          })
          .filter((d) => d.fileId && d.name)
      : []
    return {
      documents,
      esignCompleted: Boolean(data.esignCompleted),
      esignPending: Boolean(data.esignPending),
      investorPortalDocumentsGateOpen:
        data.investorPortalDocumentsGateOpen !== false,
      sequentialSignTurnOpen: data.sequentialSignTurnOpen !== false,
      awaitingSequentialSignTurn: Boolean(data.awaitingSequentialSignTurn),
      awaitingSponsorCounterSign: Boolean(data.awaitingSponsorCounterSign),
      workflowLabel: data.workflowLabel ?? null,
      completedAt: data.completedAt ?? null,
      sentAt: data.sentAt ?? null,
      loadError: null,
    }
  } catch {
    return {
      documents: [],
      esignCompleted: false,
      esignPending: false,
      loadError: "Network error loading e-sign documents",
    }
  }
}

/**
 * POST `/deals/:dealId/members/send-esign` — sends eSign documents to an investor
 * from the **Investors** tab row actions menu.
 */
export async function postDealInvestorSendEsign(
  dealId: string,
  input: {
    to_email: string
    member_display_name?: string
    roster_id?: string
    file_ids?: string[]
  },
): Promise<PostDealInvestorSendEsignResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/members/send-esign`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          to_email: input.to_email.trim(),
          member_display_name: input.member_display_name?.trim() ?? "",
          roster_id: input.roster_id?.trim() ?? "",
          file_ids: input.file_ids ?? [],
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      const detail = msg || "Could not send eSign"
      return {
        ok: false,
        message:
          res.status >= 400 && !msg
            ? `${detail} (${res.status})`
            : detail,
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type FetchDealMemberEsignStatusResult =
  | {
      ok: true
      status: DealInvestorEsignStatus | null
      sends: DealInvestorEsignSendStatus[]
      dropbox: DealEsignDropboxDetail | null
      syncedAt: string
    }
  | { ok: false; message: string }

/** GET `/deals/:dealId/members/:rowId/esign-status` — sync + Dropbox Sign timestamps. */
export async function fetchDealMemberEsignStatus(
  dealId: string,
  rowId: string,
): Promise<FetchDealMemberEsignStatusResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/members/${encodeURIComponent(rowId)}/esign-status`,
      {
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      status?: unknown
      sends?: unknown
      dropbox?: unknown
      syncedAt?: string
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      return { ok: false, message: msg || "Could not load eSign status" }
    }
    const sends = parseEsignSendsFromApi(data.sends)
    const status = parseEsignStatusFromApi(data.status)
    if (sends.length === 0 && !status?.sentAt) {
      return { ok: false, message: "No eSign status returned" }
    }
    return {
      ok: true,
      status: status ?? null,
      sends,
      dropbox: parseDropboxDetailFromApi(data.dropbox),
      syncedAt: String(data.syncedAt ?? "").trim() || new Date().toISOString(),
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PostDealDocumentSharedNotificationResult =
  | { ok: true; sent: number; failures: { email: string; message: string }[] }
  | { ok: false; message: string }

/**
 * POST `/deals/:dealId/documents/send-shared-notification` — notifies recipients
 * that selected document(s) were shared with them (server SMTP).
 */
export async function postDealDocumentSharedNotification(
  dealId: string,
  input: {
    recipients?: { to_email: string; member_display_name?: string }[]
    audience?: {
      all_investors?: boolean
      investor_ids?: string[]
      sponsor_user_ids?: string[]
      class_ids?: string[]
    }
    document_names: string[]
  },
): Promise<PostDealDocumentSharedNotificationResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/documents/send-shared-notification`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          recipients: (input.recipients ?? [])
            .map((r) => ({
              to_email: r.to_email.trim(),
              member_display_name: r.member_display_name?.trim() ?? "",
            }))
            .filter((r) => r.to_email.includes("@")),
          audience: input.audience ?? {},
          document_names: input.document_names,
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      sent?: unknown
      failures?: { email: string; message: string }[]
    }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      return { ok: false, message: msg || "Could not send notification emails" }
    }
    const sent =
      typeof data.sent === "number" && Number.isFinite(data.sent) ? data.sent : 0
    const failures = Array.isArray(data.failures) ? data.failures : []
    return { ok: true, sent, failures }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

/**
 * DELETE `/deals/:dealId/members/:rowId` — `rowId` is a `deal_investment` id or `deal_member` id from the roster API.
 */
export async function deleteDealMemberRoster(
  dealId: string,
  rowId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API base URL is not configured" }
  }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/members/${encodeURIComponent(rowId)}`,
      {
        method: "DELETE",
        headers: { ...authHeaders() },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as { message?: unknown }
    if (!res.ok) {
      const msg =
        data.message != null ? String(data.message) : res.statusText
      return { ok: false, message: msg || "Could not remove member" }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PatchMyLpDealCommitmentResult =
  | { ok: true; investorsPayload: DealInvestorsPayload }
  | { ok: false; message: string }

/**
 * PATCH `/deals/:dealId/lp-investors/my-commitment` — LP adds an amount to their cumulative
 * commitment for this deal (same investor profile row); first commit uses this as the initial total.
 */
export async function patchMyLpDealCommitment(
  dealId: string,
  committedAmount: string,
  body: { profileId: string },
): Promise<PatchMyLpDealCommitmentResult> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const did = dealId.trim()
  if (!did) return { ok: false, message: "Missing deal id." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/lp-investors/my-commitment`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          committed_amount: committedAmount,
          profile_id: body.profileId.trim(),
        }),
      },
    )

    console.log("response =>", res);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    console.log("data =>", data);
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : `Could not save commitment (${res.status})`
      return { ok: false, message: msg }
    }
    const rawPayload = data.investorsPayload ?? data.investors_payload
    if (!rawPayload || typeof rawPayload !== "object") {
      return { ok: false, message: "Invalid response from server." }
    }
    return {
      ok: true,
      investorsPayload: normalizeDealInvestorsResponse(rawPayload),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

export type PostDealLpInvestorResult =
  | { ok: true; mode: "api"; lpInvestorId?: string }
  | { ok: true; mode: "client" }
  | {
      ok: false
      message: string
      extraCompanyUserPayment?: ExtraCompanyUserPaymentRequired
    }

/** JSON POST `/deals/:dealId/lp-investors` — roster row in `deal_lp_investor` (no `deal_investment`). */
export async function postDealLpInvestor(
  dealId: string,
  values: AddInvestmentFormValues,
  options?: { autosave?: boolean },
): Promise<PostDealLpInvestorResult> {
  const base = getApiV1Base()
  if (!base) return { ok: true, mode: "client" }

  const body: Record<string, unknown> = {
    contact_id: values.contactId,
    contact_display_name: values.contactDisplayName?.trim() ?? "",
    investor_class: values.investorClass,
    send_invitation_mail: values.sendInvitationMail ?? "no",
    profile_id: String(values.profileId ?? "").trim(),
    percent_of_class_ownership: values.percentOfClassOwnership?.trim() ?? "",
    percent_of_class_distributions:
      values.percentOfClassDistributions?.trim() ?? "",
    entity_ownership_percent: values.entityOwnershipPercent?.trim() ?? "",
    distribution_allocation_percent:
      values.distributionAllocationPercent?.trim() ?? "",
  }
  const ce = values.contactEmail?.trim()
  if (ce) body.contact_email = ce
  const role = values.investorRole?.trim()
  if (role) body.investor_role = role
  if (options?.autosave) body.autosave = true

  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/lp-investors`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      investor?: { id?: string }
    }
    if (!res.ok) {
      const extraCompanyUserPayment = parseExtraCompanyUserPaymentBody(
        data,
        dealId,
      )
      const msg =
        data?.message != null ? String(data.message) : res.statusText
      return {
        ok: false,
        message: msg || "Could not save LP investor",
        ...(extraCompanyUserPayment ? { extraCompanyUserPayment } : {}),
      }
    }
    const rawId = data.investor?.id
    const lpInvestorId =
      rawId != null && String(rawId).trim()
        ? String(rawId).trim()
        : undefined
    return { ok: true, mode: "api", lpInvestorId }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

/**
 * GET `/deals/:dealId/lp-investors/:id` — fetch that LP roster row for Edit.
 * Pass `contactId` when the list row id may be a `deal_investment` id.
 */
export async function fetchDealLpInvestorForEdit(
  dealId: string,
  params: { id: string; contactId?: string | null },
): Promise<DealInvestorRow | null> {
  const base = getApiV1Base()
  if (!base) return null
  const id = String(params.id ?? "").trim()
  if (!dealId.trim() || !id) return null
  const qs = new URLSearchParams()
  const contactId = String(params.contactId ?? "").trim()
  if (contactId) qs.set("contactId", contactId)
  const q = qs.toString()
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/lp-investors/${encodeURIComponent(id)}${q ? `?${q}` : ""}`,
      {
        headers: authHeaders(),
        credentials: "include",
      },
    )
    if (!res.ok) return null
    const data = (await res.json().catch(() => ({}))) as {
      investor?: Record<string, unknown>
    }
    if (!data.investor || typeof data.investor !== "object") return null
    return normalizeInvestorRowApi(data.investor, 0)
  } catch {
    return null
  }
}

/** JSON PUT `/deals/:dealId/lp-investors/:lpInvestorId`. */
export async function putDealLpInvestor(
  dealId: string,
  lpInvestorId: string,
  values: AddInvestmentFormValues,
  options?: { autosave?: boolean },
): Promise<PostDealLpInvestorResult> {
  const base = getApiV1Base()
  if (!base) return { ok: true, mode: "client" }

  const body: Record<string, unknown> = {
    contact_id: values.contactId,
    contact_display_name: values.contactDisplayName?.trim() ?? "",
    investor_class: values.investorClass,
    send_invitation_mail: values.sendInvitationMail ?? "no",
    profile_id: String(values.profileId ?? "").trim(),
    percent_of_class_ownership: values.percentOfClassOwnership?.trim() ?? "",
    percent_of_class_distributions:
      values.percentOfClassDistributions?.trim() ?? "",
    entity_ownership_percent: values.entityOwnershipPercent?.trim() ?? "",
    distribution_allocation_percent:
      values.distributionAllocationPercent?.trim() ?? "",
  }
  const ce = values.contactEmail?.trim()
  if (ce) body.contact_email = ce
  const role = values.investorRole?.trim()
  if (role) body.investor_role = role
  if (options?.autosave) body.autosave = true

  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/lp-investors/${encodeURIComponent(lpInvestorId)}`,
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
    }
    if (!res.ok) {
      const extraCompanyUserPayment = parseExtraCompanyUserPaymentBody(
        data,
        dealId,
      )
      const msg =
        data?.message != null ? String(data.message) : res.statusText
      return {
        ok: false,
        message: msg || "Could not update LP investor",
        ...(extraCompanyUserPayment ? { extraCompanyUserPayment } : {}),
      }
    }
    return { ok: true, mode: "api" }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export type PostDealInvestmentResult =
  | { ok: true; mode: "api"; investmentId?: string }
  | { ok: true; mode: "client" }
  | {
      ok: false
      message: string
      extraCompanyUserPayment?: ExtraCompanyUserPaymentRequired
    }

function appendDealInvestmentMultipartFields(
  fd: FormData,
  values: AddInvestmentFormValues,
  documentFile: File | null,
  options?: { autosave?: boolean },
): void {
  fd.append("offering_id", values.offeringId)
  fd.append("contact_id", values.contactId)
  fd.append("contact_display_name", values.contactDisplayName?.trim() ?? "")
   const contactEmail = values.contactEmail?.trim()
  if (contactEmail) fd.append("contact_email", contactEmail)
  fd.append("profile_id", values.profileId)
  fd.append("investor_role", values.investorRole?.trim() ?? "")
  fd.append("status", values.status)
  fd.append("investor_class", values.investorClass)
  fd.append("doc_signed_date", values.docSignedDate)
  /* Backend rejects blank; autosave uses "0". Add Member / hidden fields send no amount — same default. */
  fd.append(
    "commitment_amount",
    values.commitmentAmount.trim() !== "" ? values.commitmentAmount.trim() : "0",
  )
  fd.append(
    "extra_contribution_amounts",
    JSON.stringify(values.extraContributionAmounts),
  )
  if (documentFile) fd.append("subscriptionDocument", documentFile)
  fd.append("send_invitation_mail", values.sendInvitationMail ?? "no")
  fd.append(
    "fund_approved",
    values.fundApproved === true ? "true" : "false",
  )
  if (options?.autosave) fd.append("autosave", "true")
}

/**
 * POST multipart to `/deals/:dealId/investments`.
 * If no API base URL is configured, returns `{ ok: true, mode: 'client' }` so the UI can save locally only.
 */
export async function postDealInvestment(
  dealId: string,
  values: AddInvestmentFormValues,
  documentFile: File | null,
  options?: { autosave?: boolean },
): Promise<PostDealInvestmentResult> {
  const base = getApiV1Base()
  if (!base) return { ok: true, mode: "client" }

  const fd = new FormData()
  appendDealInvestmentMultipartFields(fd, values, documentFile, options)

  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/investments`,
      {
        method: "POST",
        headers: { ...authHeaders() },
        body: fd,
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      investor?: { id?: string }
    }
    if (!res.ok) {
      const extraCompanyUserPayment = parseExtraCompanyUserPaymentBody(
        data,
        dealId,
      )
      const msg =
        data?.message != null ? String(data.message) : res.statusText
      return {
        ok: false,
        message: msg || "Could not save investment",
        ...(extraCompanyUserPayment ? { extraCompanyUserPayment } : {}),
      }
    }
    const rawId = data.investor?.id
    const investmentId =
      rawId != null && String(rawId).trim()
        ? String(rawId).trim()
        : undefined
    if (import.meta.env.DEV) {
      console.info("[Add member / investment] Stored in DB (POST)", {
        tables: ["deal_investment", "deal_member"],
        dealId,
        autosave: Boolean(options?.autosave),
        deal_investment_row: {
          offering_id: values.offeringId,
          contact_id: values.contactId,
          contact_display_name: values.contactDisplayName?.trim() ?? "",
          profile_id: values.profileId,
          investor_role: values.investorRole?.trim() ?? "",
          status: values.status,
          investor_class: values.investorClass,
          doc_signed_date: values.docSignedDate || null,
          commitment_amount: values.commitmentAmount,
          extra_contribution_amounts: values.extraContributionAmounts,
          subscription_document_uploaded: Boolean(documentFile),
        },
        deal_member_row: {
          offering_id: values.offeringId,
          contact_id: values.contactId,
          contact_display_name: values.contactDisplayName?.trim() ?? "",
          profile_id: values.profileId,
          investor_role: values.investorRole?.trim() ?? "",
          status: values.status,
          investor_class: values.investorClass,
          send_invitation_mail: values.sendInvitationMail ?? "no",
        },
      })
    }
    return { ok: true, mode: "api", investmentId }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

/**
 * PUT multipart to `/deals/:dealId/investments/:investmentId` — same fields as POST.
 */
export async function putDealInvestment(
  dealId: string,
  investmentId: string,
  values: AddInvestmentFormValues,
  documentFile: File | null,
  options?: { autosave?: boolean },
): Promise<PostDealInvestmentResult> {
  const base = getApiV1Base()
  if (!base) return { ok: true, mode: "client" }

  const fd = new FormData()
  appendDealInvestmentMultipartFields(fd, values, documentFile, options)

  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId)}/investments/${encodeURIComponent(investmentId)}`,
      {
        method: "PUT",
        headers: { ...authHeaders() },
        body: fd,
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
    }
    if (!res.ok) {
      const extraCompanyUserPayment = parseExtraCompanyUserPaymentBody(
        data,
        dealId,
      )
      const msg =
        data?.message != null ? String(data.message) : res.statusText
      return {
        ok: false,
        message: msg || "Could not update investment",
        ...(extraCompanyUserPayment ? { extraCompanyUserPayment } : {}),
      }
    }
    if (import.meta.env.DEV) {
      console.info("[Edit investment] Stored in DB (PUT)", {
        tables: ["deal_investment", "deal_member"],
        dealId,
        investmentId,
        autosave: Boolean(options?.autosave),
        deal_investment_row: {
          offering_id: values.offeringId,
          contact_id: values.contactId,
          contact_display_name: values.contactDisplayName?.trim() ?? "",
          profile_id: values.profileId,
          investor_role: values.investorRole?.trim() ?? "",
          status: values.status,
          investor_class: values.investorClass,
          doc_signed_date: values.docSignedDate || null,
          commitment_amount: values.commitmentAmount,
          extra_contribution_amounts: values.extraContributionAmounts,
          subscription_document_uploaded: Boolean(documentFile),
        },
        deal_member_row: {
          offering_id: values.offeringId,
          contact_id: values.contactId,
          contact_display_name: values.contactDisplayName?.trim() ?? "",
          profile_id: values.profileId,
          investor_role: values.investorRole?.trim() ?? "",
          status: values.status,
          investor_class: values.investorClass,
          send_invitation_mail: values.sendInvitationMail ?? "no",
        },
      })
    }
    return { ok: true, mode: "api" }
  } catch {
    return { ok: false, message: "Network error" }
  }
}
