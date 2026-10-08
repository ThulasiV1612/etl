import type { DealInvestorClass } from "../types/deal-investor-class.types"

export type InvestorClassAllocationMetricStatus =
  | "ok"
  | "under"
  | "over"
  | "exact"

export const INVESTOR_CLASS_ALLOCATION_UNDER_100_INFO =
  "Total raise and distributions allocation across investor classes should be 100%."

export interface InvestorClassAllocationTotals {
  legalOwnershipTotal: number
  distributionShareTotal: number
  legalOwnershipStatus: InvestorClassAllocationMetricStatus
  distributionShareStatus: InvestorClassAllocationMetricStatus
  /** True when either metric is over or exactly 100% — block adding another class. */
  addDisabled: boolean
  hasOver: boolean
  hasExact: boolean
  hasUnder: boolean
  showNotice: boolean
  messages: string[]
}

function parsePctNumber(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, raw)
  }
  if (typeof raw !== "string") return 0
  const n = parseFloat(raw.replace(/%/g, "").trim())
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function readPctFromAdvancedJson(
  raw: string | undefined | null,
  camelKey: string,
  snakeKey: string,
): number {
  if (!raw?.trim()) return 0
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const v = o[camelKey] ?? o[snakeKey]
    return parsePctNumber(v)
  } catch {
    return 0
  }
}

function roundPctTotal(n: number): number {
  return Math.round(n * 100) / 100
}

function allocationStatus(
  total: number,
  trackMetric: boolean,
): InvestorClassAllocationMetricStatus {
  if (!trackMetric) return "ok"
  const t = roundPctTotal(total)
  if (t > 100) return "over"
  if (t === 100) return "exact"
  if (t < 100) return "under"
  return "ok"
}

function formatPctTotal(n: number): string {
  return roundPctTotal(n).toFixed(2)
}

function buildAllocationMessages(
  legalOwnershipTotal: number,
  distributionShareTotal: number,
  legalOwnershipStatus: InvestorClassAllocationMetricStatus,
  distributionShareStatus: InvestorClassAllocationMetricStatus,
): string[] {
  const messages: string[] = []

  if (legalOwnershipStatus === "over") {
    messages.push(
      `Legal ownership across classes is ${formatPctTotal(legalOwnershipTotal)}% (maximum 100%). Reduce the percentage in one or more classes.`,
    )
  } else if (legalOwnershipStatus === "exact") {
    messages.push(
      "Legal ownership is fully allocated at 100% across all classes.",
    )
  }

  if (distributionShareStatus === "over") {
    messages.push(
      `Distribution share across classes is ${formatPctTotal(distributionShareTotal)}% (maximum 100%). Reduce the percentage in one or more classes.`,
    )
  } else if (distributionShareStatus === "exact") {
    messages.push(
      "Distribution share is fully allocated at 100% across all classes.",
    )
  }

  if (legalOwnershipStatus === "under" || distributionShareStatus === "under") {
    messages.push(INVESTOR_CLASS_ALLOCATION_UNDER_100_INFO)
  }

  return messages
}

function appendAddDisabledHint(
  messages: string[],
  legalOwnershipStatus: InvestorClassAllocationMetricStatus,
  distributionShareStatus: InvestorClassAllocationMetricStatus,
): string[] {
  const blocked =
    legalOwnershipStatus !== "ok" || distributionShareStatus !== "ok"
  if (!blocked) return messages
  return messages
  // "Add Investor Class is disabled until ownership or distribution percentages are reduced in an existing class."
}

