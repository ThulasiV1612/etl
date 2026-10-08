import {
  enablePortfolioRecentlyViewedForUser,
  INVESTING_DASHBOARD_OPPORTUNITIES_URL,
  migratePendingRecentlyViewedDeal,
  recordRecentlyViewedDeal,
} from "@/modules/Investing/pages/dashboard/recentlyViewedDeals"

const STORAGE_KEY = "ip_offering_portfolio_auth_intent:v1"
const MAX_AGE_MS = 60 * 60 * 1000

export type OfferingPortfolioAuthIntent = {
  dealId: string
  createdAt: number
}

export function dealOfferingPortfolioPath(dealId: string): string {
  const id = String(dealId ?? "").trim()
  if (!id) return "/dashboard"
  return `/deals/${encodeURIComponent(id)}/offering-portfolio`
}

export function writeOfferingPortfolioAuthIntent(dealId: string): void {
  const id = String(dealId ?? "").trim()
  if (!id || typeof sessionStorage === "undefined") return
  const payload: OfferingPortfolioAuthIntent = { dealId: id, createdAt: Date.now() }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

function readOfferingPortfolioAuthIntent(): OfferingPortfolioAuthIntent | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return null
    const parsed = JSON.parse(raw) as OfferingPortfolioAuthIntent
    const dealId = String(parsed?.dealId ?? "").trim()
    const createdAt = Number(parsed?.createdAt)
    if (!dealId || !Number.isFinite(createdAt)) return null
    if (Date.now() - createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { dealId, createdAt }
  } catch {
    return null
  }
}

export function clearOfferingPortfolioAuthIntent(): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function consumeOfferingPortfolioAuthIntent(): OfferingPortfolioAuthIntent | null {
  const intent = readOfferingPortfolioAuthIntent()
  if (intent) clearOfferingPortfolioAuthIntent()
  return intent
}

export function applyOfferingPortfolioPostAuth(dealId: string): {
  redirectTo: string
  postAuthState: { returnTo: string }
} {
  const id = String(dealId ?? "").trim()
  enablePortfolioRecentlyViewedForUser()
  migratePendingRecentlyViewedDeal()
  recordRecentlyViewedDeal(id)
  return {
    redirectTo: dealOfferingPortfolioPath(id),
    postAuthState: { returnTo: INVESTING_DASHBOARD_OPPORTUNITIES_URL },
  }
}
