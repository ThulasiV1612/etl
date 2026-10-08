import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { dealMemberRoleLabelIsLpInvestor } from "@/common/auth/roleUtils"
import {
  INVESTOR_ROLE_SELECT_OPTIONS,
  LP_INVESTORS_ROLE_LABEL,
} from "@/modules/Syndication/Deals/constants/investor-profile"
import {
  emptyDealInvestorsPayload,
  fetchDealInvestors,
  fetchDealMembers,
} from "@/modules/Syndication/Deals/api/dealsApi"
import type {
  DealInvestorRow,
  DealInvestorsPayload,
} from "@/modules/Syndication/Deals/types/deal-investors.types"
import type { DealListRow } from "@/modules/Syndication/Deals/types/deals.types"
import { isDealListRowIncomplete } from "@/modules/Syndication/Deals/api/dealsApi"
import { dealHasInvestNowDraftForViewer } from "@/modules/Investing/pages/invest/investNowDraftUtils"
import {
  investorCommittedVisibleToViewer,
  investorEsignWasSent,
  investorRowCommittedNumeric,
  investorRowMatchesViewerEmail,
} from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import { investorRowCommittedAmountNumeric } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"

/** Draft / incomplete create-deal wizard rows are sponsor-only — hide from investors.
 * Also drop deals the API marked unreadable (e.g. contact offering visibility). */
export function filterDealListRowsVisibleToInvestors(
  rows: DealListRow[],
): DealListRow[] {
  return rows.filter(
    (row) => !isDealListRowIncomplete(row) && row.rosterReadable !== false,
  )
}

/**
 * Committed (USD) visible to the signed-in investor (hidden until eSign completes).
 */
export function committedAmountForViewerEmail(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): number {
  if (!viewerEmailNorm) return 0
  let sum = 0
  for (const inv of payload.investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    if (!investorCommittedVisibleToViewer(inv)) continue
    sum += investorRowCommittedNumeric(inv)
  }
  return sum
}

/**
 * Sum committed for the viewer — same values as syndication Investors tab Committed column.
 */
export function committedAmountMatchingInvestorsTable(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): number {
  if (!viewerEmailNorm) return 0
  let sum = 0
  for (const inv of payload.investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    sum += investorRowCommittedAmountNumeric(inv)
  }
  return sum
}

/**
 * Viewer has committed capital and/or started document signing on this deal
 * (Invest Now / investment onboarding in progress or complete).
 */
export function viewerDealHasStartedInvestment(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  if (!viewerEmailNorm) return false
  if (dealHasInvestNowDraftForViewer(payload.investors, viewerEmailNorm)) {
    return true
  }
  for (const inv of payload.investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    if (investorRowCommittedNumeric(inv) > 0) return true
    if (investorEsignWasSent(inv)) return true
  }
  return false
}

/**
 * Invited LP on the deal roster who has not started Invest Now yet.
 */
export function viewerDealNeedsOnboarding(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  if (!viewerEmailNorm) return false
  if (viewerDealHasStartedInvestment(payload, viewerEmailNorm)) return false
  return viewerOnDealAsInvitedInvestor(payload, viewerEmailNorm)
}

/**
 * Investor participates on this deal (committed and/or eSign in progress).
 */
export function viewerHasDealParticipation(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  if (!viewerEmailNorm) return false
  if (dealHasInvestNowDraftForViewer(payload.investors, viewerEmailNorm)) {
    return true
  }
  for (const inv of payload.investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    if (investorRowCommittedNumeric(inv) > 0) return true
    if (investorEsignWasSent(inv)) return true
  }
  return false
}

/**
 * Investor-only surfaces (e.g. dashboard “Your deals”, investment rows).
 */
export function dealIsInViewerInvestingScope(
  payload: DealInvestorsPayload,
): boolean {
  const em = getSessionUserEmail().trim().toLowerCase()
  if (!em) return false
  return viewerHasDealParticipation(payload, em)
}

/**
 * Investments list tabs: onboarded LP (committed and/or eSign started) or invited
 * LP who has not started Invest Now. Excludes sponsor-only deal visibility.
 */
export function dealIsInViewerInvestmentsListScope(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  if (!viewerEmailNorm) return false
  return (
    viewerDealHasStartedInvestment(payload, viewerEmailNorm) ||
    viewerDealNeedsOnboarding(payload, viewerEmailNorm)
  )
}

const SPONSOR_ROLE_DISPLAY_ORDER = [
  "Lead Sponsor",
  "Admin Sponsor",
  "Co-Sponsor",
] as const

const SPONSOR_ROLE_STORED_VALUES = new Set([
  "Lead Sponsor",
  "admin sponsor",
  "Co-sponsor",
])

