import { getSessionUserEmail } from "../../../../common/auth/sessionUserEmail"
import { fetchDealInvestors } from "../api/dealsApi"
import { resolveInvestmentStatusSelectValue } from "../constants/investment-status"
import type { DealInvestorsPayload } from "../types/deal-investors.types"
import { parseMoneyDigits } from "./offeringMoneyFormat"

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Calendar date for Invest Now forms — ignores eSign workflow markers (`pending`, `completed`). */
export function parseInvestNowDocSignedCalendarDate(
  raw: string | null | undefined,
): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  const day = s.slice(0, 10)
  return ISO_DAY_RE.test(day) ? day : ""
}

export interface LpInvestNowPrefill {
  profileId: string
  userInvestorProfileId: string
  amount: string
  status: string
  docSignedDate: string
  /** Roster / investment row id; Invest now PATCHes this row (exempt from duplicate-profile blocks). */
  viewerRowId?: string
}

/**
 * Build prefill from an existing investors response (avoids a second request when
 * the caller already has the payload for duplicate-profile checks).
 */
export function getLpInvestNowPrefillFromPayload(
  payload: DealInvestorsPayload,
  viewerEmailNorm: string,
): LpInvestNowPrefill | null {
  const em = (viewerEmailNorm || "").trim().toLowerCase()
  if (!em) return null
  const row = payload.investors.find(
    (r) => String(r.userEmail ?? "").trim().toLowerCase() === em,
  )
  if (!row) return null
  const profileId = String(row.profileId ?? "").trim()
  const userInvestorProfileId = String(
    row.userInvestorProfileId ?? "",
  ).trim()
  let amount = ""
  const n = parseMoneyDigits(String(row.committed ?? "").trim())
  if (Number.isFinite(n) && n > 0) amount = String(n)
  const status = resolveInvestmentStatusSelectValue(
    String(row.status ?? "").trim(),
  )
  let docSignedDate = parseInvestNowDocSignedCalendarDate(row.docSignedDateIso)
  const vid = String(row.id ?? "").trim()
  return {
    profileId,
    userInvestorProfileId,
    amount,
    status,
    docSignedDate,
    ...(vid ? { viewerRowId: vid } : {}),
  }
}

/**
 * Loads profile, commitment, status, and doc signed date for the signed-in LP on this deal
 * (same source as the Investors tab) so Invest Now opens with sponsor-recorded values.
 */
export async function fetchLpInvestNowPrefill(
  dealId: string,
): Promise<LpInvestNowPrefill | null> {
  const did = dealId.trim()
  if (!did) return null
  const email = getSessionUserEmail()?.trim().toLowerCase()
  if (!email) return null
  try {
    const payload = await fetchDealInvestors(did, { lpInvestorsOnly: true })
    return getLpInvestNowPrefillFromPayload(payload, email)
  } catch {
    return null
  }
}
