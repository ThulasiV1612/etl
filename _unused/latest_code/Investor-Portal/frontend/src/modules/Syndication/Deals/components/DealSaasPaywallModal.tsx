import {
  BadgeDollarSign,
  CreditCard,
  Loader2,
  X,
} from "lucide-react"
import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { getSessionOrganizationCompanyId } from "../../../../common/auth/sessionOrganization"
import { openCompanyBillingPortal } from "../../company/companyBillingApi"
import { formatDealListDateDisplay } from "../dealsListDisplay"
import {
  dealSaasBillingSettingsPath,
  billingPlanDisplayName,
  type DealSaasPaywallDeal,
} from "../utils/dealSaasAccess"
import "./deal-stage-change-modal.css"

export function DealSaasPaywallModal({
  deal,
  onClose,
}: {
  deal: DealSaasPaywallDeal | null
  onClose: () => void
}) {
  const titleId = useId()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!deal) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [deal, busy, onClose])

  useEffect(() => {
    setBusy(false)
    setError("")
  }, [deal?.id])

  if (!deal) return null

  const lockedDeal = deal
  const isPlanUpgrade = lockedDeal.needsPlanUpgrade === true
  const suggestedLabel = billingPlanDisplayName(lockedDeal.suggestedPlanId)
  const currentLabel = billingPlanDisplayName(lockedDeal.billingPlanId)
  const reason = lockedDeal.reason ?? "unpaid"
  const subStatus = String(
    lockedDeal.billingSubscriptionStatus ?? "",
  )
    .trim()
    .toLowerCase()
  const needsExistingInvoicePay =
    !isPlanUpgrade &&
    (reason === "past_due" ||
    (reason === "expired" &&
      (subStatus === "active" ||
        subStatus === "trialing" ||
        subStatus === "past_due" ||
        subStatus === "unpaid")))
  const title = isPlanUpgrade
    ? "Upgrade this deal’s plan"
    : reason === "expired"
      ? "Billing period ended"
      : reason === "past_due"
        ? "Payment past due"
        : "Payment is due"
  const dealLabel = lockedDeal.dealName.trim()
    ? `“${lockedDeal.dealName.trim()}”`
    : "this deal"
  const canPayForDeal = lockedDeal.viewerIsLeadSponsor === true
  const description = !canPayForDeal
    ? isPlanUpgrade
      ? `The lead sponsor must upgrade ${dealLabel} to ${suggestedLabel} after the deal size increased.`
      : `The lead sponsor must pay monthly SaaS for ${dealLabel} before this deal can be opened.`
    : lockedDeal.message?.trim() ||
      (isPlanUpgrade
        ? `The raise for ${dealLabel} is now above the ${currentLabel} plan. SyndicationX selected ${suggestedLabel}. Upgrade so billing matches this deal’s size.`
        : reason === "expired"
        ? `The billing period for ${dealLabel} has ended. Pay monthly SaaS (MRR) to continue.`
        : reason === "past_due"
          ? `Monthly SaaS (MRR) for ${dealLabel} is past due. Pay now to continue.`
          : `Pay monthly SaaS (MRR) for ${dealLabel} to continue.`)
  const nextBillingLabel = lockedDeal.nextBillingDate
    ? formatDealListDateDisplay(lockedDeal.nextBillingDate)
    : null
  const payLabel = "Pay"

  function goToFirstPayment() {
    navigate(dealSaasBillingSettingsPath(lockedDeal.id, lockedDeal.dealName))
  }

  async function handlePay() {
    setError("")
    if (!needsExistingInvoicePay) {
      goToFirstPayment()
      return
    }
    const companyId = getSessionOrganizationCompanyId()?.trim() ?? ""
    if (!companyId) {
      goToFirstPayment()
      return
    }
    setBusy(true)
    const result = await openCompanyBillingPortal(companyId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    window.location.assign(result.url)
  }

  return createPortal(
    <div
      className="deal_stage_modal_overlay portal_modal_z_boost"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="deal_stage_modal deal_stage_modal--saas_paywall"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="deal_stage_modal_head">
          <div className="deal_stage_modal_icon_wrap" aria-hidden>
            <CreditCard size={22} strokeWidth={2} />
          </div>
          <div className="deal_stage_modal_head_text">
            <p className="deal_stage_modal_eyebrow">Deal billing</p>
            <h2 id={titleId} className="deal_stage_modal_title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="deal_stage_modal_close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="deal_stage_modal_body">
          <span className="deal_stage_modal_badge">
            {isPlanUpgrade
              ? "Deal size increased"
              : reason === "expired"
              ? "Billing date passed"
              : reason === "past_due"
                ? "Past due"
                : "Payment required"}
          </span>
          <p className="deal_stage_modal_desc">{description}</p>
          {nextBillingLabel ? (
            <p className="deal_stage_modal_desc" style={{ marginTop: "0.65rem" }}>
              Billing date: {nextBillingLabel}
            </p>
          ) : null}
          {error ? (
            <p className="deal_saas_paywall_error" role="alert">
              {error} You can choose a plan in Billing instead.
            </p>
          ) : null}
        </div>

        <footer className="deal_stage_modal_actions">
          <button
            type="button"
            className="deal_stage_modal_btn deal_stage_modal_btn--cancel"
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          {canPayForDeal ? (
            isPlanUpgrade ? (
              <button
                type="button"
                className="deal_stage_modal_btn deal_stage_modal_btn--confirm"
                disabled={busy}
                onClick={goToFirstPayment}
              >
                <BadgeDollarSign size={16} strokeWidth={2} aria-hidden />
                Upgrade plan
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="deal_stage_modal_btn deal_stage_modal_btn--cancel"
                  disabled={busy}
                  onClick={goToFirstPayment}
                >
                  <BadgeDollarSign size={16} strokeWidth={2} aria-hidden />
                  Choose plan
                </button>
                <button
                  type="button"
                  className="deal_stage_modal_btn deal_stage_modal_btn--confirm"
                  disabled={busy}
                  onClick={() => void handlePay()}
                >
                  {busy ? (
                    <>
                      <Loader2
                        size={16}
                        strokeWidth={2}
                        className="deals_create_btn_spin"
                        aria-hidden
                      />
                      Redirecting…
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} strokeWidth={2} aria-hidden />
                      {payLabel}
                    </>
                  )}
                </button>
              </>
            )
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