function sponsorRoleDisplayLabel(stored: string | undefined): string | null {
  const t = String(stored ?? "").trim()
  if (!t || t === "—") return null
  const byVal = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.value === t)
  if (byVal?.label && SPONSOR_ROLE_STORED_VALUES.has(byVal.value)) {
    if (byVal.label === "Admin sponsor") return "Admin Sponsor"
    if (byVal.label === "Co-sponsor") return "Co-Sponsor"
    return byVal.label
  }
  const byLabel = INVESTOR_ROLE_SELECT_OPTIONS.find((o) => o.label === t)
  if (byLabel?.label && SPONSOR_ROLE_STORED_VALUES.has(byLabel.value)) {
    if (byLabel.label === "Admin sponsor") return "Admin Sponsor"
    if (byLabel.label === "Co-sponsor") return "Co-Sponsor"
    return byLabel.label
  }
  const lower = t.toLowerCase()
  if (lower === "lead sponsor") return "Lead Sponsor"
  if (lower === "admin sponsor") return "Admin Sponsor"
  if (lower === "co-sponsor" || lower === "co sponsor") return "Co-Sponsor"
  return null
}

function sponsorRoleLabelsFromRow(m: DealInvestorRow): string[] {
  const out = new Set<string>()
  const roleLabel = sponsorRoleDisplayLabel(m.investorRole)
  if (roleLabel) out.add(roleLabel)
  for (const lab of m.memberRoleLabels ?? []) {
    const l = sponsorRoleDisplayLabel(lab)
    if (l) out.add(l)
  }
  return [...out]
}

function dealMemberRowHasSponsorRole(m: DealInvestorRow): boolean {
  return sponsorRoleLabelsFromRow(m).length > 0
}

/**
 * When the API does not send {@link DealInvestorRow.addedByIsSponsorOnDeal},
 * infer from the adder’s roster row in the same payload (if present).
 */
function adderInInvestorsListIsSponsor(
  addedByUserId: string,
  members: DealInvestorRow[],
): boolean {
  const k = String(addedByUserId).trim().toLowerCase()
  if (!k) return false
  for (const m of members) {
    if (
      String(m.contactId ?? "").trim().toLowerCase() === k &&
      dealMemberRowHasSponsorRole(m)
    ) {
      return true
    }
  }
  return false
}

function rowHasLpInvestorRole(m: DealInvestorRow): boolean {
  if (dealMemberRoleLabelIsLpInvestor(m.investorRole ?? "")) return true
  for (const lab of m.memberRoleLabels ?? []) {
    if (dealMemberRoleLabelIsLpInvestor(lab ?? "")) return true
  }
  return false
}

/**
 * Viewer is invited / linked to this deal as an LP investor (no positive
 * commitment required yet).
 */
function viewerOnDealAsInvitedInvestor(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): boolean {
  if (!viewerEmailNorm) return false
  for (const m of payload.investors) {
    if (!investorRowMatchesViewerEmail(m, viewerEmailNorm)) continue
    if (m.investorKind === "lp_roster") return true
    if (rowHasLpInvestorRole(m)) return true
    if (m.addedByIsSponsorOnDeal === true) return true
    if (
      m.addedByIsSponsorOnDeal === undefined &&
      m.addedByUserId &&
      adderInInvestorsListIsSponsor(m.addedByUserId, payload.investors)
    ) {
      return true
    }
  }
  return false
}

/**
 * `/investing/deals` table: deals where the viewer is invested, invited as LP,
 * or on the roster as Lead / Admin / Co-sponsor.
 */
export function dealIsInViewerInvestingDealsPageScope(
  payload: DealInvestorsPayload,
  members: DealInvestorRow[] = [],
): boolean {
  const em = getSessionUserEmail().trim().toLowerCase()
  if (!em) return false
  if (committedAmountForViewerEmail(payload, em) > 0) return true
  if (viewerOnDealAsInvitedInvestor(payload, em)) return true
  const roles = resolveViewerInvestingDealRoles(
    members,
    payload.investors,
    em,
    payload,
  )
  return roles.sponsorRoleLabels.length > 0
}

function investingViewerEmailNorm(): string {
  return getSessionUserEmail().trim().toLowerCase()
}

/** Skip `/investors` and `/members` prefetch for opportunity-only deals (404 on server). */
export function dealRowSupportsRosterApiPrefetch(row: DealListRow): boolean {
  return row.rosterReadable !== false
}

async function loadDealRosterForInvestingScope(row: DealListRow): Promise<{
  payload: DealInvestorsPayload
  members: DealInvestorRow[]
  leadSponsorDisplayName?: string
}> {
  if (!dealRowSupportsRosterApiPrefetch(row)) {
    return { payload: emptyDealInvestorsPayload(), members: [] }
  }
  const [payload, membersResult] = await Promise.all([
    fetchDealInvestors(row.id, { lpInvestorsOnly: false }),
    fetchDealMembers(row.id),
  ])
  return {
    payload,
    members: membersResult.members,
    leadSponsorDisplayName: membersResult.leadSponsorDisplayName,
  }
}

/**
 * `GET /deals` (with `includeParticipantDeals`) already enforces
 * `lpInvestorEmailScopedDealIds` on the server. Session `lp_investor_deal_ids` can
 * lag after a new LP invite, so we do not filter the response again here.
 */
export function applyLpSessionDealIdScope(
  rows: DealListRow[],
): DealListRow[] {
  return rows
}

