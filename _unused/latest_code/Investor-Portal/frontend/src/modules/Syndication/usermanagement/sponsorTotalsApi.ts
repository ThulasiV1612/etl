import { SESSION_BEARER_KEY } from "../../../common/auth/sessionKeys"
import { getApiV1Base } from "../../../common/utils/apiBaseUrl"

export interface SponsorTotalInvestmentRow {
  userId: string
  userName: string
  role: "Co-sponsor" | "admin sponsor" | "Lead Sponsor"
  totalInvestment: number
}

function roleFromApi(
  raw: unknown,
): SponsorTotalInvestmentRow["role"] {
  if (raw === "lead") return "Lead Sponsor"
  if (raw === "admin") return "admin sponsor"
  return "Co-sponsor"
}

/**
 * GET /users/sponsor-total-investments — same auth as GET /users.
 * @param organizationId Platform admin drill-in; omit for company-scoped totals (server uses actor org).
 */
export async function fetchSponsorTotalInvestments(
  organizationId?: string | null,
): Promise<{ ok: true; users: SponsorTotalInvestmentRow[] } | { ok: false; message: string }> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  if (!token) return { ok: false, message: "Not signed in." }
  const q =
    organizationId?.trim() !== undefined &&
    organizationId !== null &&
    String(organizationId).trim() !== ""
      ? `?organizationId=${encodeURIComponent(String(organizationId).trim())}`
      : ""
  try {
    const res = await fetch(
      `${base}/users/sponsor-total-investments${q}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      users?: unknown
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          typeof data.message === "string"
            ? data.message
            : `Could not load sponsor totals (${res.status})`,
      }
    }
    const raw = Array.isArray(data.users) ? data.users : []
    const users: SponsorTotalInvestmentRow[] = []
    for (const x of raw) {
      if (!x || typeof x !== "object") continue
      const o = x as Record<string, unknown>
      const userId = String(o.userId ?? o.user_id ?? "").trim()
      if (!userId) continue
      const total =
        typeof o.totalInvestment === "number"
          ? o.totalInvestment
          : typeof o.total_investment === "number"
            ? o.total_investment
            : Number(o.totalInvestment ?? o.total_investment ?? 0)
      users.push({
        userId,
        userName: String(o.userName ?? o.user_name ?? "").trim() || "—",
        role: roleFromApi(o.role),
        totalInvestment: Number.isFinite(total) ? total : 0,
      })
    }
    console.log("[SponsorTotalInvestment] GET /users/sponsor-total-investments", {
      url: `${base}/users/sponsor-total-investments${q}`,
      rowCount: users.length,
      users: users.map((u) => ({
        userId: u.userId,
        userName: u.userName,
        role: u.role,
        totalInvestment: u.totalInvestment,
      })),
    })
    return { ok: true, users }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

export function buildTotalsMapByUserId(
  rows: SponsorTotalInvestmentRow[],
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = r.userId.trim().toLowerCase()
    if (k) m.set(k, r.totalInvestment)
  }
  return m
}

export function formatTotalInvestmentUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}