function sumExistingRowsForAllocation(
  rows: readonly DealInvestorClass[],
  skipClassId?: string,
): { legalOwnershipTotal: number; distributionShareTotal: number } {
  let legalOwnershipTotal = 0
  let distributionShareTotal = 0

  for (const row of rows) {
    if (skipClassId && row.id === skipClassId) continue
    const raw = row.advancedOptionsJson
    legalOwnershipTotal += readPctFromAdvancedJson(
      raw,
      "entityLegalOwnershipPct",
      "entity_legal_ownership_pct",
    )
    if (row.subscriptionType === "mezzanine") continue
    if (row.subscriptionType === "preferred_equity") continue
    distributionShareTotal += readPctFromAdvancedJson(
      raw,
      "distributionSharePct",
      "distribution_share_pct",
    )
  }

  return {
    legalOwnershipTotal: roundPctTotal(legalOwnershipTotal),
    distributionShareTotal: roundPctTotal(distributionShareTotal),
  }
}

function formatRemainderPercent(allocatedTotal: number): string {
  if (!Number.isFinite(allocatedTotal) || allocatedTotal <= 0) return ""
  const remainder = roundPctTotal(
    Math.max(0, Math.min(100, 100 - allocatedTotal)),
  )
  return `${remainder.toFixed(2)}%`
}

/**
 * Default ownership / distribution % when adding a class: 100 minus the sum of all
 * existing classes (not just the first).
 */
export function investorClassRemainderPercentsForNewClass(
  existingRows: readonly DealInvestorClass[],
): { entityLegalOwnershipPct: string; distributionSharePct: string } {
  if (!existingRows.length) {
    return { entityLegalOwnershipPct: "", distributionSharePct: "" }
  }
  const { legalOwnershipTotal, distributionShareTotal } =
    sumExistingRowsForAllocation(existingRows)
  const entityLegalOwnershipPct = formatRemainderPercent(legalOwnershipTotal)
  const distAllocated =
    distributionShareTotal > 0 ? distributionShareTotal : legalOwnershipTotal
  const distributionSharePct =
    formatRemainderPercent(distAllocated) || entityLegalOwnershipPct
  return { entityLegalOwnershipPct, distributionSharePct }
}

/** Validate proposed class % against all other classes on the deal (create / edit save). */
export function validateInvestorClassAllocationForSave({
  existingRows,
  entityLegalOwnershipPct,
  distributionSharePct,
  subscriptionType,
  editingClassId,
}: {
  existingRows: readonly DealInvestorClass[]
  entityLegalOwnershipPct: string
  distributionSharePct: string
  subscriptionType: string
  editingClassId?: string
}): string | null {
  const existing = sumExistingRowsForAllocation(existingRows, editingClassId)
  const legalOwnershipTotal = roundPctTotal(
    existing.legalOwnershipTotal + parsePctNumber(entityLegalOwnershipPct),
  )
  const includeDistribution =
    subscriptionType !== "mezzanine" &&
    subscriptionType !== "preferred_equity"
  const distributionShareTotal = includeDistribution
    ? roundPctTotal(
        existing.distributionShareTotal + parsePctNumber(distributionSharePct),
      )
    : existing.distributionShareTotal

  if (legalOwnershipTotal > 100) {
    return `Total legal ownership across classes would be ${formatPctTotal(legalOwnershipTotal)}% (maximum 100%). Reduce this or another class.`
  }
  if (includeDistribution && distributionShareTotal > 100) {
    return `Total distribution share across classes would be ${formatPctTotal(distributionShareTotal)}% (maximum 100%). Reduce this or another class.`
  }
  return null
}

