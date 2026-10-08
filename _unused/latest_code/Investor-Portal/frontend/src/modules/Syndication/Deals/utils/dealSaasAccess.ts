import { isLpInvestorSessionUser, isPlatformAdmin } from "../../../../common/auth/roleUtils"
import { getSessionOrganizationCompanyId } from "../../../../common/auth/sessionOrganization"
import { fetchCompanyBillingDeals } from "../../company/companyBillingApi"
import { CREATE_DEAL_DRAFT_ROW_ID } from "../createDealDraftListRow"
import type { DealListRow } from "../types/deals.types"

export const DEAL_SAAS_PAYMENT_REQUIRED = "DEAL_SAAS_PAYMENT_REQUIRED"

export type DealSaasLockReason = "unpaid" | "expired" | "past_due"

export type DealSaasPaywallDeal = {
  id: string
  dealName: string
  reason?: DealSaasLockReason | null
  billingPlanId?: string | null
  nextBillingDate?: string | null
  billingSubscriptionStatus?: string
  viewerIsLeadSponsor?: boolean
  suggestedPlanId?: string | null
  needsPlanUpgrade?: boolean
  message?: string
}

export function dealSaasBillingSettingsPath(
  dealId: string,
  dealName?: string,
  options?: { billing?: "pay" | "upgrade" },
): string {
  const id = dealId.trim()
  const params = new URLSearchParams({
    billing: options?.billing === "upgrade" ? "upgrade" : "pay",
  })
  if (id) params.set("dealId", id)
  const name = String(dealName ?? "").trim()
  if (name) params.set("dealName", name)
  return `/settings?${params.toString()}`
}

/**
 * After sign-in, send a lead sponsor who still has unpaid billable deals
 * to Pricing for the deal that needs payment first.
 */
export async function resolveUnpaidLeadSponsorPricingPath(): Promise<
  string | null
> {
  if (isPlatformAdmin() || isLpInvestorSessionUser()) return null
  const companyId = getSessionOrganizationCompanyId()?.trim() ?? ""
  if (!companyId) return null
  const result = await fetchCompanyBillingDeals(companyId)
  if (!result.ok || !result.canPay) return null
  const unpaid = result.deals.filter(
    (row) =>
      (row.billable === true || row.payable === true) && !row.billed,
  )
  const upgrades = result.deals.filter((row) => row.needsPlanUpgrade === true)
  const queue = unpaid.length > 0 ? unpaid : upgrades
  if (queue.length === 0) return null
  const pick = [...queue].sort((a, b) => {
    const ta = Date.parse(String(a.nextBillingDate ?? "")) || Number.POSITIVE_INFINITY
    const tb = Date.parse(String(b.nextBillingDate ?? "")) || Number.POSITIVE_INFINITY
    return ta - tb
  })[0]
  if (!pick) return null
  return dealSaasBillingSettingsPath(pick.id, pick.dealName)
}

function parseLockReason(raw: unknown): DealSaasLockReason | null {
  const s = String(raw ?? "").trim().toLowerCase()
  if (s === "unpaid" || s === "expired" || s === "past_due") return s
  return null
}

function stageIsBillable(row: Pick<DealListRow, "dealStage" | "archived">): boolean {
  if (row.archived) return false
  const stage = String(row.dealStage ?? "").trim().toLowerCase()
  return (
    stage === "capital_raising" ||
    stage === "raising_capital" ||
    stage === "asset_managing" ||
    stage === "managing_asset"
  )
}

function periodEndHasPassed(iso: string | null | undefined): boolean {
  const raw = String(iso ?? "").trim()
  if (!raw) return false
  const t = Date.parse(raw)
  return Number.isFinite(t) && t < Date.now()
}

