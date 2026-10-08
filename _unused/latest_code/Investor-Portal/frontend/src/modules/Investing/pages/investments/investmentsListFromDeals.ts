/**
 * Build “Investments” list and detail from deal + investor APIs when the
 * signed-in user has a positive committed amount on a deal.
 */
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { getSessionUserId } from "@/common/auth/sessionUserId"
import {
  applyLpSessionDealIdScope,
  committedAmountMatchingInvestorsTable,
  dealIsInViewerInvestmentsListScope,
  dealRowSupportsRosterApiPrefetch,
  filterDealListRowsVisibleToInvestors,
  formatViewerInvestingDealRolesLabel,
  mapInvestingInvestmentsPageScope,
  resolveViewerInvestingDealRoles,
  viewerDealHasStartedInvestment,
  viewerDealNeedsOnboarding,
} from "@/modules/Investing/utils/investingViewerDealScope"
import type { InvestmentOnboardingBucket } from "./investments.types"
import {
  primaryOnboardingBucket,
  resolveDealOnboardingBuckets,
} from "./investNowOnboardingBucket"
import {
  dealHasInvestNowDraftForViewer,
  firstInvestNowDraftRowForViewer,
  investNowProgressForViewer,
  isInvestNowDraftInvestorRow,
} from "@/modules/Investing/pages/invest/investNowDraftUtils"
import {
  fetchDealById,
  fetchDealInvestors,
  fetchDealMembers,
  fetchDealsList,
} from "@/modules/Syndication/Deals/api/dealsApi"
import type { DealDetailApi } from "@/modules/Syndication/Deals/api/dealsApi"
import {
  fetchMyDealDistributions,
  fetchMyDistributions,
  type MyDistributionPaymentRow,
} from "@/modules/Syndication/Deals/distribution-setup/api/myDistributionsApi"
import type {
  DealInvestorRow,
  DealInvestorsPayload,
} from "@/modules/Syndication/Deals/types/deal-investors.types"
import type { DealListRow } from "@/modules/Syndication/Deals/types/deals.types"
import { investorRowMatchesViewerEmail } from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import {
  investorRowCommittedAmountNumeric,
  parseMoneyDigits,
} from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import {
  fetchUserInvestorProfileNameMap,
  formatInvestedAsFromInv,
  investorCommitmentTypeFromInv,
  profileNameForInvestmentBreakdown,
} from "./investedAsDisplay"
import { pickInvestNowLeadSponsorDisplayName } from "@/modules/Syndication/Deals/utils/resolveInvestNowDealContext"
import { syncInvestmentDealDocumentPreview } from "./utils/syncInvestmentDealDocumentPreview"
import { investmentRuntimeIdForDeal, readRuntimeInvestmentRowById } from "./investmentsRuntimeStore"
import type {
  InvestmentBreakdownLine,
  InvestmentDetailRecord,
  InvestmentListRow,
} from "./investments.types"

function normEmail(s: string): string {
  return s.trim().toLowerCase()
}

function primaryViewerRow(
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
): DealInvestorRow | undefined {
  const matches = positiveViewerCommitments(investors, viewerEmailNorm)
  if (matches.length === 0) return undefined
  return matches[0]
}

/** Deal investor rows for this viewer with a positive committed amount, largest first. */
function positiveViewerCommitments(
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
): DealInvestorRow[] {
  const out: { inv: DealInvestorRow; amt: number }[] = []
  for (const inv of investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    const amt = investorRowCommittedAmountNumeric(inv)
    if (amt > 0) out.push({ inv, amt })
  }
  out.sort((a, b) => b.amt - a.amt)
  return out.map((x) => x.inv)
}

/** Split `list.investmentProfile` "Name — Type" for detail fallback when not loading per-field from API. */
function splitListInvestmentProfile(combined: string): {
  profileName: string
  investorType: string
} {
  const t = (combined ?? "").trim()
  if (!t || t === "—") return { profileName: "—", investorType: "—" }
  const idx = t.indexOf(" — ")
  if (idx >= 0) {
    return {
      profileName: t.slice(0, idx).trim() || "—",
      investorType: t.slice(idx + 3).trim() || "—",
    }
  }
  return { profileName: "—", investorType: t }
}

