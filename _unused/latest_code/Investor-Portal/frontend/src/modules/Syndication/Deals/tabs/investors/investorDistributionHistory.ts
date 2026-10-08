import type {
  DistributionSetupClass,
  PriorDistributionRecord,
} from "../../distribution-setup/types/distribution-setup.types"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import { parseMoneyDigits } from "../../utils/offeringMoneyFormat"
import {
  distributionDisplayName,
  formatPaymentDateLabel,
  resolvePeriodWindow,
  typeDisplayLabel,
} from "../distributions/utils/distributionListDisplay"
import { allocateInvestorDistributionLines } from "../distributions/utils/investorDistributionAllocation"
import { allocateInvestorsByPreferredDue } from "../distributions/utils/investorPreferredAllocation"

export interface InvestorDistHistoryRow {
  key: string
  distributionId: string
  memo: string
  type: string
  paymentDate: string
  payment: number
  dateSort: string
}

export interface InvestorPaymentMatchKeys {
  investorIds: Set<string>
  contactIds: Set<string>
  emails: Set<string>
}

type PaymentLine = {
  investorId: string
  contactId?: string
  userEmail?: string
  investorName: string
  classId: string
  payment: number
}

function norm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
}

function memoLabel(row: PriorDistributionRecord): string {
  const named = String(row.name ?? "").trim()
  if (named) return named
  const window = resolvePeriodWindow(row)
  const period = row.period ?? "quarterly"
  if (period === "quarterly") {
    const m = /^(\d{4})-(\d{2})/.exec(window.start)
    if (m) {
      const q = Math.floor((Number(m[2]) - 1) / 3) + 1
      return `Q${q} - ${m[1]}`
    }
  }
  return distributionDisplayName(row)
}

function samePerson(a: DealInvestorRow, b: DealInvestorRow): boolean {
  const aId = norm(a.id)
  const bId = norm(b.id)
  if (aId && bId && aId === bId) return true
  const aContact = norm(a.contactId)
  const bContact = norm(b.contactId)
  if (aContact && bContact && aContact === bContact) return true
  const aEmail = norm(a.userEmail)
  const bEmail = norm(b.userEmail)
  if (aEmail && bEmail && aEmail === bEmail) return true
  return false
}

/**
 * Collect id / contact / email keys for this investor on this deal
 * (LP roster id + related investment id for the same person).
 */
export function buildInvestorPaymentMatchKeys(params: {
  investor: DealInvestorRow
  dealInvestors?: DealInvestorRow[]
}): InvestorPaymentMatchKeys {
  const { investor, dealInvestors = [] } = params
  const related = [
    investor,
    ...dealInvestors.filter((r) => samePerson(investor, r)),
  ]
  const investorIds = new Set<string>()
  const contactIds = new Set<string>()
  const emails = new Set<string>()
  for (const row of related) {
    const id = norm(row.id)
    if (id) investorIds.add(id)
    const contact = norm(row.contactId)
    if (contact) contactIds.add(contact)
    const email = norm(row.userEmail)
    if (email) emails.add(email)
  }
  return { investorIds, contactIds, emails }
}

export function investorMatchesPayment(
  keys: InvestorPaymentMatchKeys,
  payment: {
    investorId?: string
    contactId?: string
    userEmail?: string
  },
): boolean {
  const payId = norm(payment.investorId)
  if (payId && keys.investorIds.has(payId)) return true
  const payContact = norm(payment.contactId)
  if (payContact && keys.contactIds.has(payContact)) return true
  const payEmail = norm(payment.userEmail)
  if (payEmail && keys.emails.has(payEmail)) return true
  // Payment investorId may be a contact / user id on older snapshots.
  if (payId && keys.contactIds.has(payId)) return true
  return false
}

function mapStoredLines(
  prior: PriorDistributionRecord,
): PaymentLine[] {
  return (prior.investorPayments ?? []).map((p) => ({
    investorId: String(p.investorId ?? "").trim(),
    ...(p.contactId?.trim() ? { contactId: p.contactId.trim() } : {}),
    ...(p.userEmail?.trim()
      ? { userEmail: p.userEmail.trim().toLowerCase() }
      : {}),
    investorName: String(p.investorName ?? "").trim() || "—",
    classId: String(p.classId ?? "").trim(),
    payment: parseMoneyDigits(p.payment) || 0,
  }))
}

