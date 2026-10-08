import { Navigate, Outlet, useLocation } from "react-router-dom"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"

/**
 * Investing LP deal routes under `/deals/*` (not syndication list/create/tools):
 * `/deals/:dealId`, `/deals/:dealId/offering-portfolio`, `/deals/:dealId/invest`.
 */
const INVESTING_DEAL_WORKSPACE_PATH =
  /^\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/(offering-portfolio|invest))?$/i

/** Syndication-only shell for `/deals/*` */
export default function DealsLayout() {
  const { mode } = usePortalMode()
  const location = useLocation()

  if (mode === "investing") {
    const path = (location.pathname || "/").replace(/\/+$/, "") || "/"
    if (!INVESTING_DEAL_WORKSPACE_PATH.test(path)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <Outlet />
}
