import { CircleCheck, CreditCard, ExternalLink, Loader2, X } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { CompanyBillingPaymentMethod } from "./companyBillingApi"
import "../Deals/components/deal-stage-change-modal.css"
import "./billing-pay-method-modal.css"

function formatPaymentMethodLabel(pm: CompanyBillingPaymentMethod): string {
  const type = (pm.type || "").trim().toLowerCase()
  const isBank =
    type === "us_bank_account" || type === "bank_account" || type === "ach"
  const brand = (pm.brand || (isBank ? "Bank account" : pm.type) || "Card").trim()
  const titled = brand.charAt(0).toUpperCase() + brand.slice(1)
  const last4 = pm.last4 ? `···· ${pm.last4}` : pm.stripePaymentMethodId
  const exp =
    !isBank && pm.expMonth && pm.expYear
      ? ` · Exp ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}`
      : ""
  return `${titled} ${last4}${exp}`
}

export function BillingPayMethodModal({
  open,
  dealName,
  methods,
  loading,
  busy,
  error,
  onClose,
  onPaySaved,
  onPayStripe,
  title,
  description,
  stripeButtonLabel,
  savedButtonLabel,
}: {
  open: boolean
  dealName: string
  methods: CompanyBillingPaymentMethod[]
  loading: boolean
  busy: "saved" | "stripe" | null
  error: string
  onClose: () => void
  onPaySaved: (paymentMethodId: string) => void
  onPayStripe: () => void
  title?: string
  description?: ReactNode
  stripeButtonLabel?: string
  savedButtonLabel?: string
}) {
  const titleId = useId()
  const active = methods.filter((m) => !m.detachedAt)
  const defaultId =
    active.find((m) => m.isDefault)?.stripePaymentMethodId ||
    active[0]?.stripePaymentMethodId ||
    ""
  const [selectedId, setSelectedId] = useState(defaultId)

  useEffect(() => {
    if (!open) return
    setSelectedId(defaultId)
  }, [open, defaultId])

  useEffect(() => {
    if (!open) return
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
  }, [open, busy, onClose])

  if (!open) return null

  const locked = Boolean(busy)

  return createPortal(
    <div
      className="deal_stage_modal_overlay portal_modal_z_boost"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked) onClose()
      }}
    >
      <div
        className="deal_stage_modal deal_stage_modal--pay_method"
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
            <p className="deal_stage_modal_eyebrow">Payment</p>
            <h2 id={titleId} className="deal_stage_modal_title">
              {title?.trim() || "Choose how to pay"}
            </h2>
          </div>
          <button
            type="button"
            className="deal_stage_modal_close"
            aria-label="Close"
            disabled={locked}
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="deal_stage_modal_body">
          <p className="deal_stage_modal_desc">
            {description ?? (
              <>
                Pay for{" "}
                <strong>{dealName.trim() || "this deal"}</strong> with a saved
                method, or enter a new card or bank account.
              </>
            )}
          </p>

          {loading ? (
            <p className="deal_stage_modal_desc" style={{ marginTop: "0.85rem" }}>
              Loading saved payment methods…
            </p>
          ) : active.length > 0 ? (
            <fieldset className="billing_pay_method_fieldset" disabled={locked}>
              <legend className="billing_pay_method_legend">
                Saved payment methods
              </legend>
              <div className="billing_pay_method_list" role="radiogroup">
                {active.map((pm) => {
                  const id = pm.stripePaymentMethodId
                  const checked = selectedId === id
                  return (
                    <label
                      key={pm.id}
                      className={`billing_pay_method_option${
                        checked ? " billing_pay_method_option--selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="billing-pay-method"
                        value={id}
                        checked={checked}
                        onChange={() => setSelectedId(id)}
                      />
                      <span>
                        {formatPaymentMethodLabel(pm)}
                        {pm.isDefault ? (
                          <span className="billing_pay_method_default">
                            Default
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : (
            <p className="deal_stage_modal_desc" style={{ marginTop: "0.85rem" }}>
              No saved payment methods yet. Pay with a new card or US bank
              account to save it for next time.
            </p>
          )}

          {error ? (
            <p className="deal_saas_paywall_error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="deal_stage_modal_actions billing_pay_method_actions">
          <button
            type="button"
            className="deal_stage_modal_btn deal_stage_modal_btn--cancel"
            disabled={locked}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Cancel
          </button>
          <button
            type="button"
            className="deal_stage_modal_btn deal_stage_modal_btn--cancel billing_pay_method_btn_stripe"
            disabled={locked}
            onClick={onPayStripe}
          >
            {busy === "stripe" ? (
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
                <ExternalLink size={16} strokeWidth={2} aria-hidden />
                {stripeButtonLabel || "Pay with new method"}
              </>
            )}
          </button>
          {active.length > 0 ? (
            <button
              type="button"
              className="deal_stage_modal_btn deal_stage_modal_btn--confirm"
              disabled={locked || loading || !selectedId}
              onClick={() => {
                if (!selectedId) return
                onPaySaved(selectedId)
              }}
            >
              {busy === "saved" ? (
                <>
                  <Loader2
                    size={16}
                    strokeWidth={2}
                    className="deals_create_btn_spin"
                    aria-hidden
                  />
                  Paying…
                </>
              ) : (
                <>
                  <CircleCheck size={16} strokeWidth={2} aria-hidden />
                  {savedButtonLabel || "Pay with this method"}
                </>
              )}
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
