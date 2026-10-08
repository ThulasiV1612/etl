import { useEffect, useRef, useState } from "react"
import { getSessionOrganizationCompanyId } from "../../../common/auth/sessionOrganization"
import {
  fetchCompanyBillingPaymentMethods,
  payExtraCompanyUserWithSavedMethod,
  startExtraCompanyUserCheckout,
  type CompanyBillingPaymentMethod,
} from "./companyBillingApi"
import { BillingPayMethodModal } from "./BillingPayMethodModal"
import type { ExtraCompanyUserPaymentRequired } from "../Deals/utils/extraCompanyUserBilling"

export function ExtraCompanyUserPayModal({
  payload,
  onClose,
  onPaid,
}: {
  payload: ExtraCompanyUserPaymentRequired | null
  onClose: () => void
  onPaid: () => void
}) {
  const [methods, setMethods] = useState<CompanyBillingPaymentMethod[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<"saved" | "stripe" | null>(null)
  const [error, setError] = useState("")
  const payOnceRef = useRef(false)

  const companyId = getSessionOrganizationCompanyId()?.trim() ?? ""
  const dollars = ((payload?.amountDueCents ?? 1000) / 100).toFixed(0)
  const extraCount = payload?.extraUsersToPay ?? 1

  useEffect(() => {
    if (!payload || !companyId) {
      setMethods([])
      return
    }
    payOnceRef.current = false
    setError("")
    setBusy(null)
    setLoading(true)
    void fetchCompanyBillingPaymentMethods(companyId).then((result) => {
      setLoading(false)
      if (!result.ok) {
        setMethods([])
        return
      }
      setMethods(result.paymentMethods)
    })
  }, [payload, companyId])

  if (!payload) return null

  const handlePayStripe = async () => {
    if (payOnceRef.current) return
    payOnceRef.current = true
    setError("")
    setBusy("stripe")
    const result = await startExtraCompanyUserCheckout(
      companyId,
      payload.dealId,
      extraCount,
    )
    if (!result.ok) {
      payOnceRef.current = false
      setBusy(null)
      setError(result.message)
      return
    }
    window.location.assign(result.url)
  }

  const handlePaySaved = async (paymentMethodId: string) => {
    if (payOnceRef.current) return
    payOnceRef.current = true
    setError("")
    setBusy("saved")
    const result = await payExtraCompanyUserWithSavedMethod(
      companyId,
      payload.dealId,
      paymentMethodId,
      extraCount,
    )
    if (!result.ok) {
      payOnceRef.current = false
      setBusy(null)
      setError(result.message)
      return
    }
    setBusy(null)
    onPaid()
  }

  return (
    <BillingPayMethodModal
      open
      dealName={payload.dealName}
      methods={methods}
      loading={loading}
      busy={busy}
      error={error}
      onClose={onClose}
      onPaySaved={(id) => {
        void handlePaySaved(id)
      }}
      onPayStripe={() => {
        void handlePayStripe()
      }}
      title={`Pay $${dollars} for extra company user${extraCount === 1 ? "" : "s"}`}
      description={
        <>
          This deal’s plan includes {payload.includedCompanyUsers} company user
          {payload.includedCompanyUsers === 1 ? "" : "s"}. Adding this extra
          user is a one-time ${dollars} payment for{" "}
          <strong>{payload.dealName.trim() || "this deal"}</strong>.
        </>
      }
      savedButtonLabel={`Pay $${dollars} with this method`}
      stripeButtonLabel={`Pay $${dollars}`}
    />
  )
}