/** True when the syndicating workspace must pay MRR before view/edit. */
export function isDealListRowSaasLocked(row: DealListRow): boolean {
  if (!row?.id || row.id === CREATE_DEAL_DRAFT_ROW_ID) return false
  if (isPlatformAdmin()) return false
  const status = String(row.billingSubscriptionStatus ?? "").trim().toLowerCase()
  if (status === "active" || status === "trialing") return false
  // Server evaluation is the source of truth (past due can still have a
  // future period end; complimentary month is unlocked there too).
  if (row.billingAccessLocked === true) return true
  if (row.billingAccessLocked === false) return false
  if (!stageIsBillable(row)) return false
  // Fallback when list payload has no lock flags: complimentary until nextBillingDate.
  if (!periodEndHasPassed(row.nextBillingDate)) return false
  if (status === "past_due" || status === "unpaid") return true
  if (status === "none" || status === "canceled" || status === "incomplete") {
    return true
  }
  return false
}

export function billingPlanDisplayName(planId: string | null | undefined): string {
  const id = String(planId ?? "").trim().toLowerCase()
  if (id === "running") return "Running"
  if (id === "growth") return "Growth"
  if (id === "starter") return "Starter"
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "the required plan"
}

export function isDealListRowPlanUpgradeNeeded(row: DealListRow): boolean {
  return row.viewerIsLeadSponsor === true && row.needsPlanUpgrade === true
}

export function dealSaasPaywallFromListRow(row: DealListRow): DealSaasPaywallDeal {
  const reason =
    parseLockReason(row.billingLockReason) ??
    (periodEndHasPassed(row.nextBillingDate)
      ? "expired"
      : String(row.billingSubscriptionStatus ?? "").toLowerCase() === "past_due" ||
          String(row.billingSubscriptionStatus ?? "").toLowerCase() === "unpaid"
        ? "past_due"
        : "unpaid")
  return {
    id: row.id,
    dealName: row.dealName ?? "",
    reason,
    billingPlanId: row.billingPlanId ?? null,
    suggestedPlanId: row.suggestedPlanId ?? null,
    needsPlanUpgrade: row.needsPlanUpgrade === true,
    nextBillingDate: row.nextBillingDate ?? null,
    billingSubscriptionStatus: row.billingSubscriptionStatus,
    viewerIsLeadSponsor: row.viewerIsLeadSponsor === true,
  }
}

export class DealSaasPaymentRequiredError extends Error {
  readonly code = DEAL_SAAS_PAYMENT_REQUIRED
  readonly statusCode = 402
  readonly payload: DealSaasPaywallDeal

  constructor(payload: DealSaasPaywallDeal, message?: string) {
    super(
      message || payload.message || "Pay monthly SaaS (MRR) for this deal to continue.",
    )
    this.name = "DealSaasPaymentRequiredError"
    this.payload = payload
  }
}

export function isDealSaasPaymentRequiredError(
  err: unknown,
): err is DealSaasPaymentRequiredError {
  return err instanceof DealSaasPaymentRequiredError
}

export function parseDealSaasPaymentRequiredBody(
  data: unknown,
  fallbackDealId?: string,
): DealSaasPaywallDeal | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const rec = data as Record<string, unknown>
  const code = String(rec.code ?? "").trim()
  if (code && code !== DEAL_SAAS_PAYMENT_REQUIRED) return null
  const dealId = String(rec.dealId ?? rec.deal_id ?? fallbackDealId ?? "").trim()
  if (!dealId) return null
  const message =
    typeof rec.message === "string" && rec.message.trim()
      ? rec.message.trim()
      : undefined
  return {
    id: dealId,
    dealName: String(rec.dealName ?? rec.deal_name ?? "").trim(),
    reason: parseLockReason(rec.reason),
    billingPlanId:
      rec.billingPlanId != null || rec.billing_plan_id != null
        ? String(rec.billingPlanId ?? rec.billing_plan_id)
        : null,
    nextBillingDate:
      rec.nextBillingDate != null || rec.next_billing_date != null
        ? String(rec.nextBillingDate ?? rec.next_billing_date)
        : null,
    billingSubscriptionStatus:
      rec.billingSubscriptionStatus != null ||
      rec.billing_subscription_status != null
        ? String(rec.billingSubscriptionStatus ?? rec.billing_subscription_status)
        : undefined,
    viewerIsLeadSponsor:
      rec.viewerIsLeadSponsor === true ||
      rec.viewer_is_lead_sponsor === true ||
      rec.viewerIsLeadSponsor === "true" ||
      rec.viewer_is_lead_sponsor === "true",
    message,
  }
}
