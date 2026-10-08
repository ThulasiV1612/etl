import { Navigate } from "react-router-dom"

/**
 * Legacy route (`/investing/deals`) — deals list lives on Investments → Deals tab.
 */
export function InvestingDealsListPage() {
  return <Navigate to="/investing/investments" replace />
}
