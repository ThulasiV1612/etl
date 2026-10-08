import type { DealInvestorRow } from "../../../types/deal-investors.types"
import type { DistributionSetupClass } from "../../../distribution-setup/types/distribution-setup.types"
import {
  fundedAmountForTotalFundedKpi,
  parseMoneyDigits,
} from "../../../utils/offeringMoneyFormat"

export type InvestorDistributionLine = {
  investorId: string
  contactId?: string
  userEmail?: string
  investorName: string
  classId: string
  className: string
  /** Investor capital used for % / payment split (funded when available). */
  capital: number
  /**
   * Share of class used for payment split.
   * Prefer stored `percentOfClassDistributions` when set; else capital pro‑rata.
   */
  percentOfClass: number
  /** Share of the whole deal (0–100). Independent of % of class. */
  percentOfDeal: number
  payment: number
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** Match investment `investorClass` (id or name) to a Class Setup class. */
export function resolveInvestorClass(
  investorClassRaw: string,
  classes: DistributionSetupClass[],
): DistributionSetupClass | null {
  const raw = investorClassRaw.trim()
  if (!raw || raw === "—") return null
  const byId = classes.find((c) => c.id === raw)
  if (byId) return byId
  const n = norm(raw)
  return (
    classes.find((c) => norm(c.name) === n || norm(c.id) === n) ?? null
  )
}

export function investorCapitalForDistribution(row: DealInvestorRow): number {
  const funded = fundedAmountForTotalFundedKpi(row)
  if (Number.isFinite(funded) && funded > 0) return funded
  const committed = parseMoneyDigits(row.committed)
  return Number.isFinite(committed) && committed > 0 ? committed : 0
}

/** Parse stored class % from add-investor / distribution edit (e.g. `25.00%`). */
export function parseStoredClassPercent(
  raw: string | undefined | null,
): number | null {
  const t = String(raw ?? "")
    .replace(/[^0-9.-]/g, "")
    .trim()
  if (!t) return null
  const n = parseFloat(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(100, n)
}

/** % of deal: stored value, else entity ownership, else capital ÷ deal capital. */
export function resolvePercentOfDeal(params: {
  storedDealPercent?: string | number | null
  entityOwnershipPercent?: string | number | null
  capital: number
  dealCapital: number
}): number {
  const stored = parseStoredClassPercent(
    params.storedDealPercent == null ? "" : String(params.storedDealPercent),
  )
  if (stored != null) return stored
  const entity = parseStoredClassPercent(
    params.entityOwnershipPercent == null
      ? ""
      : String(params.entityOwnershipPercent),
  )
  if (entity != null) return entity
  const cap = Math.max(0, params.capital)
  const deal = Math.max(0, params.dealCapital)
  if (deal > 0 && cap > 0) return Math.min(100, (cap / deal) * 100)
  return 0
}

export function applyPercentOfDealEdit(params: {
  lines: InvestorDistributionLine[]
  investorId: string
  nextPercent: number
}): InvestorDistributionLine[] {
  const { lines, investorId, nextPercent } = params
  const target = lines.find((l) => l.investorId === investorId)
  if (!target) return lines
  const pct = Math.max(0, Math.min(100, nextPercent))
  return lines.map((l) =>
    l.investorId === investorId ? { ...l, percentOfDeal: pct } : l,
  )
}

/**
 * Split each class's waterfall payment across investors in that class.
 * Payment = class waterfall × (% of class ÷ 100) when a stored % exists;
 * otherwise capital pro‑rata (and % is derived from capital share).
 */
export function allocateInvestorDistributionLines(params: {
  investors: DealInvestorRow[]
  classes: DistributionSetupClass[]
  perClass: Record<string, number>
}): InvestorDistributionLine[] {
  const { investors, classes, perClass } = params
  const classById = new Map(classes.map((c) => [c.id, c]))

  type Acc = {
    investor: DealInvestorRow
    classId: string
    className: string
    capital: number
    storedPct: number | null
  }

  const matched: Acc[] = []
  for (const inv of investors) {
    const capital = investorCapitalForDistribution(inv)
    const storedPct = parseStoredClassPercent(inv.percentOfClassDistributions)
    if (capital <= 0 && storedPct == null) continue
    const cls = resolveInvestorClass(inv.investorClass ?? "", classes)
    if (!cls) continue
    matched.push({
      investor: inv,
      classId: cls.id,
      className: cls.name,
      capital,
      storedPct,
    })
  }

  const byClass = new Map<string, Acc[]>()
  for (const row of matched) {
    const list = byClass.get(row.classId) ?? []
    list.push(row)
    byClass.set(row.classId, list)
  }

  const dealCapital = matched.reduce((s, m) => s + Math.max(0, m.capital), 0)
  const lines: InvestorDistributionLine[] = []
  for (const [classId, members] of byClass) {
    const classPay = perClass[classId] ?? 0
    const capitalTotal = members.reduce((s, m) => s + Math.max(0, m.capital), 0)
    const useStored = members.some((m) => m.storedPct != null)

    members.forEach((row) => {
      let percentOfClass: number
      let payment: number
      if (useStored && row.storedPct != null) {
        percentOfClass = row.storedPct
        payment = classPay * (percentOfClass / 100)
      } else if (capitalTotal > 0) {
        const share = Math.max(0, row.capital) / capitalTotal
        percentOfClass = share * 100
        payment = classPay * share
      } else {
        percentOfClass = 0
        payment = 0
      }
      const contactId = row.investor.contactId?.trim() || undefined
      const userEmail =
        row.investor.userEmail?.trim().toLowerCase() || undefined
      lines.push({
        investorId: row.investor.id,
        ...(contactId ? { contactId } : {}),
        ...(userEmail ? { userEmail } : {}),
        investorName:
          row.investor.displayName?.trim() ||
          row.investor.userDisplayName?.trim() ||
          "—",
        classId: row.classId,
        className: row.className || classById.get(row.classId)?.name || "—",
        capital: row.capital,
        percentOfClass,
        percentOfDeal: resolvePercentOfDeal({
          entityOwnershipPercent: row.investor.entityOwnershipPercent,
          capital: row.capital,
          dealCapital,
        }),
        payment,
      })
    })
  }

  return lines.sort((a, b) => {
    const byClassName = a.className.localeCompare(b.className)
    if (byClassName !== 0) return byClassName
    return b.payment - a.payment || a.investorName.localeCompare(b.investorName)
  })
}

/**
 * Allocate class cash that preferred-due matching skipped (e.g. Class B GPs
 * with $0 capital but a stored percent of class).
 */
export function fillClassPaymentsFromStoredPercents(params: {
  investors: DealInvestorRow[]
  classes: DistributionSetupClass[]
  perClass: Record<string, number>
  alreadyCoveredClassIds?: Iterable<string>
}): InvestorDistributionLine[] {
  const covered = new Set(
    [...(params.alreadyCoveredClassIds ?? [])]
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  )
  const leftover: Record<string, number> = {}
  for (const [id, amt] of Object.entries(params.perClass)) {
    const n = Number(amt)
    if (!id || covered.has(id) || !Number.isFinite(n) || n <= 0.005) continue
    leftover[id] = n
  }
  if (Object.keys(leftover).length === 0) return []
  return allocateInvestorDistributionLines({
    investors: params.investors,
    classes: params.classes,
    perClass: leftover,
  })
}

/** Recalculate each line's payment as classPay × (% of class ÷ 100). */
export function recalculatePaymentsFromPercentOfClass(
  lines: InvestorDistributionLine[],
  classPaymentByClassId: Record<string, number>,
): InvestorDistributionLine[] {
  const classPayResolved = new Map<string, number>()
  for (const l of lines) {
    if (classPayResolved.has(l.classId)) continue
    const fromWf = classPaymentByClassId[l.classId]
    if (fromWf != null && Number.isFinite(fromWf) && fromWf >= 0) {
      classPayResolved.set(l.classId, fromWf)
      continue
    }
    const peers = lines.filter((x) => x.classId === l.classId)
    let inferred = 0
    for (const p of peers) {
      if (p.percentOfClass > 0) {
        inferred = Math.max(
          inferred,
          p.payment / (p.percentOfClass / 100),
        )
      }
    }
    classPayResolved.set(l.classId, inferred)
  }

  return lines.map((l) => {
    const classPay = classPayResolved.get(l.classId) ?? 0
    const pct = Math.max(0, Math.min(100, l.percentOfClass))
    return {
      ...l,
      percentOfClass: pct,
      payment: classPay * (pct / 100),
    }
  })
}

/** Resolve class waterfall total for a line (used by bulk recalc helpers). */
export function resolveClassPayForLine(
  lines: InvestorDistributionLine[],
  target: InvestorDistributionLine,
  classPaymentByClassId: Record<string, number>,
): number {
  const fromWf = classPaymentByClassId[target.classId]
  if (fromWf != null && Number.isFinite(fromWf) && fromWf >= 0) return fromWf
  if (target.percentOfClass > 0) {
    return target.payment / (target.percentOfClass / 100)
  }
  let inferred = 0
  for (const p of lines.filter((l) => l.classId === target.classId)) {
    if (p.percentOfClass > 0) {
      inferred = Math.max(inferred, p.payment / (p.percentOfClass / 100))
    }
  }
  return inferred
}

/**
 * After editing one investor's % of class, update only that field.
 * Payment is left as-is so manual values stay independent.
 */
export function applyPercentOfClassEdit(params: {
  lines: InvestorDistributionLine[]
  investorId: string
  nextPercent: number
  classPaymentByClassId?: Record<string, number>
}): InvestorDistributionLine[] {
  const { lines, investorId, nextPercent } = params
  const target = lines.find((l) => l.investorId === investorId)
  if (!target) return lines
  const pct = Math.max(0, Math.min(100, nextPercent))
  return lines
    .map((l) =>
      l.investorId === investorId
        ? {
            ...l,
            percentOfClass: pct,
          }
        : l,
    )
    .sort((a, b) => {
      const byClassName = a.className.localeCompare(b.className)
      if (byClassName !== 0) return byClassName
      return (
        b.payment - a.payment || a.investorName.localeCompare(b.investorName)
      )
    })
}

/**
 * After editing payment, update only that field.
 * % of class is left as-is so manual values stay independent.
 */
export function applyPaymentEdit(params: {
  lines: InvestorDistributionLine[]
  investorId: string
  nextPayment: number
  classPaymentByClassId?: Record<string, number>
}): InvestorDistributionLine[] {
  const { lines, investorId, nextPayment } = params
  const target = lines.find((l) => l.investorId === investorId)
  if (!target) return lines
  const payment = Math.round(Math.max(0, nextPayment) * 100) / 100
  return lines
    .map((l) =>
      l.investorId === investorId
        ? {
            ...l,
            payment,
          }
        : l,
    )
    .sort((a, b) => {
      const byClassName = a.className.localeCompare(b.className)
      if (byClassName !== 0) return byClassName
      return (
        b.payment - a.payment || a.investorName.localeCompare(b.investorName)
      )
    })
}