/**
 * Viewer rows for the Profile and investment tab: completed/visible commitments plus
 * in-progress Invest Now drafts (profile saved, e-sign pending, etc.).
 */
function viewerRowsForProfileBreakdown(
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
): DealInvestorRow[] {
  const out: DealInvestorRow[] = []
  const seen = new Set<string>()
  for (const inv of investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    const rowId = String(inv.id ?? "").trim()
    if (rowId) {
      if (seen.has(rowId)) continue
      seen.add(rowId)
    }
    if (isInvestNowDraftInvestorRow(inv, viewerEmailNorm)) {
      out.push(inv)
      continue
    }
    if (investorRowCommittedAmountNumeric(inv) <= 0) continue
    out.push(inv)
  }
  return out
}

/**
 * One row per **deal commitment** the viewer has on this deal (each `DealInvestorRow` with
 * a positive `committed` amount). That way two investments as Individual with different
 * book profile names (e.g. A and B) always show as two lines with the correct amount on each.
 * The lead “Total for this deal” in the detail tab still uses the list row’s full committed sum.
 */
function buildProfileBreakdownForDeal(
  profileRows: DealInvestorRow[],
  nameMap: ReadonlyMap<string, string>,
): InvestmentBreakdownLine[] {
  const out: InvestmentBreakdownLine[] = []
  for (const inv of profileRows) {
    const amt = investorRowCommittedAmountNumeric(inv)
    out.push({
      investmentRowId: String(inv.id ?? "").trim() || undefined,
      userInvestorProfileId:
        String(inv.userInvestorProfileId ?? "").trim() || undefined,
      commitmentProfileId: String(inv.profileId ?? "").trim() || undefined,
      profileName: profileNameForInvestmentBreakdown(inv, nameMap),
      investorType: investorCommitmentTypeFromInv(inv),
      investedAmount: amt,
      investedAtIso: String(inv.investedAtIso ?? "").trim() || undefined,
      approvedBy:
        inv.fundApproved === true
          ? String(inv.fundApprovedByDisplayName ?? "").trim() || undefined
          : undefined,
      approvedAtIso:
        inv.fundApproved === true
          ? String(inv.fundApprovedAtIso ?? "").trim() || undefined
          : undefined,
    })
  }
  return out.sort((a, b) => {
    const byName = (a.profileName || "").localeCompare(
      b.profileName || "",
      "en",
      { sensitivity: "base" },
    )
    if (byName !== 0) return byName
    const byType = (a.investorType || "").localeCompare(
      b.investorType || "",
      "en",
      { sensitivity: "base" },
    )
    if (byType !== 0) return byType
    return (a.investedAmount || 0) - (b.investedAmount || 0)
  })
}

function onboardingBucketsForDealPayload(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): InvestmentOnboardingBucket[] {
  const buckets = resolveDealOnboardingBuckets(payload, viewerEmailNorm)
  if (buckets.length > 0) return buckets
  if (viewerDealNeedsOnboarding(payload, viewerEmailNorm)) return ["pending"]
  if (viewerDealHasStartedInvestment(payload, viewerEmailNorm)) {
    return ["in_progress"]
  }
  return []
}

/** Sum viewer payment lines keyed by deal id (case-insensitive). */
function distributedAmountByDealId(
  rows: MyDistributionPaymentRow[],
): Map<string, number> {
  const byDeal = new Map<string, number>()
  for (const row of rows) {
    const dealId = String(row.dealId ?? "").trim().toLowerCase()
    if (!dealId) continue
    const n = parseMoneyDigits(String(row.payment ?? ""))
    if (!Number.isFinite(n) || n <= 0) continue
    byDeal.set(dealId, (byDeal.get(dealId) ?? 0) + n)
  }
  return byDeal
}

