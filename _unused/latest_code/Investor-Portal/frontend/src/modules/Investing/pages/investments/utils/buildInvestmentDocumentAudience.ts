import { getLpInvestorDealIdsFromSession } from "@/common/auth/roleUtils"
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { getSessionUserId } from "@/common/auth/sessionUserId"
import {
  fetchDealInvestorClasses,
  fetchDealInvestors,
} from "@/modules/Syndication/Deals/api/dealsApi"
import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import { investorRowMatchesViewerEmail } from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import { viewerHasDealParticipation } from "@/modules/Investing/utils/investingViewerDealScope"
import type { InvestmentDocumentAudienceContext } from "./investmentDocumentAudience"
import { EMPTY_INVESTMENT_DOCUMENT_AUDIENCE } from "./investmentDocumentAudience"

function normEmail(s: string): string {
  return s.trim().toLowerCase()
}

/** All deal investor rows for this login (any commitment amount). */
function viewerRowsForEmail(
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
): DealInvestorRow[] {
  return investors.filter((inv) =>
    investorRowMatchesViewerEmail(inv, viewerEmailNorm),
  )
}

function collectViewerInvestorIds(
  investors: DealInvestorRow[],
  viewerEmailNorm: string,
): Set<string> {
  const ids = new Set<string>()
  for (const inv of investors) {
    if (!investorRowMatchesViewerEmail(inv, viewerEmailNorm)) continue
    for (const raw of [
      inv.id,
      inv.contactId,
      inv.profileId,
      inv.userInvestorProfileId,
      inv.offeringId,
    ]) {
      const id = raw?.trim()
      if (id) ids.add(id)
    }
  }
  return ids
}

function mergeInvestorLists(
  a: DealInvestorRow[],
  b: DealInvestorRow[],
): DealInvestorRow[] {
  const byId = new Map<string, DealInvestorRow>()
  for (const row of [...a, ...b]) {
    const id = row.id?.trim()
    if (id) byId.set(id, row)
  }
  return [...byId.values()]
}

function sessionIncludesDeal(dealId: string | null | undefined): boolean {
  const key = dealId?.trim().toLowerCase() ?? ""
  if (!key) return false
  return getLpInvestorDealIdsFromSession().some(
    (id) => id.trim().toLowerCase() === key,
  )
}

/**
 * Viewer context for Shared With on the deal Documents tab:
 * investors, classes, and sponsor-added LPs this user represents on the deal.
 */
export async function buildInvestmentDocumentAudience(
  dealId: string,
): Promise<InvestmentDocumentAudienceContext> {
  const id = dealId?.trim() ?? ""
  if (!id) return EMPTY_INVESTMENT_DOCUMENT_AUDIENCE
  const em = getSessionUserEmail()
  if (!em?.trim()) return EMPTY_INVESTMENT_DOCUMENT_AUDIENCE
  const emn = normEmail(em)
  try {
    const [fullPayload, lpPayload, dealClasses] = await Promise.all([
      fetchDealInvestors(id, { lpInvestorsOnly: false }),
      fetchDealInvestors(id, { lpInvestorsOnly: true }),
      fetchDealInvestorClasses(id),
    ])
    const allInvestors = mergeInvestorLists(
      fullPayload.investors,
      lpPayload.investors,
    )
    let viewerRows = viewerRowsForEmail(allInvestors, emn)
    if (viewerRows.length === 0) {
      viewerRows = viewerRowsForEmail(lpPayload.investors, emn)
    }
    const viewerInvestorIds = collectViewerInvestorIds(allInvestors, emn)
    const viewerUserId = getSessionUserId().trim() || undefined

    if (viewerRows.length > 0 || viewerInvestorIds.size > 0) {
      return { viewerRows, dealClasses, viewerInvestorIds, viewerUserId }
    }

    if (
      sessionIncludesDeal(id) ||
      viewerHasDealParticipation(fullPayload, emn) ||
      viewerHasDealParticipation(lpPayload, emn)
    ) {
      return { viewerRows: [], dealClasses, viewerInvestorIds, viewerUserId }
    }

    return EMPTY_INVESTMENT_DOCUMENT_AUDIENCE
  } catch {
    if (sessionIncludesDeal(id)) {
      return {
        viewerRows: [],
        dealClasses: [],
        viewerInvestorIds: new Set(),
        viewerUserId: getSessionUserId().trim() || undefined,
      }
    }
    return EMPTY_INVESTMENT_DOCUMENT_AUDIENCE
  }
}
