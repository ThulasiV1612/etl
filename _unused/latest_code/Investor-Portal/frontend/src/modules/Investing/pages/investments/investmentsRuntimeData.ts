/**
 * Investments list: server-backed rows (deals the user has committed on) plus
 * any localStorage rows from deal flows, merged by deal id.
 */
import {
  enrichInvestmentListRow,
  fetchUserInvestorProfileNameMap,
} from "./investedAsDisplay"
import { loadInvestmentListRowsFromDeals } from "./investmentsListFromDeals"
import type { InvestmentDetailRecord, InvestmentListRow } from "./investments.types"
import {
  readRuntimeInvestmentRowById,
  readRuntimeInvestmentRows,
} from "./investmentsRuntimeStore"

/**
 * One canonical key per investment (deal) so the same deal never splits across two rows
 * (e.g. `dealId` vs `id`, or casing differences).
 */
function dealKeyForRow(r: InvestmentListRow): string {
  const d = (r.dealId ?? "").trim()
  if (d) return d.toLowerCase()
  return (r.id ?? "").trim().toLowerCase()
}

/**
 * API rows fill the list when the server shows a commitment. Rows from
 * `upsertRuntimeInvestmentRow` (deal “add investment” / LP invest flow) take
 * precedence for invested amount and related fields so the amount stays what
 * that flow wrote.
 */
/** Sum merge for two or more list rows that refer to the same deal (key already matches). */
function mergeRowsSameDeal(group: InvestmentListRow[]): InvestmentListRow {
  if (group.length === 0) {
    throw new Error("mergeRowsSameDeal: empty group")
  }
  if (group.length === 1) {
    const a = group[0]!
    const d = (a.dealId ?? "").trim() || (a.id ?? "").trim()
    return { ...a, dealId: d }
  }
  const sorted = [...group].sort((a, b) => b.investedAmount - a.investedAmount)
  const base = sorted[0]!
  let invSum = 0
  let distSum = 0
  let val = "—"
  for (const row of group) {
    invSum += row.investedAmount
    distSum += row.distributedAmount
    if (row.currentValuation && row.currentValuation !== "—")
      val = row.currentValuation
  }
  const dealFromAny = group.find((r) => (r.dealId ?? "").trim())
  const dealId =
    (dealFromAny?.dealId ?? "").trim() ||
    (base.dealId ?? "").trim() ||
    (base.id ?? "").trim()
  return {
    ...base,
    id: base.id,
    dealId,
    investedAmount: invSum,
    distributedAmount: distSum,
    currentValuation: val,
  }
}

function mergeInvestmentLists(
  fromApi: InvestmentListRow[],
  fromLocal: InvestmentListRow[],
): InvestmentListRow[] {
  const byKey = new Map<string, InvestmentListRow>()
  for (const a of fromApi) {
    const k = dealKeyForRow(a)
    if (!k) continue
    const next = {
      ...a,
      dealId: (a.dealId ?? "").trim() || (a.id ?? "").trim(),
    }
    const existing = byKey.get(k)
    if (!existing) {
      byKey.set(k, next)
      continue
    }
    byKey.set(
      k,
      mergeRowsSameDeal([existing, next]),
    )
  }
  for (const l of fromLocal) {
    const k = dealKeyForRow(l)
    if (!k) continue
    const existing = byKey.get(k)
    if (!existing) {
      /** Do not surface orphan local rows — only merge when the server already lists this deal. */
      continue
    }
    // Local / LP flow row wins for display fields; amounts stay on the local row
    const investedAmount = l.investedAmount
    byKey.set(k, {
      ...existing,
      id: l.id,
      dealId:
        (l.dealId ?? existing.dealId ?? "").trim() ||
        (l.id ?? existing.id ?? "").trim(),
      investedAmount,
      onboardingBucket:
        investedAmount > 0
          ? "in_progress"
          : (l.onboardingBucket ?? existing.onboardingBucket),
      investmentName: l.investmentName,
      offeringName: l.offeringName,
      investmentProfile: l.investmentProfile,
      commitmentProfileId: l.commitmentProfileId ?? existing.commitmentProfileId,
      userInvestorProfileId:
        l.userInvestorProfileId ?? existing.userInvestorProfileId,
      userInvestorProfileName:
        l.userInvestorProfileName ?? existing.userInvestorProfileName,
      dealCloseDate: l.dealCloseDate,
      status: l.status,
      distributedAmount: Math.max(
        existing.distributedAmount,
        l.distributedAmount,
      ),
      currentValuation:
        l.currentValuation && l.currentValuation !== "—"
          ? l.currentValuation
          : existing.currentValuation,
      actionRequired: l.actionRequired || existing.actionRequired,
    })
  }
  return Array.from(byKey.values()).sort((a, b) =>
    (a.investmentName || "").localeCompare(b.investmentName || "", "en"),
  )
}

/**
 * One data-table row per deal: if the merged list has multiple rows for the same deal
 * (e.g. two saved profiles / commitments), sum invested and distributed and drop
 * a single “Invested as” line (the detail view shows a per-profile breakdown).
 */
