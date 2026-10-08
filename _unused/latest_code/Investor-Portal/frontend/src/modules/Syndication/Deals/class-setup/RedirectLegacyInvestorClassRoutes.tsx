import { Navigate, useLocation, useParams } from "react-router-dom"

/** Legacy add route → Class Setup with new LP class. */
export function RedirectLegacyAddInvestorClass() {
  const { dealId } = useParams()
  const location = useLocation()
  if (!dealId) return <Navigate to="/deals" replace />
  return (
    <Navigate
      to={`/deals/${encodeURIComponent(dealId)}/class-setup?mode=create`}
      replace
      state={location.state}
    />
  )
}

/** Legacy edit route → Class Setup focused on that class. */
export function RedirectLegacyEditInvestorClass() {
  const { dealId, classId } = useParams()
  const location = useLocation()
  if (!dealId) return <Navigate to="/deals" replace />
  const qs =
    classId != null && classId !== ""
      ? `?classId=${encodeURIComponent(classId)}`
      : ""
  return (
    <Navigate
      to={`/deals/${encodeURIComponent(dealId)}/class-setup${qs}`}
      replace
      state={location.state}
    />
  )
}
