/**
 * Display helpers for Deal → Distributions list (portal-style columns).
 * Period / preferred totals follow Woodland Ridge export math (actual/365).
 */

import { formatDateDdMmmYyyy } from "../../../../../../common/utils/formatDateDisplay"
import {
  CLASS_TYPE_META,
  type ClassSetupType,
} from "../../../class-setup/types/class-setup.types"
import type {
  DistributionSetupClass,
  PriorDistributionRecord,
} from "../../../distribution-setup/types/distribution-setup.types"
import {
  getPeriodWindow,
  type DistributionPeriod,
} from "../../../distribution-setup/utils/distributionPeriod"
import type { DealInvestorRow } from "../../../types/deal-investors.types"
import { parseMoneyDigits } from "../../../utils/offeringMoneyFormat"
import {
  parseStoredClassPercent,
  resolvePercentOfDeal,
} from "./investorDistributionAllocation"
import { allocateInvestorsByPreferredDue } from "./investorPreferredAllocation"

export type DistributionListMetrics = {
  paid: number
  required: number
  unpaid: number
  /** paid ÷ required × 100 (0 when required is 0) */
  paidPctOfRequired: number
  periodStart: string
  periodEnd: string
  paymentDate: string
}

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function parseIsoLocalDate(iso: string): Date | null {
  const s = String(iso ?? "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Period table dates: `01 Aug 2026` (spaces, no dashes). */
export function formatPeriodDateDdMmmYyyy(iso: string): string {
  const d = parseIsoLocalDate(iso)
  if (!d) {
    const fallback = formatDateDdMmmYyyy(iso)
    return fallback === "—" ? "—" : fallback.replace(/-/g, " ")
  }
  const day = String(d.getDate()).padStart(2, "0")
  const mon = MONTH_SHORT[d.getMonth()] ?? "Jan"
  return `${day} ${mon} ${d.getFullYear()}`
}

/** Short period date when year is shown in the period name: `01 Aug`. */
export function formatPeriodDateDdMmm(iso: string): string {
  const d = parseIsoLocalDate(iso)
  if (!d) {
    const full = formatPeriodDateDdMmmYyyy(iso)
    if (full === "—") return "—"
    return full.replace(/\s+\d{4}$/, "")
  }
  const day = String(d.getDate()).padStart(2, "0")
  const mon = MONTH_SHORT[d.getMonth()] ?? "Jan"
  return `${day} ${mon}`
}

/**
 * Calendar label above the date range (e.g. "August 2026", "Q3 2026").
 * Returns null when the window is irregular / not a clean named period.
 */
export function formatPeriodCalendarLabel(
  startIso: string,
  endIso: string,
  period?: DistributionPeriod | string | null,
): string | null {
  const start = parseIsoLocalDate(startIso)
  const end = parseIsoLocalDate(endIso)
  if (!start || !end) return null

  const kind =
    period === "monthly" || period === "quarterly" || period === "annual"
      ? period
      : null

  if (kind === "monthly" || (!kind && sameCalendarMonth(start, end))) {
    if (!sameCalendarMonth(start, end)) return null
    if (start.getDate() !== 1) return null
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
    if (end.getDate() !== lastDay) return null
    return `${MONTH_LONG[start.getMonth()]} ${start.getFullYear()}`
  }

  if (kind === "quarterly" || (!kind && isFullCalendarQuarter(start, end))) {
    if (!isFullCalendarQuarter(start, end)) return null
    const q = Math.floor(start.getMonth() / 3) + 1
    return `Q${q} ${start.getFullYear()}`
  }

  if (kind === "annual" || (!kind && isFullCalendarYear(start, end))) {
    if (!isFullCalendarYear(start, end)) return null
    return String(start.getFullYear())
  }

  return null
}

function sameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isFullCalendarQuarter(start: Date, end: Date): boolean {
  if (start.getFullYear() !== end.getFullYear()) return false
  if (start.getDate() !== 1) return false
  const q = Math.floor(start.getMonth() / 3)
  if (start.getMonth() !== q * 3) return false
  const endMonth = q * 3 + 2
  if (end.getMonth() !== endMonth) return false
  const lastDay = new Date(end.getFullYear(), endMonth + 1, 0).getDate()
  return end.getDate() === lastDay
}

function isFullCalendarYear(start: Date, end: Date): boolean {
  return (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === 0 &&
    start.getDate() === 1 &&
    end.getMonth() === 11 &&
    end.getDate() === 31
  )
}

/** Plain-text period range for CSV / titles: `01 Aug 2026 → 31 Aug 2026`. */
export function formatPeriodDatesLabel(startIso: string, endIso: string): string {
  return `${formatPeriodDateDdMmmYyyy(startIso)} → ${formatPeriodDateDdMmmYyyy(endIso)}`
}

/** Payment / calendar dates: DD-MMM-YYYY (e.g. 12-Jan-2026). */
export function formatPaymentDateLabel(iso: string): string {
  return formatDateDdMmmYyyy(iso)
}

export function sourceDisplayLabel(source: string | undefined): string {
  const s = (source ?? "").trim().toLowerCase()
  if (s === "capital" || s === "capital_event") return "Capital event"
  if (s === "operating") return "Operating income"
  if (s === "fee" || s === "distribution_fee") return "GP Payment"
  return "—"
}

export function typeDisplayLabel(row: PriorDistributionRecord): string {
  const src = (row.source ?? "").trim().toLowerCase()
  if (src === "fee" || src === "distribution_fee") {
    const feeType =
      row.distributionType?.trim() || row.name?.trim() || "Acquisition fee"
    return feeType
  }
  const t = (row.distributionType ?? "").trim().toLowerCase()
  if (t === "preferred_return" || t === "preferred" || t === "pref")
    return "Preferred return"
  if (t === "return_of_capital" || t === "roc") return "Return of capital"
  if (t === "promote") return "Promote"
  // Default for operating preferred waterfalls (Woodland / Wildflower).
  return "Preferred return"
}

export function deductsFromDisplayLabel(row: PriorDistributionRecord): string {
  const src = (row.source ?? "").trim().toLowerCase()
  if (src === "fee" || src === "distribution_fee") return "Acquisition fee"
  const d = (row.deductsFrom ?? "").trim().toLowerCase()
  if (d === "accrued_pref" || d === "accrued" || !d)
    return "Deducts from accrued pref"
  if (d === "current_pref" || d === "current") return "Deducts from current pref"
  if (d === "capital") return "Deducts from capital"
  if (d === "fee") return "Acquisition fee"
  return "Deducts from accrued pref"
}

export function distributionDisplayName(row: PriorDistributionRecord): string {
  const n = row.name?.trim()
  if (n) return n
  const period = row.period ?? "quarterly"
  const window = resolvePeriodWindow(row)
  if (period === "quarterly") {
    const m = /^(\d{4})-(\d{2})/.exec(window.start)
    if (m) {
      const q = Math.floor((Number(m[2]) - 1) / 3) + 1
      return `${m[1]} Q${q} Distribution`
    }
  }
  return `${sourceDisplayLabel(row.source)} · ${formatPaymentDateLabel(row.date)}`
}

/** Parse "2026 Q1 Distribution" / "Q1 2026" style names into a calendar quarter. */
function periodFromName(
  name: string | undefined,
): { start: string; end: string } | null {
  const n = (name ?? "").trim()
  if (!n) return null
  const m1 = /(\d{4})\s*Q([1-4])/i.exec(n)
  const m2 = /Q([1-4])\s*(\d{4})/i.exec(n)
  const year = m1 ? Number(m1[1]) : m2 ? Number(m2[2]) : NaN
  const q = m1 ? Number(m1[2]) : m2 ? Number(m2[1]) : NaN
  if (!Number.isFinite(year) || !Number.isFinite(q) || q < 1 || q > 4)
    return null
  const startM = (q - 1) * 3
  const endM = startM + 2
  const endD = new Date(year, endM + 1, 0).getDate()
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x))
  return {
    start: `${year}-${pad(startM + 1)}-01`,
    end: `${year}-${pad(endM + 1)}-${pad(endD)}`,
  }
}

