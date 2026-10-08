import {
  getLpInvestorDealIdsFromSession,
  isDealParticipantUser,
  isLpInvestorSessionUser,
} from "@/common/auth/roleUtils"
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import type { InvestmentListRow } from "./investments.types"

const STORAGE_KEY = "ip_investing_runtime_rows_v1"

type StoredRow = InvestmentListRow & {
  dealId: string
  /** Lowercased; empty if written before per-user scoping. */
  ownerEmail: string
  updatedAtIso: string
}

function shouldFilterInvestmentsToCurrentOwner(): boolean {
  return isLpInvestorSessionUser() || isDealParticipantUser()
}

function isStoredRowVisibleToCurrentSession(s: StoredRow): boolean {
  const me = getSessionUserEmail().trim().toLowerCase()
  if (!me) return false
  const owner = (s.ownerEmail ?? "").trim().toLowerCase()
  if (owner) return owner === me
  if (!shouldFilterInvestmentsToCurrentOwner()) return false
  const lpDeals = new Set(
    getLpInvestorDealIdsFromSession().map((id) => id.trim()),
  )
  if (lpDeals.size > 0 && lpDeals.has(s.dealId.trim())) return true
  return false
}

function readStoredRows(): StoredRow[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: StoredRow[] = []
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue
      const row = x as Partial<StoredRow>
      const id = String(row.id ?? "").trim()
      const dealId = String(row.dealId ?? "").trim()
      if (!id || !dealId) continue
      out.push({
        id,
        dealId,
        ownerEmail: String(
          (row as Partial<StoredRow>).ownerEmail ?? "",
        )
          .trim()
          .toLowerCase(),
        investmentName: String(row.investmentName ?? "").trim() || "—",
        offeringName: String(row.offeringName ?? "").trim() || "—",
        investmentProfile: String(row.investmentProfile ?? "").trim() || "—",
        commitmentProfileId: (() => {
          const t = String(
            (row as Partial<StoredRow>).commitmentProfileId ?? "",
          ).trim()
          return t || undefined
        })(),
        userInvestorProfileId: (() => {
          const t = String(
            (row as Partial<StoredRow>).userInvestorProfileId ?? "",
          ).trim()
          return t || undefined
        })(),
        userInvestorProfileName: (() => {
          const t = String(
            (row as Partial<StoredRow>).userInvestorProfileName ?? "",
          ).trim()
          return t || undefined
        })(),
        investedAmount: Number(row.investedAmount ?? 0) || 0,
        distributedAmount: Number(row.distributedAmount ?? 0) || 0,
        currentValuation: String(row.currentValuation ?? "").trim() || "—",
        dealCloseDate: String(row.dealCloseDate ?? "").trim() || "—",
        status: String(row.status ?? "").trim() || "—",
        actionRequired: String(row.actionRequired ?? "").trim() || "None",
        archived: Boolean(row.archived),
        updatedAtIso: String(row.updatedAtIso ?? "").trim() || "",
      })
    }
    return out
  } catch {
    return []
  }
}

function writeStoredRows(rows: StoredRow[]): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

export function investmentRuntimeIdForDeal(dealId: string): string {
  const safe = dealId.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `runtime-${safe}`
}

export function upsertRuntimeInvestmentRow(input: {
  dealId: string
  investmentName: string
  offeringName: string
  investmentProfile: string
  commitmentProfileId?: string
  userInvestorProfileId?: string
  userInvestorProfileName?: string
  investedAmount: number
  distributedAmount?: number
  currentValuation?: string
  dealCloseDate?: string
  status?: string
  actionRequired?: string
}): void {
  const dealId = input.dealId.trim()
  if (!dealId) return
  const id = investmentRuntimeIdForDeal(dealId)
  const rows = readStoredRows()
  const ownerEmail = getSessionUserEmail().trim().toLowerCase()
  const next: StoredRow = {
    id,
    dealId,
    ownerEmail,
    investmentName: input.investmentName.trim() || "—",
    offeringName: input.offeringName.trim() || "—",
    investmentProfile: input.investmentProfile.trim() || "—",
    commitmentProfileId: (input.commitmentProfileId ?? "").trim() || undefined,
    userInvestorProfileId: (input.userInvestorProfileId ?? "").trim() || undefined,
    userInvestorProfileName: (input.userInvestorProfileName ?? "").trim() || undefined,
    investedAmount: Number.isFinite(input.investedAmount) ? input.investedAmount : 0,
    distributedAmount: Number.isFinite(input.distributedAmount)
      ? Number(input.distributedAmount)
      : 0,
    currentValuation: input.currentValuation?.trim() || "—",
    dealCloseDate: input.dealCloseDate?.trim() || "—",
    status: input.status?.trim() || "—",
    actionRequired: input.actionRequired?.trim() || "None",
    archived: false,
    updatedAtIso: new Date().toISOString(),
  }
  const idx = rows.findIndex((r) => r.id === id)
  if (idx >= 0) rows[idx] = next
  else rows.unshift(next)
  writeStoredRows(rows)
}

function toPublicListRow(
  s: StoredRow,
): InvestmentListRow {
  // Keep `dealId` on the row so list merge/collapse can key the same as API rows (uuid),
  // not only `id` = `runtime-...` (which was splitting one deal into two data-table rows).
  const { updatedAtIso: _a, ownerEmail: _b, ...row } = s
  return row
}

export function readRuntimeInvestmentRows(): InvestmentListRow[] {
  return readStoredRows()
    .filter((s) => isStoredRowVisibleToCurrentSession(s))
    .map((s) => toPublicListRow(s))
}

export function readRuntimeInvestmentRowById(
  id: string,
): InvestmentListRow | undefined {
  const key = id.trim()
  if (!key) return undefined
  const found = readStoredRows().find((r) => r.id === key)
  if (!found) return undefined
  if (!isStoredRowVisibleToCurrentSession(found)) return undefined
  return toPublicListRow(found)
}
