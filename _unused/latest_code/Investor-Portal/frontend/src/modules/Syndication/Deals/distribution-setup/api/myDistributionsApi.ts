import { portalAuthHeaders } from "../../../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../../../common/utils/apiBaseUrl"

export type MyDistributionPaymentRow = {
  distributionId: string
  dealId: string
  dealName: string
  date: string
  source?: string
  name?: string
  period?: string
  dealAmount: string
  payment: string
  capital: string
  percentOfClass: string
  classId: string
  className: string
  investorName: string
}

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>
  return {}
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : ""
}

function normalizeRow(raw: unknown): MyDistributionPaymentRow | null {
  const o = asRecord(raw)
  const distributionId = str(o.distributionId ?? o.distribution_id)
  const dealId = str(o.dealId ?? o.deal_id)
  const date = str(o.date).slice(0, 10)
  const payment = str(o.payment)
  if (!distributionId || !dealId || !date || !payment) return null
  return {
    distributionId,
    dealId,
    dealName: str(o.dealName ?? o.deal_name),
    date,
    source: str(o.source) || undefined,
    name: str(o.name) || undefined,
    period: str(o.period) || undefined,
    dealAmount: str(o.dealAmount ?? o.deal_amount) || "0",
    payment,
    capital: str(o.capital) || "0",
    percentOfClass: str(o.percentOfClass ?? o.percent_of_class) || "0",
    classId: str(o.classId ?? o.class_id),
    className: str(o.className ?? o.class_name) || "—",
    investorName: str(o.investorName ?? o.investor_name) || "—",
  }
}

/** Deal-scoped: signed-in investor's payments on one deal. */
export async function fetchMyDealDistributions(dealId: string): Promise<{
  dealId: string
  dealName: string
  distributions: MyDistributionPaymentRow[]
  totalPayment: string
}> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/my-distributions`,
    { headers: { ...authHeaders() }, credentials: "include" },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  }
  const rows = Array.isArray(data.distributions) ? data.distributions : []
  return {
    dealId: str(data.dealId ?? data.deal_id) || dealId,
    dealName: str(data.dealName ?? data.deal_name),
    distributions: rows
      .map(normalizeRow)
      .filter((r): r is MyDistributionPaymentRow => r != null),
    totalPayment: str(data.totalPayment ?? data.total_payment) || "0",
  }
}

/** Investor-scoped: payments across accessible deals. */
export async function fetchMyDistributions(): Promise<{
  distributions: MyDistributionPaymentRow[]
  totalPayment: string
}> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/investing/my-distributions`, {
    headers: { ...authHeaders() },
    credentials: "include",
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  }
  const rows = Array.isArray(data.distributions) ? data.distributions : []
  return {
    distributions: rows
      .map(normalizeRow)
      .filter((r): r is MyDistributionPaymentRow => r != null),
    totalPayment: str(data.totalPayment ?? data.total_payment) || "0",
  }
}

export type MyDistributionDetail = {
  dealId: string
  dealName: string
  distribution: {
    id: string
    date: string
    source?: string
    name?: string
    notes?: string
    period?: string
    dealAmount: string
  }
  payments: Array<{
    payment: string
    capital: string
    percentOfClass: string
    classId: string
    className: string
    investorName: string
  }>
  totalPayment: string
}

/** Deal-scoped: one completed distribution for the signed-in investor. */
export async function fetchMyDealDistributionDetail(
  dealId: string,
  distributionId: string,
): Promise<MyDistributionDetail> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/my-distributions/${encodeURIComponent(distributionId)}`,
    { headers: { ...authHeaders() }, credentials: "include" },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  }
  const dist = asRecord(data.distribution)
  const paymentsRaw = Array.isArray(data.payments) ? data.payments : []
  return {
    dealId: str(data.dealId ?? data.deal_id) || dealId,
    dealName: str(data.dealName ?? data.deal_name),
    distribution: {
      id: str(dist.id) || distributionId,
      date: str(dist.date).slice(0, 10),
      source: str(dist.source) || undefined,
      name: str(dist.name) || undefined,
      notes: str(dist.notes) || undefined,
      period: str(dist.period) || undefined,
      dealAmount: str(dist.dealAmount ?? dist.deal_amount) || "0",
    },
    payments: paymentsRaw.map((p) => {
      const o = asRecord(p)
      return {
        payment: str(o.payment) || "0",
        capital: str(o.capital) || "0",
        percentOfClass: str(o.percentOfClass ?? o.percent_of_class) || "0",
        classId: str(o.classId ?? o.class_id),
        className: str(o.className ?? o.class_name) || "—",
        investorName: str(o.investorName ?? o.investor_name) || "—",
      }
    }),
    totalPayment: str(data.totalPayment ?? data.total_payment) || "0",
  }
}