export function resolvePeriodWindow(row: PriorDistributionRecord): {
  start: string
  end: string
} {
  const storedStart = row.periodStart?.trim().slice(0, 10)
  const storedEnd = row.periodEnd?.trim().slice(0, 10)
  if (
    storedStart &&
    storedEnd &&
    /^\d{4}-\d{2}-\d{2}$/.test(storedStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(storedEnd)
  ) {
    return { start: storedStart, end: storedEnd }
  }
  const fromName = periodFromName(row.name)
  if (fromName) return fromName
  const period: DistributionPeriod =
    row.period === "monthly" ||
    row.period === "annual" ||
    row.period === "quarterly"
      ? row.period
      : "quarterly"
  // Payment date is often after the accrual window (e.g. 04/15 for Q1).
  // If payment falls in the first 20 days of a quarter, treat as prior quarter.
  const paymentIso = (row.paymentDate || row.date || "").slice(0, 10)
  const win = getPeriodWindow(paymentIso || row.date, period)
  if (period !== "quarterly" || !/^\d{4}-\d{2}-\d{2}$/.test(paymentIso))
    return { start: win.start, end: win.end }
  const day = Number(paymentIso.slice(8, 10))
  if (day <= 20 && paymentIso.slice(0, 7) === win.start.slice(0, 7)) {
    const prevAsOf = shiftIsoMonths(win.start, -1)
    const prev = getPeriodWindow(prevAsOf, period)
    return { start: prev.start, end: prev.end }
  }
  return { start: win.start, end: win.end }
}

function shiftIsoMonths(iso: string, deltaMonths: number): string {
  const y = Number(iso.slice(0, 4))
  const m0 = Number(iso.slice(5, 7)) - 1
  const d = Number(iso.slice(8, 10))
  const dt = new Date(y, m0 + deltaMonths, Math.min(d, 28))
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x))
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export function computeDistributionListMetrics(params: {
  row: PriorDistributionRecord
  investors: DealInvestorRow[]
  classes: DistributionSetupClass[]
}): DistributionListMetrics {
  const { row, investors, classes } = params
  const paid = parseMoneyDigits(row.amount)
  const paidSafe = Number.isFinite(paid) ? Math.max(0, paid) : 0
  const window = resolvePeriodWindow(row)
  const paymentDate = (row.paymentDate || row.date || "").slice(0, 10)

  let required = 0
  if (investors.length > 0 && classes.length > 0) {
    const lines = allocateInvestorsByPreferredDue({
      distributionAmount: paidSafe,
      periodStartIso: window.start,
      periodEndIso: window.end,
      dayCountMode: "period_window",
      investors,
      classes,
    })
    required = lines.reduce((s, l) => s + l.required, 0)
  }
  if (!(required > 0) && row.investorPayments?.length) {
    // Fallback: if only payments stored, treat paid as required (unpaid 0).
    required = paidSafe
  }

  const unpaid = Math.max(0, required - paidSafe)
  const paidPctOfRequired =
    required > 0 ? Math.round((paidSafe / required) * 10000) / 100 : 0

  return {
    paid: paidSafe,
    required,
    unpaid,
    paidPctOfRequired,
    periodStart: window.start,
    periodEnd: window.end,
    paymentDate,
  }
}