function collapseInvestmentsListRowsByDeal(
  rows: InvestmentListRow[],
): InvestmentListRow[] {
  const withKey: InvestmentListRow[] = []
  const noKey: InvestmentListRow[] = []
  for (const r of rows) {
    const k = dealKeyForRow(r)
    if (k) withKey.push(r)
    else noKey.push(r)
  }
  const m = new Map<string, InvestmentListRow[]>()
  for (const r of withKey) {
    const k = dealKeyForRow(r)
    const a = m.get(k) ?? []
    a.push(r)
    m.set(k, a)
  }
  const out: InvestmentListRow[] = [...noKey]
  for (const [, group] of m) {
    if (group.length === 1) {
      const a = group[0]!
      const d = (a.dealId ?? "").trim() || (a.id ?? "").trim()
      out.push({ ...a, dealId: d })
      continue
    }
    const sorted = [...group].sort((a, b) => b.investedAmount - a.investedAmount)
    const base = sorted[0]!
    const merged = mergeRowsSameDeal(group)
    out.push({
      ...merged,
      id: base.id,
      dealId: merged.dealId,
      investmentProfile: "—",
      userInvestorProfileId: undefined,
      commitmentProfileId: undefined,
    })
  }
  return out.sort((a, b) =>
    (a.investmentName || "").localeCompare(b.investmentName || "", "en"),
  )
}

export async function getMergedInvestmentListRows(): Promise<InvestmentListRow[]> {
  const [fromApi, fromLocal] = await Promise.all([
    loadInvestmentListRowsFromDeals(),
    Promise.resolve(readRuntimeInvestmentRows()),
  ])
  const merged = mergeInvestmentLists(fromApi, fromLocal)
  const collapsed = collapseInvestmentsListRowsByDeal(merged)
  const needsProfileBook = collapsed.some(
    (r) =>
      (r.userInvestorProfileId ?? "").trim() ||
      (r.commitmentProfileId ?? "").trim(),
  )
  const nameByBook = needsProfileBook
    ? await fetchUserInvestorProfileNameMap()
    : new Map<string, string>()
  return collapsed.map((r) => enrichInvestmentListRow(r, nameByBook))
}

/**
 * When the user opens an investment that exists in the runtime store **and** on the server,
 * keep list row fields the client flow updated (id, amounts, close date) but use the server
 * `investedAsBreakdown` / `investedAs` so the Profile and investment tab lists **every**
 * book profile and committed amount (same type, different profile names, etc.).
 */
export function mergeServerInvestmentDetailWithLocal(
  fromApi: InvestmentDetailRecord,
  fromLocal: InvestmentDetailRecord,
): InvestmentDetailRecord {
  const li = fromLocal.list
  const a = fromApi.list
  return {
    ...fromApi,
    id: li.id,
    list: {
      ...a,
      id: li.id,
      dealId: (li.dealId ?? a.dealId ?? "").trim() || a.dealId,
      investedAmount: li.investedAmount,
      distributedAmount: Math.max(
        Number(a.distributedAmount) || 0,
        Number(li.distributedAmount) || 0,
      ),
      investmentName: (li.investmentName ?? "").trim() || a.investmentName,
      offeringName: (li.offeringName ?? "").trim() || a.offeringName,
      investmentProfile: (li.investmentProfile ?? "").trim() || a.investmentProfile,
      commitmentProfileId: li.commitmentProfileId ?? a.commitmentProfileId,
      userInvestorProfileId: li.userInvestorProfileId ?? a.userInvestorProfileId,
      userInvestorProfileName:
        a.userInvestorProfileName ?? li.userInvestorProfileName,
      dealCloseDate: li.dealCloseDate,
      status: li.status,
      currentValuation: li.currentValuation,
      actionRequired: li.actionRequired,
      archived: li.archived ?? a.archived,
    },
  }
}

function buildDetailRecordFromListRow(list: InvestmentListRow): InvestmentDetailRecord {
  return {
    id: list.id,
    list,
    propertyName: list.investmentName || "—",
    propertyType: "Other",
    propertyStatus: "Other",
    city: "—",
    state: "—",
    numberOfUnits: "—",
    occupancyPct: "—",
    ownedSince: "—",
    yearBuilt: "—",
    investedAs: (list.investmentProfile ?? "").trim() || "—",
    investedAsBreakdown: [
      (() => {
        const raw = (list.investmentProfile ?? "").trim() || "—"
        if (raw === "—")
          return {
            profileName: "—" as const,
            investorType: "—" as const,
            investedAmount: list.investedAmount,
          }
        const idx = raw.indexOf(" — ")
        if (idx >= 0) {
          return {
            profileName: raw.slice(0, idx).trim() || "—",
            investorType: raw.slice(idx + 3).trim() || "—",
            investedAmount: list.investedAmount,
          }
        }
        return {
          profileName: "—",
          investorType: raw,
          investedAmount: list.investedAmount,
        }
      })(),
    ],
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

export function getInvestmentDetail(
  id: string,
): InvestmentDetailRecord | undefined {
  const row = readRuntimeInvestmentRowById(id)
  if (!row) return undefined
  return buildDetailRecordFromListRow(row)
}

export { readRuntimeInvestmentRowById, readRuntimeInvestmentRows }