function buildInvestorClassAllocationTotalsFromSums({
  legalOwnershipTotal,
  distributionShareTotal,
  trackDistribution,
  hasClasses,
}: {
  legalOwnershipTotal: number
  distributionShareTotal: number
  trackDistribution: boolean
  hasClasses: boolean
}): InvestorClassAllocationTotals {
  const legalOwnershipStatus = allocationStatus(
    legalOwnershipTotal,
    hasClasses,
  )
  const distributionShareStatus = allocationStatus(
    distributionShareTotal,
    hasClasses && trackDistribution,
  )
  const hasOver =
    legalOwnershipStatus === "over" || distributionShareStatus === "over"
  const hasExact =
    legalOwnershipStatus === "exact" || distributionShareStatus === "exact"
  const hasUnder =
    legalOwnershipStatus === "under" || distributionShareStatus === "under"
  const addDisabled = hasOver || hasExact
  const messages = appendAddDisabledHint(
    buildAllocationMessages(
      legalOwnershipTotal,
      distributionShareTotal,
      legalOwnershipStatus,
      distributionShareStatus,
    ),
    legalOwnershipStatus,
    distributionShareStatus,
  )

  return {
    legalOwnershipTotal: roundPctTotal(legalOwnershipTotal),
    distributionShareTotal: roundPctTotal(distributionShareTotal),
    legalOwnershipStatus,
    distributionShareStatus,
    addDisabled,
    hasOver,
    hasExact,
    hasUnder,
    showNotice: messages.length > 0,
    messages,
  }
}

export function computeInvestorClassAllocationTotals(
  rows: readonly DealInvestorClass[],
): InvestorClassAllocationTotals {
  let legalOwnershipTotal = 0
  let distributionShareTotal = 0
  let trackDistribution = false

  for (const row of rows) {
    const raw = row.advancedOptionsJson
    legalOwnershipTotal += readPctFromAdvancedJson(
      raw,
      "entityLegalOwnershipPct",
      "entity_legal_ownership_pct",
    )
    if (row.subscriptionType === "mezzanine") continue
    if (row.subscriptionType === "preferred_equity") continue
    trackDistribution = true
    distributionShareTotal += readPctFromAdvancedJson(
      raw,
      "distributionSharePct",
      "distribution_share_pct",
    )
  }

  return buildInvestorClassAllocationTotalsFromSums({
    legalOwnershipTotal,
    distributionShareTotal,
    trackDistribution,
    hasClasses: rows.length > 0,
  })
}

/** Preview totals including the class currently being added or edited. */
export function computeInvestorClassAllocationTotalsWithDraft({
  existingRows,
  entityLegalOwnershipPct,
  distributionSharePct,
  subscriptionType,
  editingClassId,
}: {
  existingRows: readonly DealInvestorClass[]
  entityLegalOwnershipPct: string
  distributionSharePct: string
  subscriptionType: string
  editingClassId?: string
}): InvestorClassAllocationTotals {
  const existing = sumExistingRowsForAllocation(existingRows, editingClassId)
  const includeDistribution =
    subscriptionType !== "mezzanine" &&
    subscriptionType !== "preferred_equity"
  const trackDistribution =
    existingRows.some(
      (r) =>
        r.id !== editingClassId &&
        r.subscriptionType !== "mezzanine" &&
        r.subscriptionType !== "preferred_equity",
    ) || includeDistribution

  return buildInvestorClassAllocationTotalsFromSums({
    legalOwnershipTotal: roundPctTotal(
      existing.legalOwnershipTotal + parsePctNumber(entityLegalOwnershipPct),
    ),
    distributionShareTotal: includeDistribution
      ? roundPctTotal(
          existing.distributionShareTotal +
            parsePctNumber(distributionSharePct),
        )
      : existing.distributionShareTotal,
    trackDistribution,
    hasClasses: true,
  })
}

/** Existing classes plus optional draft values from the add/edit form. */
export function computeInvestorClassAllocationTotalsForForm({
  existingRows,
  entityLegalOwnershipPct,
  distributionSharePct,
  subscriptionType,
  editingClassId,
}: {
  existingRows: readonly DealInvestorClass[]
  entityLegalOwnershipPct: string
  distributionSharePct: string
  subscriptionType: string
  editingClassId?: string
}): InvestorClassAllocationTotals {
  if (!subscriptionType.trim()) {
    return computeInvestorClassAllocationTotals(existingRows)
  }
  return computeInvestorClassAllocationTotalsWithDraft({
    existingRows,
    entityLegalOwnershipPct,
    distributionSharePct,
    subscriptionType,
    editingClassId,
  })
}
