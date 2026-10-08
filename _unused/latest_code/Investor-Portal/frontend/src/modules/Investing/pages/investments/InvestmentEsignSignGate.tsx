import { Navigate, useParams } from "react-router-dom"
import {
  AUTH_RETURN_NEXT_KEY,
  SESSION_BEARER_KEY,
} from "@/common/auth/sessionKeys"
import { InvestmentEsignSignPage } from "./InvestmentEsignSignPage"

/**
 * Public entry for eSign links from email (no RequireAuth wrapper).
 * Unauthenticated users go to sign-in with `?next=` so return path survives refresh.
 */
export function InvestmentEsignSignGate() {
  const { investmentId = "" } = useParams<{ investmentId: string }>()
  const dealId = decodeURIComponent(investmentId.trim())
  if (!dealId) {
    return <Navigate to="/signin" replace />
  }

  const returnPath = `/investing/investments/${encodeURIComponent(dealId)}/esign`
  const session = sessionStorage.getItem(SESSION_BEARER_KEY)
  if (!session) {
    sessionStorage.setItem(AUTH_RETURN_NEXT_KEY, returnPath)
    return (
      <Navigate
        to={`/signin?next=${encodeURIComponent(returnPath)}`}
        replace
      />
    )
  }
  sessionStorage.removeItem(AUTH_RETURN_NEXT_KEY)

  return <InvestmentEsignSignPage />
}

export default InvestmentEsignSignGate
