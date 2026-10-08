import type { DealInvestorClass } from "../types/deal-investor-class.types"
import {
  isDealMembersTabRole,
  isGeneralPartnerRole,
} from "../constants/investor-profile"
import {
  blurFormatMoneyInput,
  parseMoneyDigits,
  parseNumberOfUnitsDigits,
} from "./offeringMoneyFormat"

function normalizedSubscriptionType(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): string {
  return row?.subscriptionType?.trim().toLowerCase() ?? ""
}

/** `subscriptionType` from Add investor class → Class type = LP. */
export function isLpInvestorClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return normalizedSubscriptionType(row) === "lp"
}

/** Class type = GP (General Partner). */
export function isGpInvestorClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return normalizedSubscriptionType(row) === "gp"
}

/** Class type = Mezzanine. */
export function isMezzanineInvestorClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return normalizedSubscriptionType(row) === "mezzanine"
}

/** Class type = Preferred Equity (fixed return, no ownership). */
export function isPreferredEquityInvestorClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return normalizedSubscriptionType(row) === "preferred_equity"
}

/** Fixed-return stack positions (no equity ownership %). */
export function isFixedReturnInvestorClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return isMezzanineInvestorClass(row) || isPreferredEquityInvestorClass(row)
}

/** LP and mezzanine — selectable during investor onboarding (GP excluded). */
export function isInvestorOnboardingSelectableClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return (
    isLpInvestorClass(row) ||
    isMezzanineInvestorClass(row) ||
    isPreferredEquityInvestorClass(row)
  )
}

export function investorOnboardingSelectableClasses(
  classes: DealInvestorClass[],
): DealInvestorClass[] {
  return classes.filter((c) => isInvestorOnboardingSelectableClass(c))
}

/** Investors tab: every class type except GP (those belong on General Partners). */
export function isInvestorsTabSelectableClass(
  row: Pick<DealInvestorClass, "subscriptionType"> | undefined,
): boolean {
  return !isGpInvestorClass(row)
}

export function matchDealInvestorClass(
  stored: string | undefined,
  classes: DealInvestorClass[],
): DealInvestorClass | undefined {
  const raw = String(stored ?? "").trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  return classes.find(
    (c) =>
      c.id.trim().toLowerCase() === lower ||
      c.name.trim().toLowerCase() === lower,
  )
}

const CLASS_TYPE_TABLE_SUFFIX: Record<string, string> = {
  lp: "Limited Partners",
  gp: "General Partners",
  mezzanine: "Mezzanine",
  preferred_equity: "Preferred Equity",
}

export function investorClassTypeTableSuffix(
  subscriptionType: string | undefined,
): string {
  const t = String(subscriptionType ?? "").trim().toLowerCase()
  return CLASS_TYPE_TABLE_SUFFIX[t] ?? ""
}

/**
 * Table / dropdown label: `Class B - General Partners` when the stored name is
 * just `Class B` (or similar) and the class type is known.
 */
export function applyInvestorClassTypeSuffix(
  name: string,
  subscriptionType: string | undefined,
): string {
  const n = String(name ?? "").trim()
  if (!n || n === "—") return n
  if (/\s[-–—]\s/.test(n)) return n
  const suffix = investorClassTypeTableSuffix(subscriptionType)
  if (!suffix) return n
  if (n.toLowerCase().includes(suffix.toLowerCase())) return n
  return `${n} - ${suffix}`
}

export function formatDealInvestorClassOptionLabel(
  row: Pick<DealInvestorClass, "name" | "subscriptionType">,
): string {
  const name = String(row.name ?? "").trim() || "Unnamed class"
  return applyInvestorClassTypeSuffix(name, row.subscriptionType)
}

export function formatInvestorClassTableLabel(
  stored: string | undefined,
  classes: DealInvestorClass[],
): string {
  const matched = matchDealInvestorClass(stored, classes)
  if (matched) return formatDealInvestorClassOptionLabel(matched)
  const raw = String(stored ?? "").trim()
  if (!raw || raw === "—") return ""
  return applyInvestorClassTypeSuffix(
    raw,
    /\bgp\b|general partner/i.test(raw) ? "gp" : undefined,
  )
}

/**
 * General Partners tab identity: stored GP role, or a GP class when the row is
 * not already a Deal Members team role.
 */
export function investorRowIsGeneralPartner(
  row: { investorRole?: string; investorClass?: string },
  classes: DealInvestorClass[],
): boolean {
  if (isGeneralPartnerRole(row.investorRole)) return true
  if (isDealMembersTabRole(row.investorRole)) return false
  const matched = matchDealInvestorClass(row.investorClass, classes)
  if (matched) return isGpInvestorClass(matched)
  const className = String(row.investorClass ?? "").trim().toLowerCase()
  return /\bgp\b|general partner/.test(className)
}

export function hasInvestorClassNumberOfUnits(
  raw: string | undefined,
): boolean {
  const n = parseNumberOfUnitsDigits(String(raw ?? ""))
  return Number.isFinite(n) && n > 0
}

export function hasInvestorClassPricePerUnit(
  raw: string | undefined,
): boolean {
  const t = String(raw ?? "").trim()
  if (!t || t === "—") return false
  const n = parseMoneyDigits(t)
  return Number.isFinite(n)
}

function stripMoneyForRaiseAmount(raw: string): string {
  return String(raw ?? "")
    .replace(/[$,\s]/g, "")
    .trim()
}

/** Raise amount used for price-per-unit: distributions first, then ownership/offering size. */
export function investorClassRaiseAmountForPricePerUnit(input: {
  offeringSize: string
  raiseAmountDistributions: string
}): string {
  const dist = String(input.raiseAmountDistributions ?? "").trim()
  if (stripMoneyForRaiseAmount(dist)) return dist
  return String(input.offeringSize ?? "").trim()
}

/** Price per unit = raise amount ÷ number of units (empty when inputs are invalid). */
export function computeInvestorClassPricePerUnit(
  raiseAmount: string,
  numberOfUnits: string,
): string {
  const raise = parseMoneyDigits(raiseAmount)
  const units = parseNumberOfUnitsDigits(numberOfUnits)
  if (!Number.isFinite(raise) || !Number.isFinite(units) || units <= 0) {
    return ""
  }
  const price = raise / units
  if (!Number.isFinite(price)) return ""
  return blurFormatMoneyInput(String(price))
}

export function computeInvestorClassPricePerUnitFromForm(input: {
  offeringSize: string
  raiseAmountDistributions: string
  numberOfUnits: string
}): string {
  return computeInvestorClassPricePerUnit(
    investorClassRaiseAmountForPricePerUnit(input),
    input.numberOfUnits,
  )
}
