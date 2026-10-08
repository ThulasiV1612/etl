import { Navigate, Outlet, useLocation } from "react-router-dom"
import { isLpInvestorSessionUser } from "@/common/auth/roleUtils"

const LP_INVESTOR_ALLOWED_PREFIXES = [
  "/investing",
  "/contacts",
  "/account",
  "/support",
  "/refer-a-friend",
  "/notifications",
] as const

/** Authenticated LP read-only offering page (same route as sponsors; not general `/deals` shell). */
const LP_DEAL_OFFERING_PORTFOLIO = /^\/deals\/[^/]+\/offering-portfolio$/i

/** Read-only deal workspace: `/deals/:dealId` (offering overview + Invest now), not list/create/tools. */
const LP_DEAL_DETAIL = /^\/deals\/[^/]+$/i

/** LP invest-now wizard: `/deals/:dealId/invest`. */
const LP_DEAL_INVEST = /^\/deals\/[^/]+\/invest$/i

const LP_DEAL_PATH_EXCLUDED_SEGMENTS = new Set([
  "create",
  "investor-emails",
  "reporting",
])

export function isLpDealOfferingPortfolioPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/"
  return LP_DEAL_OFFERING_PORTFOLIO.test(p)
}

export function isLpDealInvestPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/"
  return LP_DEAL_INVEST.test(p)
}

export function isLpDealDetailPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/"
  if (isLpDealInvestPath(p)) return true
  if (!LP_DEAL_DETAIL.test(p)) return false
  const seg = p.split("/").filter(Boolean)[1] ?? ""
  if (!seg || LP_DEAL_PATH_EXCLUDED_SEGMENTS.has(seg.toLowerCase()))
    return false
  return true
}

/** Paths LP investors may open (investing experience only; blocks syndication / admin shell routes). */
export function isPathAllowedForLpInvestor(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/"
  if (p === "/" || p === "/dashboard") return true
  if (isLpDealOfferingPortfolioPath(p)) return true
  if (isLpDealDetailPath(p)) return true
  for (const prefix of LP_INVESTOR_ALLOWED_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true
  }
  return false
}

/**
 * Redirects LP Investor deal participants away from admin / syndicating shell routes
 * (e.g. `/deals`, `/members`) to the investing deals hub — except
 * `/deals/:dealId/offering-portfolio` and `/deals/:dealId` (read-only deal / offering view).
 */
export function LpInvestorShellGuard() {
  const { pathname } = useLocation()
  if (!isLpInvestorSessionUser()) return <Outlet />
  if (isPathAllowedForLpInvestor(pathname)) return <Outlet />
  return <Navigate to="/investing/investments" replace />
}
