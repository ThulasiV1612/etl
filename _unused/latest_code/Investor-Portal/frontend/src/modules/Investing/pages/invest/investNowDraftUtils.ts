import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import {
  investorEsignWasSent,
  investorInvestmentProfileIsComplete,
  investorRowCommittedNumeric,
  investorRowMatchesViewerEmail,
} from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import {
  completedInvestNowProgress,
  investNowDraftProgressFromInvestorRow,
  type InvestNowDraftProgress,
} from "./investNowDraftProgress"

export type InvestNowDraftResumeScope = {
  investmentId?: string
  userInvestorProfileId?: string
  profileId?: string
}

export type InvestNowDraftSnapshot = {
  progress: InvestNowDraftProgress
  resumeScope: InvestNowDraftResumeScope
}

/** Row has Invest Now progress saved but e-sign is not fully complete for that profile. */
export function isInvestNowDraftInvestorRow(
  row: DealInvestorRow,
  viewerEmailNorm: string,
): boolean {
  if (!investorRowMatchesViewerEmail(row, viewerEmailNorm)) return false
  if (row.investorKind === "lp_roster") return false
  if (investorInvestmentProfileIsComplete(row)) return false
  if (investorEsignWasSent(row)) return true
  if (investorRowCommittedNumeric(row) > 0) return true
  if (String(row.userInvestorProfileId ?? "").trim()) return true
  return false
}

/** Any saved draft for this deal (any book profile) for the signed-in LP. */
export function dealHasInvestNowDraftForViewer(
  investors: DealInvestorRow[],
  viewerEmailNorm?: string,
): boolean {
  const em =
    viewerEmailNorm?.trim().toLowerCase() ||
    getSessionUserEmail()?.trim().toLowerCase() ||
    ""
  if (!em) return false
  return investors.some((row) => isInvestNowDraftInvestorRow(row, em))
}

/** First draft row for resume from the investments list (any profile with saved progress). */
export function firstInvestNowDraftRowForViewer(
  investors: DealInvestorRow[],
  viewerEmailNorm?: string,
): DealInvestorRow | undefined {
  const em =
    viewerEmailNorm?.trim().toLowerCase() ||
    getSessionUserEmail()?.trim().toLowerCase() ||
    ""
  if (!em) return undefined
  return investors.find((row) => isInvestNowDraftInvestorRow(row, em))
}

/** Progress + resume scope for the viewer’s first Invest Now draft on a deal. */
export function investNowDraftSnapshotForViewer(
  investors: DealInvestorRow[],
  viewerEmailNorm?: string,
): InvestNowDraftSnapshot | null {
  const draftRow = firstInvestNowDraftRowForViewer(investors, viewerEmailNorm)
  if (!draftRow) return null
  return {
    progress: investNowDraftProgressFromInvestorRow(draftRow),
    resumeScope: {
      investmentId: String(draftRow.id ?? "").trim() || undefined,
      userInvestorProfileId:
        String(draftRow.userInvestorProfileId ?? "").trim() || undefined,
      profileId: String(draftRow.profileId ?? "").trim() || undefined,
    },
  }
}

export function dealHasFullyCompletedProfileEsign(
  investors: DealInvestorRow[],
  viewerEmailNorm?: string,
): boolean {
  const em =
    viewerEmailNorm?.trim().toLowerCase() ||
    getSessionUserEmail()?.trim().toLowerCase() ||
    ""
  if (!em) return false
  return investors.some(
    (row) =>
      investorRowMatchesViewerEmail(row, em) &&
      investorInvestmentProfileIsComplete(row),
  )
}

/** Draft stepper progress, or 100% when every remaining viewer row is already complete. */
export function investNowProgressForViewer(
  investors: DealInvestorRow[],
  viewerEmailNorm?: string,
): InvestNowDraftProgress | undefined {
  const draftRow = firstInvestNowDraftRowForViewer(investors, viewerEmailNorm)
  if (draftRow) return investNowDraftProgressFromInvestorRow(draftRow)
  if (dealHasFullyCompletedProfileEsign(investors, viewerEmailNorm)) {
    return completedInvestNowProgress()
  }
  return undefined
}

export function findInvestorRowForInvestNowScope(
  investors: DealInvestorRow[],
  scope: {
    email: string
    userInvestorProfileId?: string
    profileId?: string
    investmentId?: string
  },
): DealInvestorRow | undefined {
  const em = scope.email.trim().toLowerCase()
  const invId = scope.investmentId?.trim().toLowerCase()
  const uip = scope.userInvestorProfileId?.trim().toLowerCase()
  const pid = scope.profileId?.trim()
  if (invId) {
    return investors.find(
      (r) =>
        String(r.id ?? "").trim().toLowerCase() === invId &&
        investorRowMatchesViewerEmail(r, em),
    )
  }
  return investors.find((r) => {
    if (!investorRowMatchesViewerEmail(r, em)) return false
    if (uip) {
      return (
        String(r.userInvestorProfileId ?? "").trim().toLowerCase() === uip
      )
    }
    if (pid) return String(r.profileId ?? "").trim() === pid
    return false
  })
}

export function committedAmountFromRow(row: DealInvestorRow | undefined): string {
  if (!row) return ""
  const n = parseMoneyDigits(String(row.committed ?? "").trim())
  if (Number.isFinite(n) && n > 0) return String(n)
  const raw = parseMoneyDigits(String(row.commitmentAmountRaw ?? "").trim())
  if (Number.isFinite(raw) && raw > 0) return String(raw)
  return ""
}