function rebuildLinesForPrior(params: {
  prior: PriorDistributionRecord
  dealInvestors: DealInvestorRow[]
  classes: DistributionSetupClass[]
}): PaymentLine[] {
  const { prior, dealInvestors, classes } = params
  if (!dealInvestors.length || !classes.length) return []
  const cash = parseMoneyDigits(prior.amount) || 0
  if (!(cash > 0)) return []
  const window = resolvePeriodWindow(prior)
  const prefLines = allocateInvestorsByPreferredDue({
    distributionAmount: cash,
    periodStartIso: window.start,
    periodEndIso: window.end,
    dayCountMode: "period_window",
    investors: dealInvestors,
    classes,
  })
  if (prefLines.length > 0) {
    return prefLines.map((l) => ({
      investorId: l.investorId,
      ...(l.contactId ? { contactId: l.contactId } : {}),
      ...(l.userEmail ? { userEmail: l.userEmail } : {}),
      investorName: l.investorName,
      classId: l.classId,
      payment: l.payment,
    }))
  }

  const base = allocateInvestorDistributionLines({
    investors: dealInvestors,
    classes,
    perClass: {},
  })
  const totalCap = base.reduce((s, l) => s + Math.max(0, l.capital), 0)
  if (!(totalCap > 0)) return []
  return base.map((l) => ({
    investorId: l.investorId,
    ...(l.contactId ? { contactId: l.contactId } : {}),
    ...(l.userEmail ? { userEmail: l.userEmail } : {}),
    investorName: l.investorName,
    classId: l.classId,
    payment: (cash * Math.max(0, l.capital)) / totalCap,
  }))
}

function paymentLinesForPrior(params: {
  prior: PriorDistributionRecord
  dealInvestors: DealInvestorRow[]
  classes: DistributionSetupClass[]
  keys: InvestorPaymentMatchKeys
}): PaymentLine[] {
  const { prior, dealInvestors, classes, keys } = params
  const stored = mapStoredLines(prior)
  if (stored.length > 0) {
    const matched = stored.filter((p) => investorMatchesPayment(keys, p))
    if (matched.length > 0) return matched
    // Snapshot exists but identity keys don't match this investor (e.g. LP
    // roster id vs investment id). Rebuild from deal investors for this deal.
  } else {
    // No snapshot on older runs.
  }
  return rebuildLinesForPrior({ prior, dealInvestors, classes }).filter((p) =>
    investorMatchesPayment(keys, p),
  )
}

/**
 * Build distribution history for one investor on one deal only.
 * Uses that deal's prior distributions and filters to this investor's payments.
 */
export function buildInvestorDistributionHistory(params: {
  investor: DealInvestorRow
  priorDistributions: PriorDistributionRecord[]
  dealInvestors?: DealInvestorRow[]
  classes?: DistributionSetupClass[]
}): InvestorDistHistoryRow[] {
  const {
    investor,
    priorDistributions,
    dealInvestors = [],
    classes = [],
  } = params
  const keys = buildInvestorPaymentMatchKeys({ investor, dealInvestors })
  const rows: InvestorDistHistoryRow[] = []
  let index = 0

  for (const prior of priorDistributions) {
    // One row per distribution run for this investor (sum class lines).
    const lines = paymentLinesForPrior({
      prior,
      dealInvestors,
      classes,
      keys,
    })
    if (lines.length === 0) continue

    const payment = lines.reduce(
      (sum, line) => sum + (Number.isFinite(line.payment) ? line.payment : 0),
      0,
    )
    const distId = String(prior.id ?? "").trim()
    const window = resolvePeriodWindow(prior)
    rows.push({
      key: `${distId}:${index}`,
      distributionId: distId,
      memo: memoLabel(prior),
      type: typeDisplayLabel(prior),
      paymentDate: formatPaymentDateLabel(
        prior.paymentDate || prior.date || window.end,
      ),
      payment,
      dateSort: String(prior.paymentDate || prior.date || "").slice(0, 10),
    })
    index += 1
  }

  rows.sort((a, b) => b.dateSort.localeCompare(a.dateSort))
  return rows
}