function listRowFromDealAndInvestors(
  listRow: DealListRow,
  members: DealInvestorRow[],
  inv: DealInvestorRow | undefined,
  committed: number,
  nameByUserProfileId: ReadonlyMap<string, string> | undefined,
  viewerRolesLabel: string,
  onboardingBuckets: InvestmentOnboardingBucket[],
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
  leadSponsorDisplayName?: string,
  distributedAmount = 0,
): InvestmentListRow {
  const dealId = listRow.id
  const profileId = inv ? String(inv.profileId ?? "").trim() : ""
  const userInvProfId = inv
    ? String(inv.userInvestorProfileId ?? "").trim()
    : ""
  const userInvProfName = inv
    ? String(inv.userInvestorProfileName ?? "").trim()
    : ""
  const dealName = listRow.dealName?.trim() || "—"
  const hasDraft = dealHasInvestNowDraftForViewer(investors, viewerEmailNorm)
  const draftRow = hasDraft
    ? firstInvestNowDraftRowForViewer(investors, viewerEmailNorm)
    : undefined
  return {
    id: investmentRuntimeIdForDeal(dealId),
    dealId,
    investmentName: dealName,
    /** Deal/offering title — not investor class (Class A, etc.). */
    offeringName: dealName,
    investmentProfile: formatInvestedAsFromInv(inv, nameByUserProfileId),
    commitmentProfileId: profileId || undefined,
    userInvestorProfileId: userInvProfId || undefined,
    userInvestorProfileName: userInvProfName || undefined,
    investedAmount: committed,
    distributedAmount:
      Number.isFinite(distributedAmount) && distributedAmount > 0
        ? distributedAmount
        : 0,
    currentValuation: "—",
    dealCloseDate: (listRow.closeDateDisplay || "—").trim() || "—",
    status: (listRow.dealStage || "—").trim() || "—",
    offeringStatus: listRow.offeringStatus?.trim() || undefined,
    actionRequired: "None",
    onboardingBucket: primaryOnboardingBucket(onboardingBuckets),
    onboardingBuckets,
    hasInvestNowDraft: hasDraft,
    investNowResumeScope: draftRow
      ? {
          investmentId: String(draftRow.id ?? "").trim() || undefined,
          userInvestorProfileId:
            String(draftRow.userInvestorProfileId ?? "").trim() || undefined,
          profileId: String(draftRow.profileId ?? "").trim() || undefined,
        }
      : undefined,
    investNowDraftProgress: investNowProgressForViewer(
      investors,
      viewerEmailNorm,
    ),
    archived: Boolean(listRow.archived),
    dealType: listRow.dealType,
    secType: listRow.secType,
    propertyName: listRow.propertyName,
    owningEntityName: listRow.owningEntityName,
    dealSponsorName: pickInvestNowLeadSponsorDisplayName({
      members,
      leadSponsorDisplayName,
    }),
    startDateDisplay: listRow.startDateDisplay ?? listRow.createdDateDisplay,
    viewerRolesLabel,
  }
}

/**
 * One row per deal where the viewer’s committed amount is positive.
 * When `nameByUserProfileIdFromBook` is omitted, a profile book fetch runs here. Prefer
 * passing the map from `getMergedInvestmentListRows` in `investmentsRuntimeData` to avoid duplicate fetches.
 */
