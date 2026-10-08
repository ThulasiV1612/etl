import { getSessionUserId } from "@/common/auth/sessionUserId"

const STORAGE_PREFIX = "ip_recently_viewed_deals:v1"
const ELIGIBILITY_PREFIX = "ip_portfolio_recently_viewed_eligible:v1"
const PENDING_KEY = "ip_pending_recently_viewed_deal:v1"
const MAX_ENTRIES = 24

export const RECENTLY_VIEWED_DEALS_CHANGED_EVENT =
  "ip-recently-viewed-deals-changed"

/** Opportunities tab — recently viewed deals from shared portfolio links appear here. */
export const INVESTING_DASHBOARD_OPPORTUNITIES_URL =
  "/dashboard?dealsTab=coming_soon"

/** @deprecated Legacy URL; redirects to Opportunities tab. */
export const INVESTING_DASHBOARD_RECENTLY_VIEWED_URL =
  INVESTING_DASHBOARD_OPPORTUNITIES_URL

interface RecentlyViewedEntry {
  dealId: string
  viewedAt: number
}

function storageKeyForViewer(): string | null {
  const userId = getSessionUserId().trim()
  if (!userId) return null
  return `${STORAGE_PREFIX}:${userId}`
}

function eligibilityKeyForViewer(): string | null {
  const userId = getSessionUserId().trim()
  if (!userId) return null
  return `${ELIGIBILITY_PREFIX}:${userId}`
}

/** Users who signed up or signed in from a shared offering portfolio link. */
export function enablePortfolioRecentlyViewedForUser(): void {
  const key = eligibilityKeyForViewer()
  if (!key || typeof localStorage === "undefined") return
  try {
    localStorage.setItem(key, "1")
  } catch {
    /* quota / private mode */
  }
  notifyRecentlyViewedChanged()
}

export function isPortfolioRecentlyViewedEnabled(): boolean {
  const key = eligibilityKeyForViewer()
  if (!key || typeof localStorage === "undefined") return false
  try {
    return localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function readEntries(key: string): RecentlyViewedEntry[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw?.trim()) return []
    const parsed = JSON.parse(raw) as RecentlyViewedEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => ({
        dealId: String(row?.dealId ?? "").trim(),
        viewedAt: Number(row?.viewedAt),
      }))
      .filter((row) => row.dealId && Number.isFinite(row.viewedAt))
  } catch {
    return []
  }
}

function writeEntries(key: string, entries: RecentlyViewedEntry[]): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(entries))
  } catch {
    /* quota / private mode */
  }
}

function notifyRecentlyViewedChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_DEALS_CHANGED_EVENT))
}

/** Persist a deal the viewer opened from a shared offering or returned to without investing. */
export function recordRecentlyViewedDeal(dealId: string): void {
  if (!isPortfolioRecentlyViewedEnabled()) return
  const id = String(dealId ?? "").trim()
  if (!id) return
  const key = storageKeyForViewer()
  if (!key) return
  const now = Date.now()
  const next = [
    { dealId: id, viewedAt: now },
    ...readEntries(key).filter((row) => row.dealId !== id),
  ].slice(0, MAX_ENTRIES)
  writeEntries(key, next)
  notifyRecentlyViewedChanged()
}

/** Anonymous shared-link view — migrated into per-user storage after sign-in. */
export function writePendingRecentlyViewedDeal(dealId: string): void {
  const id = String(dealId ?? "").trim()
  if (!id || typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(PENDING_KEY, id)
  } catch {
    /* ignore */
  }
}

export function migratePendingRecentlyViewedDeal(): void {
  if (typeof sessionStorage === "undefined") return
  let pending = ""
  try {
    pending = sessionStorage.getItem(PENDING_KEY)?.trim() ?? ""
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    return
  }
  if (pending) recordRecentlyViewedDeal(pending)
}

export function readRecentlyViewedDealIds(): string[] {
  if (!isPortfolioRecentlyViewedEnabled()) return []
  const key = storageKeyForViewer()
  if (!key) return []
  return readEntries(key)
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .map((row) => row.dealId)
}
