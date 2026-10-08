import { SESSION_BEARER_KEY } from "../../../common/auth/sessionKeys"
import { getApiV1Base } from "../../../common/utils/apiBaseUrl"

export type PlatformMetrics = {
  companyCount: number
  activeCompanyCount: number
  suspendedCompanyCount: number
  userCount: number
  dealCount: number
  contactCount: number
  investmentCount: number
  lpInvestorCount: number
  investorProfileCount: number
  totalCommittedUsd: number
  usersByRole: { role: string; count: number }[]
}

export async function fetchPlatformMetrics(): Promise<
  | { ok: true; metrics: PlatformMetrics }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  if (!token) return { ok: false, message: "Not signed in." }

  try {
    const res = await fetch(`${base}/platform/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      metrics?: PlatformMetrics
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          typeof data.message === "string"
            ? data.message
            : `Could not load metrics (${res.status})`,
      }
    }
    if (!data.metrics || typeof data.metrics !== "object") {
      return { ok: false, message: "Invalid metrics response." }
    }
    return { ok: true, metrics: data.metrics }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

export function formatPlatformUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}

export type FundingPeriod = "7d" | "30d" | "90d" | "12m" | "all"

export type FundingSeriesPoint = {
  bucket: string
  label: string
  amountUsd: number
  cumulativeUsd: number
  investmentCount: number
}

export type PlatformFundingSeries = {
  period: FundingPeriod
  granularity: "day" | "week" | "month"
  from: string
  to: string
  points: FundingSeriesPoint[]
  totalInPeriodUsd: number
  totalFundedAllTimeUsd: number
}

export async function fetchPlatformFunding(
  period: FundingPeriod,
): Promise<
  | { ok: true; funding: PlatformFundingSeries }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  if (!token) return { ok: false, message: "Not signed in." }

  try {
    const res = await fetch(
      `${base}/platform/metrics/funding?period=${encodeURIComponent(period)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      funding?: PlatformFundingSeries
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          typeof data.message === "string"
            ? data.message
            : `Could not load funding data (${res.status})`,
      }
    }
    if (!data.funding || !Array.isArray(data.funding.points)) {
      return { ok: false, message: "Invalid funding response." }
    }
    return { ok: true, funding: data.funding }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

export type UserActivityPageCount = {
  pagePath: string
  pageLabel: string
  count: number
}

export type UserActivityRow = {
  userId: string
  sessionId?: string | null
  userName: string
  email: string
  role: string
  userStatus: string
  companyName: string | null
  loginAt: string
  logoutAt: string | null
  isActive: boolean
  pageNavigations: UserActivityPageCount[]
}

export async function fetchPlatformUserActivity(): Promise<
  | { ok: true; userActivity: UserActivityRow[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  if (!token) return { ok: false, message: "Not signed in." }

  try {
    const res = await fetch(`${base}/platform/metrics/user-activity`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      userActivity?: UserActivityRow[]
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          typeof data.message === "string"
            ? data.message
            : `Could not load user activity (${res.status})`,
      }
    }
    if (!Array.isArray(data.userActivity)) {
      return { ok: false, message: "Invalid user activity response." }
    }
    return {
      ok: true,
      userActivity: data.userActivity.map((row) => ({
        ...row,
        role: row.role ?? "",
        userStatus: row.userStatus ?? "",
        companyName: row.companyName ?? null,
        pageNavigations: Array.isArray(row.pageNavigations)
          ? row.pageNavigations
          : [],
      })),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

export function formatActivityDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d)
}

export function formatRoleLabel(role: string): string {
  return role
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