export async function loadInvestmentListRowsFromDeals(
  nameByUserProfileIdFromBook?: ReadonlyMap<string, string>,
): Promise<InvestmentListRow[]> {
  const em = getSessionUserEmail()
  if (!em?.trim()) return []
  const emn = normEmail(em)
  const list = applyLpSessionDealIdScope(
    await fetchDealsList({ includeParticipantDeals: true }),
  )
  const scoped = await mapInvestingInvestmentsPageScope(list)
  if (scoped.length === 0) return []

  const [nameMap, myDistributions] = await Promise.all([
    nameByUserProfileIdFromBook
      ? Promise.resolve(nameByUserProfileIdFromBook)
      : fetchUserInvestorProfileNameMap(),
    fetchMyDistributions().catch(() => ({
      distributions: [] as MyDistributionPaymentRow[],
      totalPayment: "0",
    })),
  ])
  const distributedByDeal = distributedAmountByDealId(myDistributions.distributions)
  const out: InvestmentListRow[] = []
  for (const { row, payload, members, leadSponsorDisplayName } of scoped) {
    const committed = committedAmountMatchingInvestorsTable(payload, emn)
    // `scoped` already passed `dealIsInViewerInvestmentsListScope` (invited, draft, or
    // visible commitment). Do not drop in-progress Invest Now drafts — they have no
    // visible committed amount until e-sign completes.
    const inv =
      primaryViewerRow(payload.investors, emn) ??
      firstInvestNowDraftRowForViewer(payload.investors, emn)
    const viewerRolesLabel = formatViewerInvestingDealRolesLabel(
      resolveViewerInvestingDealRoles(
        members,
        payload.investors,
        emn,
        payload,
      ),
    )
    const distributedAmount =
      distributedByDeal.get(String(row.id ?? "").trim().toLowerCase()) ?? 0
    out.push(
      listRowFromDealAndInvestors(
        row,
        members,
        inv,
        committed,
        nameMap,
        viewerRolesLabel,
        onboardingBucketsForDealPayload(payload, emn),
        payload.investors,
        emn,
        leadSponsorDisplayName,
        distributedAmount,
      ),
    )
  }
  return out
}

function defaultDetailRecord(
  list: InvestmentListRow,
  deal: DealDetailApi,
  investedAsBreakdown?: InvestmentBreakdownLine[],
): InvestmentDetailRecord {
  const breakdown: InvestmentBreakdownLine[] =
    investedAsBreakdown && investedAsBreakdown.length > 0
      ? investedAsBreakdown
      : (() => {
          const s = splitListInvestmentProfile(
            (list.investmentProfile ?? "").trim() || "—",
          )
          return [
            {
              profileName: s.profileName,
              investorType: s.investorType,
              investedAmount: list.investedAmount,
            },
          ]
        })()
  const investedAsLine =
    breakdown.length > 1
      ? "See table below for each commitment"
      : [
          (breakdown[0]?.profileName ?? "").trim(),
          (breakdown[0]?.investorType ?? "").trim(),
        ]
          .filter((s) => s && s !== "—")
          .join(" — ") || "—"
  return {
    id: list.id,
    list,
    propertyName: deal.propertyName?.trim() || deal.dealName || "—",
    propertyType: (deal.listRow?.propertyType || "Other").trim() || "Other",
    propertyStatus: "Other",
    city: (deal.city || "—").trim() || "—",
    state: (deal.state || "—").trim() || "—",
    numberOfUnits: "—",
    occupancyPct: "—",
    ownedSince: "—",
    yearBuilt: "—",
    investedAs: investedAsLine,
    investedAsBreakdown: breakdown,
    ownershipPct: "—",
    generalComments: "",
    overallAssetValue: "0",
    netOperatingIncome: "0",
    outstandingLoans: "0",
    debtService: "0",
    loanType: "Other",
    ioOrAmortizing: "Amortizing",
    maturityDate: "—",
    lender: "—",
    interestRatePct: "—",
  }
}

/**
 * Route param may be `deal_investment.id`; resolve to parent deal when it is not a deal id.
 */