/**
 * Full investor roster (not `lpInvestorsOnly`) is required to match
 * `userEmail` + `committed` for the session.
 */
export async function filterDealListToViewerInvested(
  rows: DealListRow[],
): Promise<DealListRow[]> {
  const viewerEmailNorm = investingViewerEmailNorm()
  if (!viewerEmailNorm) return []
  const toScan = filterDealListRowsVisibleToInvestors(
    applyLpSessionDealIdScope(rows),
  )
  const withPayload = await Promise.all(
    toScan.map(async (row) => {
      if (!dealRowSupportsRosterApiPrefetch(row)) {
        return { row, payload: emptyDealInvestorsPayload() }
      }
      const payload = await fetchDealInvestors(row.id, {
        lpInvestorsOnly: false,
      })
      return { row, payload }
    }),
  )
  return withPayload
    .filter(({ payload }) => dealIsInViewerInvestingScope(payload))
    .map(({ row }) => row)
}

/**
 * Investing deals route: sponsor, committed, invited LP, or roster assignee.
 * Does not use {@link applyLpSessionDealIdScope} so sponsors are not pre-excluded.
 */
export type ViewerInvestingDealRoles = {
  /** Lead Sponsor, Admin Sponsor, and/or Co-Sponsor when applicable. */
  sponsorRoleLabels: string[]
  isInvestor: boolean
}

/**
 * Sponsor vs LP investor on a deal for the investing deals table (not mutually exclusive).
 */
export function resolveViewerInvestingDealRoles(
  members: DealInvestorRow[],
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
  investorPayload?: DealInvestorsPayload,
): ViewerInvestingDealRoles {
  const sponsorLabels = new Set<string>()
  let isInvestor = false
  if (!viewerEmailNorm) return { sponsorRoleLabels: [], isInvestor }

  for (const list of [members, investors]) {
    for (const m of list) {
      if (!investorRowMatchesViewerEmail(m, viewerEmailNorm)) continue
      for (const lab of sponsorRoleLabelsFromRow(m)) sponsorLabels.add(lab)
      if (rowHasLpInvestorRole(m)) isInvestor = true
    }
  }

  if (investorPayload) {
    if (committedAmountForViewerEmail(investorPayload, viewerEmailNorm) > 0) {
      isInvestor = true
    }
    if (viewerOnDealAsInvitedInvestor(investorPayload, viewerEmailNorm)) {
      isInvestor = true
    }
  }

  const sponsorRoleLabels = SPONSOR_ROLE_DISPLAY_ORDER.filter((l) =>
    sponsorLabels.has(l),
  )
  return { sponsorRoleLabels, isInvestor }
}

/** Display label for investing → Deals tab “Your role” column. */
export function formatViewerInvestingDealRolesLabel(
  roles: ViewerInvestingDealRoles,
): string {
  const parts: string[] = [...roles.sponsorRoleLabels]
  if (roles.isInvestor) parts.push(LP_INVESTORS_ROLE_LABEL)
  if (parts.length === 0) return "—"
  return parts.join(", ")
}

export type InvestingDealsPageScopeEntry = {
  row: DealListRow
  payload: DealInvestorsPayload
  members: DealInvestorRow[]
  leadSponsorDisplayName?: string
}

/** Deals visible on `/investing/deals` (invested, invited LP, sponsor roster, or assignee). */
export async function mapInvestingDealsPageScope(
  rows: DealListRow[],
): Promise<InvestingDealsPageScopeEntry[]> {
  const viewerEmailNorm = investingViewerEmailNorm()
  if (!viewerEmailNorm) return []
  const investorVisible = filterDealListRowsVisibleToInvestors(rows)
  const withPayload = await Promise.all(
    investorVisible.map(async (row) => {
      const { payload, members, leadSponsorDisplayName } =
        await loadDealRosterForInvestingScope(row)
      return { row, payload, members, leadSponsorDisplayName }
    }),
  )
  return withPayload.filter(({ payload, members }) =>
    dealIsInViewerInvestingDealsPageScope(payload, members),
  )
}

/**
 * `/investing/investments` only — committed capital, Invest Now in progress, or invited
 * LP who has not started onboarding. Excludes sponsor-only / assignee deals.
 */
export async function mapInvestingInvestmentsPageScope(
  rows: DealListRow[],
): Promise<InvestingDealsPageScopeEntry[]> {
  const viewerEmailNorm = investingViewerEmailNorm()
  if (!viewerEmailNorm) return []
  const investorVisible = filterDealListRowsVisibleToInvestors(rows)
  const withPayload = await Promise.all(
    investorVisible.map(async (row) => {
      const { payload, members, leadSponsorDisplayName } =
        await loadDealRosterForInvestingScope(row)
      return { row, payload, members, leadSponsorDisplayName }
    }),
  )
  return withPayload.filter(({ payload }) =>
    dealIsInViewerInvestmentsListScope(payload, viewerEmailNorm),
  )
}

export async function filterDealListToInvestingDealsPage(
  rows: DealListRow[],
): Promise<DealListRow[]> {
  const scoped = await mapInvestingDealsPageScope(rows)
  return scoped.map(({ row }) => row)
}