export type DistributionClassOption = {
  id: string
  name: string
  typeLabel: string
}

function classTypeLabel(classType: string | undefined): string {
  const t = String(classType ?? "").trim().toLowerCase()
  if (t in CLASS_TYPE_META) {
    return CLASS_TYPE_META[t as ClassSetupType].shortLabel
  }
  return ""
}

/** Unique investor classes that belong to a completed distribution run. */
export function classesInDistribution(
  row: PriorDistributionRecord,
  classes: DistributionSetupClass[],
): DistributionClassOption[] {
  const byId = new Map(classes.map((c) => [c.id, c]))
  const map = new Map<string, DistributionClassOption>()

  for (const payment of row.investorPayments ?? []) {
    const id = String(payment.classId ?? "").trim()
    if (!id) continue
    const setup = byId.get(id)
    const name =
      String(payment.className ?? "").trim() || setup?.name.trim() || id
    if (!map.has(id)) {
      map.set(id, {
        id,
        name,
        typeLabel: classTypeLabel(setup?.classType),
      })
    }
  }

  if (map.size === 0) {
    for (const cls of classes) {
      const id = String(cls.id ?? "").trim()
      if (!id) continue
      map.set(id, {
        id,
        name: cls.name.trim() || id,
        typeLabel: classTypeLabel(cls.classType),
      })
    }
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
}

export type DistributionClassTableRow = {
  id: string
  name: string
  typeLabel: string
  classType: string
  investorCount: number
  capital: number
  payment: number
  required: number
  unpaid: number
  sharePct: number
}

type ClassAgg = {
  investorIds: Set<string>
  capital: number
  payment: number
  required: number
}

export function classTableRowsForDistribution(params: {
  row: PriorDistributionRecord
  setupClasses: DistributionSetupClass[]
  investors: DealInvestorRow[]
}): DistributionClassTableRow[] {
  const { row, setupClasses, investors } = params
  const cash = parseMoneyDigits(row.amount)
  const cashSafe = Number.isFinite(cash) ? Math.max(0, cash) : 0
  const window = resolvePeriodWindow(row)
  const setupById = new Map(setupClasses.map((c) => [c.id, c]))
  const options = classesInDistribution(row, setupClasses)
  const aggs = new Map<string, ClassAgg>()

  function aggFor(classId: string): ClassAgg {
    const existing = aggs.get(classId)
    if (existing) return existing
    const next: ClassAgg = {
      investorIds: new Set(),
      capital: 0,
      payment: 0,
      required: 0,
    }
    aggs.set(classId, next)
    return next
  }

  const stored = row.investorPayments ?? []
  if (stored.length > 0) {
    for (const pay of stored) {
      const classId = String(pay.classId ?? "").trim()
      if (!classId) continue
      const a = aggFor(classId)
      const investorId = String(pay.investorId ?? "").trim()
      if (investorId) a.investorIds.add(investorId)
      a.capital += parseMoneyDigits(pay.capital) || 0
      a.payment += parseMoneyDigits(pay.payment) || 0
    }
  }

  if (investors.length > 0 && setupClasses.length > 0) {
    const lines = allocateInvestorsByPreferredDue({
      distributionAmount: cashSafe,
      periodStartIso: window.start,
      periodEndIso: window.end,
      dayCountMode: "period_window",
      investors,
      classes: setupClasses,
    })
    for (const line of lines) {
      const classId = String(line.classId ?? "").trim()
      if (!classId) continue
      const a = aggFor(classId)
      if (line.investorId) a.investorIds.add(line.investorId)
      a.required += line.required || 0
      if (stored.length === 0) {
        a.capital += line.capital || 0
        a.payment += line.payment || 0
      }
    }
  }

  return options.map((opt) => {
    const setup = setupById.get(opt.id)
    const a = aggs.get(opt.id)
    const payment = a?.payment ?? 0
    const required = a?.required ?? 0
    return {
      id: opt.id,
      name: opt.name,
      typeLabel: opt.typeLabel || classTypeLabel(setup?.classType) || "—",
      classType: String(setup?.classType ?? "").trim().toLowerCase(),
      investorCount: a?.investorIds.size ?? 0,
      capital: a?.capital ?? 0,
      payment,
      required,
      unpaid: Math.max(0, required - payment),
      sharePct: cashSafe > 0 ? (payment / cashSafe) * 100 : 0,
    }
  })
}

export type DistributionClassInvestorRow = {
  id: string
  name: string
  email: string
  capital: number
  percentOfClass: number
  percentOfDeal: number
  payment: number
  required: number
  unpaid: number
}

function investorDisplayName(
  inv: DealInvestorRow | undefined,
  fallback: string,
): string {
  if (!inv) return fallback.trim() || "—"
  const first = String(inv.firstName ?? "").trim()
  const last = String(inv.lastName ?? "").trim()
  const fromParts = [first, last].filter(Boolean).join(" ")
  if (fromParts) return fromParts
  const display = String(inv.displayName ?? "").trim()
  return display || fallback.trim() || "—"
}

function matchesDistributionClass(
  classId: string,
  className: string,
  targetId: string,
  targetName: string,
): boolean {
  const id = String(classId ?? "").trim()
  const target = String(targetId ?? "").trim()
  if (id && target && id === target) return true
  const a = String(className ?? "").trim().toLowerCase()
  const b = String(targetName ?? "").trim().toLowerCase()
  return Boolean(a && b && a === b)
}

/** Per-investor payments for one class on one completed distribution run. */
export function investorRowsForDistributionClass(params: {
  row: PriorDistributionRecord
  classId: string
  className: string
  setupClasses: DistributionSetupClass[]
  investors: DealInvestorRow[]
}): DistributionClassInvestorRow[] {
  const { row, classId, className, setupClasses, investors } = params
  const cash = parseMoneyDigits(row.amount)
  const cashSafe = Number.isFinite(cash) ? Math.max(0, cash) : 0
  const window = resolvePeriodWindow(row)
  const investorsById = new Map(
    investors.map((inv) => [String(inv.id ?? "").trim(), inv]),
  )

  const allocByInvestor = new Map<
    string,
    {
      capital: number
      percentOfClass: number
      percentOfDeal: number
      payment: number
      required: number
    }
  >()
  if (investors.length > 0 && setupClasses.length > 0) {
    const lines = allocateInvestorsByPreferredDue({
      distributionAmount: cashSafe,
      periodStartIso: window.start,
      periodEndIso: window.end,
      dayCountMode: "period_window",
      investors,
      classes: setupClasses,
    })
    for (const line of lines) {
      if (
        !matchesDistributionClass(
          line.classId,
          line.className,
          classId,
          className,
        )
      ) {
        continue
      }
      const id = String(line.investorId ?? "").trim()
      if (!id) continue
      allocByInvestor.set(id, {
        capital: line.capital || 0,
        percentOfClass: line.percentOfClass || 0,
        percentOfDeal: line.percentOfDeal || 0,
        payment: line.payment || 0,
        required: line.required || 0,
      })
    }
  }

  const stored = (row.investorPayments ?? []).filter((pay) =>
    matchesDistributionClass(pay.classId, pay.className, classId, className),
  )

  const toRow = (args: {
    id: string
    name: string
    email: string
    capital: number
    percentOfClass: number
    percentOfDeal: number
    payment: number
    required: number
  }): DistributionClassInvestorRow => ({
    ...args,
    unpaid: Math.max(0, args.required - args.payment),
  })

  const dealCapital = investors.reduce((s, row) => {
    const n = parseMoneyDigits(row.committed)
    return s + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)

  const mapped =
    stored.length > 0
      ? stored.map((pay) => {
          const id = String(pay.investorId ?? "").trim()
          const inv = id ? investorsById.get(id) : undefined
          const alloc = id ? allocByInvestor.get(id) : undefined
          const payment = parseMoneyDigits(pay.payment) || 0
          const capital =
            parseMoneyDigits(pay.capital) || alloc?.capital || 0
          const percentOfClass =
            parseStoredClassPercent(pay.percentOfClass) ??
            parseStoredClassPercent(inv?.percentOfClassDistributions) ??
            alloc?.percentOfClass ??
            0
          const percentOfDeal = resolvePercentOfDeal({
            storedDealPercent: pay.percentOfDeal,
            entityOwnershipPercent: inv?.entityOwnershipPercent,
            capital,
            dealCapital,
          })
          return toRow({
            id: id || `${pay.investorName}-${pay.classId}`,
            name: investorDisplayName(inv, pay.investorName),
            email: String(inv?.userEmail ?? pay.userEmail ?? "").trim(),
            capital,
            percentOfClass,
            percentOfDeal,
            payment,
            required: alloc?.required ?? 0,
          })
        })
      : [...allocByInvestor.entries()].map(([id, alloc]) => {
          const inv = investorsById.get(id)
          return toRow({
            id,
            name: investorDisplayName(inv, ""),
            email: String(inv?.userEmail ?? "").trim(),
            capital: alloc.capital,
            percentOfClass: alloc.percentOfClass,
            percentOfDeal: alloc.percentOfDeal,
            payment: alloc.payment,
            required: alloc.required,
          })
        })

  return mapped.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
}