async function resolveDealIdFromInvestmentRowId(
  investmentRowId: string,
): Promise<string | undefined> {
  const key = investmentRowId.trim().toLowerCase()
  if (!key) return undefined
  const list = filterDealListRowsVisibleToInvestors(
    applyLpSessionDealIdScope(
      await fetchDealsList({ includeParticipantDeals: true }),
    ),
  )
  for (const row of list) {
    if (!dealRowSupportsRosterApiPrefetch(row)) continue
    try {
      const payload = await fetchDealInvestors(row.id, {
        lpInvestorsOnly: false,
      })
      const ownsRow = payload.investors.some((inv) => {
        if (String(inv.id ?? "").trim().toLowerCase() !== key) return false
        return investorRowMatchesViewerEmail(inv, normEmail(getSessionUserEmail()))
      })
      if (ownsRow) return row.id.trim()
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * Detail view for a deal the viewer has invested in (server-backed when not in localStorage).
 * `investmentIdOrDealId` may be a deal id, `deal_investment.id`, or a `runtime-…` id.
 */
export async function loadInvestmentDetailFromDeal(
  investmentIdOrDealId: string,
): Promise<InvestmentDetailRecord | undefined> {
  let did = investmentIdOrDealId.trim()
  if (!did) return undefined
  if (did.startsWith("runtime-")) {
    const fromStore = readRuntimeInvestmentRowById(did)
    const resolved = fromStore?.dealId?.trim()
    if (resolved) did = resolved
    else return undefined
  }
  const em = getSessionUserEmail()
  const emn = em?.trim() ? normEmail(em) : ""
  if (!emn && !getSessionUserId().trim()) return undefined
  let deal: DealDetailApi
  let payload: Awaited<ReturnType<typeof fetchDealInvestors>>
  let members: DealInvestorRow[]
  let leadSponsorDisplayName: string | undefined
  try {
    const [dealRow, payloadRow, membersResult] = await Promise.all([
      fetchDealById(did),
      fetchDealInvestors(did, { lpInvestorsOnly: false }),
      fetchDealMembers(did),
    ])
    deal = dealRow
    payload = payloadRow
    members = membersResult.members
    leadSponsorDisplayName = membersResult.leadSponsorDisplayName
  } catch {
    const resolvedDealId = await resolveDealIdFromInvestmentRowId(did)
    if (!resolvedDealId) return undefined
    did = resolvedDealId
    try {
      const [dealRow, payloadRow, membersResult] = await Promise.all([
        fetchDealById(did),
        fetchDealInvestors(did, { lpInvestorsOnly: false }),
        fetchDealMembers(did),
      ])
      deal = dealRow
      payload = payloadRow
      members = membersResult.members
      leadSponsorDisplayName = membersResult.leadSponsorDisplayName
    } catch {
      return undefined
    }
  }
  syncInvestmentDealDocumentPreview(did, deal.offeringInvestorPreviewJson ?? null)
  if (!dealIsInViewerInvestmentsListScope(payload, emn)) return undefined
  const committed = committedAmountMatchingInvestorsTable(payload, emn)
  const myCommitments = positiveViewerCommitments(payload.investors, emn)
  const profileRows = viewerRowsForProfileBreakdown(payload.investors, emn)
  const inv = myCommitments[0] ?? profileRows[0]
  const [nameMap, dealDistributions] = await Promise.all([
    fetchUserInvestorProfileNameMap(),
    fetchMyDealDistributions(did).catch(() => ({
      distributions: [] as MyDistributionPaymentRow[],
      totalPayment: "0",
    })),
  ])
  const viewerRolesLabel = formatViewerInvestingDealRolesLabel(
    resolveViewerInvestingDealRoles(members, payload.investors, emn, payload),
  )
  const distributedFromTotal = parseMoneyDigits(
    String(dealDistributions.totalPayment ?? ""),
  )
  const distributedAmount = Number.isFinite(distributedFromTotal)
    ? distributedFromTotal
    : 0
  const list = listRowFromDealAndInvestors(
    deal.listRow,
    members,
    inv,
    committed,
    nameMap,
    viewerRolesLabel,
    onboardingBucketsForDealPayload(payload, emn),
    payload.investors,
    emn,
    leadSponsorDisplayName,
    distributedAmount,
  )
  const investedAsBreakdown = buildProfileBreakdownForDeal(profileRows, nameMap)
  return defaultDetailRecord(list, deal, investedAsBreakdown)
}
