import { portalAuthHeaders } from "../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../common/utils/apiBaseUrl"

export type StripeBillingPlanId = "starter" | "running" | "growth"
export type StripeBillingSeatBand = "5" | "10" | "10plus"

export type CompanyBillingStatus = {
  configured: boolean
  testMode: boolean
  webhookConfigured?: boolean
  companyId: string
  planId: string | null
  billingCycle: string | null
  subscriptionStatus: string
  priceId: string | null
  currentPeriodEnd: string | null
  hasCustomer: boolean
  hasSubscription: boolean
  lastPaymentError?: string | null
  lastPaymentFailedAt?: string | null
  paymentHealthy?: boolean
  billedDealCount?: number
  canManage?: boolean
  canPay?: boolean
  viewerScope?: "all_deals" | "lead_sponsor"
  saasBillingStartsAt?: string | null
  plansConfigured: Array<{
    id: StripeBillingPlanId | string
    monthlyReady: boolean
    annualReady: boolean
    monthlyEnv?: string
    annualEnv?: string
    seats?: Array<{
      seatBand: StripeBillingSeatBand | string
      monthlyReady: boolean
      annualReady: boolean
      monthlyEnv?: string
      annualEnv?: string
    }>
  }>
}

export type CompanyBillingInvoice = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  periodStart?: string
  periodEnd?: string
  planId?: string | null
  status: string
  amount: string
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  paymentFailureMessage?: string | null
  paymentFailedAt?: string | null
  dealId?: string | null
  dealName?: string | null
  billingScope?: "deal" | "extra_company_user" | null
}

export type CompanyBillingPaymentMethod = {
  id: string
  stripePaymentMethodId: string
  stripeCustomerId: string | null
  type: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  funding: string | null
  country: string | null
  fingerprint: string | null
  billingName: string | null
  billingEmail: string | null
  billingPhone: string | null
  billingAddress: unknown
  isDefault: boolean
  livemode: boolean
  stripeCreatedAt: string | null
  stripePayload: unknown
  detachedAt: string | null
  createdAt: string
  updatedAt: string
}

function authHeaders(): Record<string, string> {
  return portalAuthHeaders() as Record<string, string>
}

function messageFromBody(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const m = (data as { message?: unknown }).message
    if (typeof m === "string" && m.trim()) return m.trim()
  }
  return fallback
}

const BILLING_DEAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeBillingDealId(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase()
  return BILLING_DEAL_UUID_RE.test(s) ? s : null
}

function paidDealIdFromUnknown(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  return normalizeBillingDealId((data as { paidDealId?: unknown }).paidDealId)
}

export async function fetchCompanyBillingStatus(
  companyId: string,
): Promise<
  | { ok: true; status: CompanyBillingStatus }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing`,
      { headers: authHeaders(), credentials: "include" },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Could not load billing (${res.status}).`),
        statusCode: res.status,
      }
    }
    return { ok: true, status: data as CompanyBillingStatus }
  } catch {
    return {
      ok: false,
      message: "Network error loading billing status.",
      statusCode: 0,
    }
  }
}

export async function startCompanyBillingCheckout(
  companyId: string,
  planId: string,
  billingCycle: "monthly" | "annually",
  seatBand: StripeBillingSeatBand = "5",
  dealId?: string,
  extraCompanyUsers?: number,
): Promise<
  | { ok: true; url: string }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/checkout`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          planId,
          seatBand,
          billingCycle: billingCycle === "annually" ? "yearly" : "monthly",
          ...(dealId ? { dealId } : {}),
          ...(extraCompanyUsers && extraCompanyUsers > 0
            ? { extraCompanyUsers }
            : {}),
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Checkout failed (${res.status}).`),
        statusCode: res.status,
      }
    }
    const url =
      data && typeof data === "object"
        ? String((data as { url?: unknown }).url ?? "").trim()
        : ""
    if (!url) {
      return {
        ok: false,
        message: "Checkout did not return a Stripe URL.",
        statusCode: res.status,
      }
    }
    return { ok: true, url }
  } catch {
    return {
      ok: false,
      message: "Network error starting checkout.",
      statusCode: 0,
    }
  }
}

export async function releaseCompanyBillingPayment(
  companyId: string,
  dealId: string,
): Promise<void> {
  const base = getApiV1Base()
  const id = dealId.trim()
  if (!base || !companyId.trim() || !id) return
  try {
    await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/release-payment`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ dealId: id }),
      },
    )
  } catch {
    /* Best-effort: Checkout can still start if the hold already expired. */
  }
}

export async function payCompanyBillingWithSavedMethod(
  companyId: string,
  planId: string,
  billingCycle: "monthly" | "annually",
  seatBand: StripeBillingSeatBand,
  dealId: string,
  paymentMethodId: string,
  extraCompanyUsers?: number,
): Promise<
  | { ok: true; paidDealId: string | null; status: CompanyBillingStatus }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/pay-saved`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          planId,
          seatBand,
          billingCycle: billingCycle === "annually" ? "yearly" : "monthly",
          dealId,
          paymentMethodId,
          ...(extraCompanyUsers && extraCompanyUsers > 0
            ? { extraCompanyUsers }
            : {}),
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Payment failed (${res.status}).`),
        statusCode: res.status,
      }
    }
    return {
      ok: true,
      paidDealId: paidDealIdFromUnknown(data),
      status: data as CompanyBillingStatus,
    }
  } catch {
    return {
      ok: false,
      message: "Network error paying with this method.",
      statusCode: 0,
    }
  }
}

export async function openCompanyBillingPortal(
  companyId: string,
): Promise<
  | { ok: true; url: string }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/portal`,
      {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Billing portal failed (${res.status}).`),
        statusCode: res.status,
      }
    }
    const url =
      data && typeof data === "object"
        ? String((data as { url?: unknown }).url ?? "").trim()
        : ""
    if (!url) {
      return {
        ok: false,
        message: "Portal did not return a Stripe URL.",
        statusCode: res.status,
      }
    }
    return { ok: true, url }
  } catch {
    return {
      ok: false,
      message: "Network error opening billing portal.",
      statusCode: 0,
    }
  }
}

export async function syncCompanyBillingCheckout(
  companyId: string,
  sessionId: string,
  dealId?: string | null,
): Promise<
  | { ok: true; status: CompanyBillingStatus; paidDealId: string | null }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/sync-checkout`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          ...(dealId ? { dealId } : {}),
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Could not sync checkout (${res.status}).`),
        statusCode: res.status,
      }
    }
    return {
      ok: true,
      status: data as CompanyBillingStatus,
      paidDealId: paidDealIdFromUnknown(data),
    }
  } catch {
    return {
      ok: false,
      message: "Network error syncing checkout.",
      statusCode: 0,
    }
  }
}

export type CompanyDealBillingRow = {
  id: string
  companyId?: string | null
  companyName?: string | null
  dealName: string
  dealStage: string
  archived: boolean
  planId: string | null
  suggestedPlanId?: string | null
  needsPlanUpgrade?: boolean
  billingCycle: string | null
  subscriptionStatus: string
  nextBillingDate: string | null
  saasBillingStartsAt?: string | null
  billed: boolean
  billable?: boolean
  payable?: boolean
  includedCompanyUsers?: number
  currentCompanyUsers?: number
  extraCompanyUsersPaid?: number
  extraCompanyUsersDue?: number
  extraUserFeeCents?: number
}

export type BillingOrganizationOption = {
  id: string
  name: string
}

type BillingDealsOk = {
  ok: true
  deals: CompanyDealBillingRow[]
  canManage: boolean
  canPay: boolean
  viewerScope: "all_deals" | "lead_sponsor"
}

type BillingDealsErr = { ok: false; message: string; statusCode: number }

function parseBillingDealsResponse(
  data: unknown,
  status: number,
): BillingDealsOk | BillingDealsErr {
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      message: messageFromBody(
        data,
        `Could not load deal billing (${status}).`,
      ),
      statusCode: status,
    }
  }
  const list =
    data &&
    typeof data === "object" &&
    Array.isArray((data as { deals?: unknown }).deals)
      ? (data as { deals: CompanyDealBillingRow[] }).deals
      : []
  const canManage =
    data &&
    typeof data === "object" &&
    (data as { canManage?: unknown }).canManage === false
      ? false
      : true
  const canPay =
    data &&
    typeof data === "object" &&
    (data as { canPay?: unknown }).canPay === false
      ? false
      : canManage ||
        String((data as { viewerScope?: unknown }).viewerScope ?? "") ===
          "lead_sponsor"
  const scopeRaw =
    data && typeof data === "object"
      ? String((data as { viewerScope?: unknown }).viewerScope ?? "")
      : ""
  return {
    ok: true,
    deals: list,
    canManage,
    canPay,
    viewerScope: scopeRaw === "lead_sponsor" ? "lead_sponsor" : "all_deals",
  }
}

export async function fetchBillingOrganizations(): Promise<
  | { ok: true; organizations: BillingOrganizationOption[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API is not configured (VITE_BASE_URL)." }
  }
  try {
    const res = await fetch(`${base}/companies`, {
      headers: authHeaders(),
      credentials: "include",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, "Could not load organizations."),
      }
    }
    const raw =
      data &&
      typeof data === "object" &&
      Array.isArray((data as { companies?: unknown }).companies)
        ? (data as { companies: Array<{ id?: unknown; name?: unknown }> })
            .companies
        : []
    const organizations = raw
      .map((row) => ({
        id: String(row.id ?? "")
          .trim()
          .toLowerCase(),
        name: String(row.name ?? "").trim() || "Untitled organization",
      }))
      .filter((row) => BILLING_DEAL_UUID_RE.test(row.id))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )
    return { ok: true, organizations }
  } catch {
    return { ok: false, message: "Network error loading organizations." }
  }
}

export type PlatformOrganizationBillingRow = {
  id: string
  name: string
  dealCount: number
  billedCount: number
  totalPaidCents: number
  totalPaid: string
  deals: CompanyDealBillingRow[]
}

export async function fetchPlatformOrganizationBilling(): Promise<
  | {
      ok: true
      organizations: PlatformOrganizationBillingRow[]
      canManage: boolean
      canPay: boolean
      viewerScope: "all_deals" | "lead_sponsor"
    }
  | BillingDealsErr
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(`${base}/billing/organizations`, {
      headers: authHeaders(),
      credentials: "include",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not load organization billing (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const raw =
      data &&
      typeof data === "object" &&
      Array.isArray((data as { organizations?: unknown }).organizations)
        ? (data as { organizations: PlatformOrganizationBillingRow[] })
            .organizations
        : []
    const organizations = raw.map((row) => ({
      id: String(row.id ?? "")
        .trim()
        .toLowerCase(),
      name: String(row.name ?? "").trim() || "Untitled organization",
      dealCount: Number(row.dealCount) || 0,
      billedCount: Number(row.billedCount) || 0,
      totalPaidCents: Number(row.totalPaidCents) || 0,
      totalPaid:
        String(row.totalPaid ?? "").trim() ||
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format((Number(row.totalPaidCents) || 0) / 100),
      deals: Array.isArray(row.deals) ? row.deals : [],
    }))
    const canManage =
      data &&
      typeof data === "object" &&
      (data as { canManage?: unknown }).canManage === false
        ? false
        : true
    const canPay =
      data &&
      typeof data === "object" &&
      (data as { canPay?: unknown }).canPay === false
        ? false
        : canManage
    return {
      ok: true,
      organizations,
      canManage,
      canPay,
      viewerScope: "all_deals",
    }
  } catch {
    return {
      ok: false,
      message: "Network error loading organization billing.",
      statusCode: 0,
    }
  }
}

export async function fetchPlatformBillingDeals(): Promise<
  BillingDealsOk | BillingDealsErr
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(`${base}/billing/deals`, {
      headers: authHeaders(),
      credentials: "include",
    })
    const data = await res.json().catch(() => ({}))
    return parseBillingDealsResponse(data, res.status)
  } catch {
    return {
      ok: false,
      message: "Network error loading deal billing.",
      statusCode: 0,
    }
  }
}

export async function fetchCompanyBillingDeals(
  companyId: string,
): Promise<BillingDealsOk | BillingDealsErr> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/deals`,
      { headers: authHeaders(), credentials: "include" },
    )
    const data = await res.json().catch(() => ({}))
    return parseBillingDealsResponse(data, res.status)
  } catch {
    return {
      ok: false,
      message: "Network error loading deal billing.",
      statusCode: 0,
    }
  }
}

export async function updateCompanyDealBillingCycle(
  companyId: string,
  dealId: string,
  billingCycle: "monthly" | "annually",
): Promise<
  | { ok: true; deal: CompanyDealBillingRow }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/deals/${encodeURIComponent(dealId)}/cycle`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          billingCycle: billingCycle === "annually" ? "yearly" : "monthly",
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not update payment cycle (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const deal =
      data &&
      typeof data === "object" &&
      (data as { deal?: CompanyDealBillingRow }).deal
        ? (data as { deal: CompanyDealBillingRow }).deal
        : null
    if (!deal) {
      return {
        ok: false,
        message: "Could not update payment cycle.",
        statusCode: res.status,
      }
    }
    return { ok: true, deal }
  } catch {
    return {
      ok: false,
      message: "Network error updating payment cycle.",
      statusCode: 0,
    }
  }
}

export async function fetchPlatformBillingStartDate(): Promise<
  | { ok: true; saasBillingStartsAt: string | null; updatedAt: string | null }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(`${base}/billing/start-date`, {
      headers: authHeaders(),
      credentials: "include",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not load billing start date (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const iso =
      data && typeof data === "object"
        ? String(
            (data as { saasBillingStartsAt?: unknown }).saasBillingStartsAt ??
              "",
          ).trim()
        : ""
    const updated =
      data && typeof data === "object"
        ? String((data as { updatedAt?: unknown }).updatedAt ?? "").trim()
        : ""
    return {
      ok: true,
      saasBillingStartsAt: iso || null,
      updatedAt: updated || null,
    }
  } catch {
    return {
      ok: false,
      message: "Network error loading billing start date.",
      statusCode: 0,
    }
  }
}

export async function fetchCompanyBillingInvoices(
  companyId: string,
): Promise<
  | { ok: true; invoices: CompanyBillingInvoice[] }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/invoices`,
      { headers: authHeaders(), credentials: "include" },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Could not load invoices (${res.status}).`),
        statusCode: res.status,
      }
    }
    const list =
      data &&
      typeof data === "object" &&
      Array.isArray((data as { invoices?: unknown }).invoices)
        ? (data as { invoices: CompanyBillingInvoice[] }).invoices
        : []
    return { ok: true, invoices: list }
  } catch {
    return {
      ok: false,
      message: "Network error loading invoices.",
      statusCode: 0,
    }
  }
}

export async function fetchCompanyBillingPaymentMethods(
  companyId: string,
): Promise<
  | { ok: true; paymentMethods: CompanyBillingPaymentMethod[] }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/payment-methods`,
      { headers: authHeaders(), credentials: "include" },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not load payment methods (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const list =
      data &&
      typeof data === "object" &&
      Array.isArray((data as { paymentMethods?: unknown }).paymentMethods)
        ? (data as { paymentMethods: CompanyBillingPaymentMethod[] }).paymentMethods
        : []
    return { ok: true, paymentMethods: list }
  } catch {
    return {
      ok: false,
      message: "Network error loading payment methods.",
      statusCode: 0,
    }
  }
}

export async function syncCompanyBillingPaymentMethods(
  companyId: string,
): Promise<
  | { ok: true; paymentMethods: CompanyBillingPaymentMethod[] }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/sync-payment-methods`,
      {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not sync payment methods (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const list =
      data &&
      typeof data === "object" &&
      Array.isArray((data as { paymentMethods?: unknown }).paymentMethods)
        ? (data as { paymentMethods: CompanyBillingPaymentMethod[] }).paymentMethods
        : []
    return { ok: true, paymentMethods: list }
  } catch {
    return {
      ok: false,
      message: "Network error syncing payment methods.",
      statusCode: 0,
    }
  }
}

export type BillingPaymentElementSession = {
  clientSecret: string
  subscriptionId: string
  customerId: string
  publishableKey: string | null
  paymentIntentId: string | null
  invoiceId: string | null
  planId: string
  seatBand: string
  billingCycle: string
  priceId: string
}

export type BillingSetupIntentSession = {
  clientSecret: string
  setupIntentId: string
  customerId: string
  publishableKey: string | null
}

export type StripeBillingPublicConfig = {
  configured: boolean
  testMode: boolean
  webhookConfigured: boolean
  publishableKey: string | null
  paymentElementReady: boolean
}

export async function fetchStripeBillingConfig(): Promise<
  | { ok: true; config: StripeBillingPublicConfig }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(`${base}/billing/config`, {
      headers: authHeaders(),
      credentials: "include",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Could not load Stripe config (${res.status}).`),
        statusCode: res.status,
      }
    }
    const cfg = data as Partial<StripeBillingPublicConfig>
    return {
      ok: true,
      config: {
        configured: Boolean(cfg.configured),
        testMode: Boolean(cfg.testMode),
        webhookConfigured: Boolean(cfg.webhookConfigured),
        publishableKey:
          typeof cfg.publishableKey === "string" ? cfg.publishableKey : null,
        paymentElementReady: Boolean(cfg.paymentElementReady),
      },
    }
  } catch {
    return {
      ok: false,
      message: "Network error loading Stripe config.",
      statusCode: 0,
    }
  }
}

/** Resolve publishable key: Vite env first, then backend /billing/config. */
export async function resolveStripePublishableKey(
  fromSession?: string | null,
): Promise<string | null> {
  const fromEnv = String(
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  ).trim()
  if (fromEnv.startsWith("pk_")) return fromEnv
  const fromApi = String(fromSession ?? "").trim()
  if (fromApi.startsWith("pk_")) return fromApi
  const cfg = await fetchStripeBillingConfig()
  if (cfg.ok && cfg.config.publishableKey?.startsWith("pk_")) {
    return cfg.config.publishableKey
  }
  return null
}

/**
 * Option 2 — in-app Payment Element (card + ACH).
 * POST /companies/:id/billing/payment-element
 */
export async function startCompanyBillingPaymentElement(
  companyId: string,
  planId: string,
  billingCycle: "monthly" | "annually",
  seatBand: StripeBillingSeatBand = "5",
  dealId?: string,
): Promise<
  | { ok: true; session: BillingPaymentElementSession }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/payment-element`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          planId,
          seatBand,
          billingCycle: billingCycle === "annually" ? "yearly" : "monthly",
          ...(dealId ? { dealId } : {}),
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not start payment (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const clientSecret =
      data && typeof data === "object"
        ? String((data as { clientSecret?: unknown }).clientSecret ?? "").trim()
        : ""
    const subscriptionId =
      data && typeof data === "object"
        ? String(
            (data as { subscriptionId?: unknown }).subscriptionId ?? "",
          ).trim()
        : ""
    if (!clientSecret || !subscriptionId) {
      return {
        ok: false,
        message: "Payment Element session was incomplete.",
        statusCode: res.status,
      }
    }
    const row = data as Record<string, unknown>
    return {
      ok: true,
      session: {
        clientSecret,
        subscriptionId,
        customerId: String(row.customerId ?? "").trim(),
        publishableKey:
          typeof row.publishableKey === "string" ? row.publishableKey : null,
        paymentIntentId:
          typeof row.paymentIntentId === "string" ? row.paymentIntentId : null,
        invoiceId: typeof row.invoiceId === "string" ? row.invoiceId : null,
        planId: String(row.planId ?? planId),
        seatBand: String(row.seatBand ?? seatBand),
        billingCycle: String(row.billingCycle ?? billingCycle),
        priceId: String(row.priceId ?? ""),
      },
    }
  } catch {
    return {
      ok: false,
      message: "Network error starting Payment Element.",
      statusCode: 0,
    }
  }
}

export async function startCompanyBillingSetupIntent(
  companyId: string,
): Promise<
  | { ok: true; session: BillingSetupIntentSession }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/setup-intent`,
      {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not start SetupIntent (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    const clientSecret =
      data && typeof data === "object"
        ? String((data as { clientSecret?: unknown }).clientSecret ?? "").trim()
        : ""
    const setupIntentId =
      data && typeof data === "object"
        ? String((data as { setupIntentId?: unknown }).setupIntentId ?? "").trim()
        : ""
    if (!clientSecret || !setupIntentId) {
      return {
        ok: false,
        message: "SetupIntent session was incomplete.",
        statusCode: res.status,
      }
    }
    const row = data as Record<string, unknown>
    return {
      ok: true,
      session: {
        clientSecret,
        setupIntentId,
        customerId: String(row.customerId ?? "").trim(),
        publishableKey:
          typeof row.publishableKey === "string" ? row.publishableKey : null,
      },
    }
  } catch {
    return {
      ok: false,
      message: "Network error starting SetupIntent.",
      statusCode: 0,
    }
  }
}

export async function syncCompanyBillingPayment(
  companyId: string,
  opts?: { subscriptionId?: string; paymentIntentId?: string },
): Promise<
  | { ok: true; status: CompanyBillingStatus }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/sync-payment`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          subscriptionId: opts?.subscriptionId,
          paymentIntentId: opts?.paymentIntentId,
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(
          data,
          `Could not sync payment (${res.status}).`,
        ),
        statusCode: res.status,
      }
    }
    return { ok: true, status: data as CompanyBillingStatus }
  } catch {
    return {
      ok: false,
      message: "Network error syncing payment.",
      statusCode: 0,
    }
  }
}

export async function startExtraCompanyUserCheckout(
  companyId: string,
  dealId: string,
  quantity?: number,
): Promise<
  | { ok: true; url: string }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/extra-company-user`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          dealId,
          ...(quantity && quantity > 0 ? { extraCompanyUsers: quantity } : {}),
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Checkout failed (${res.status}).`),
        statusCode: res.status,
      }
    }
    const url =
      data && typeof data === "object"
        ? String((data as { url?: unknown }).url ?? "").trim()
        : ""
    if (!url) {
      return {
        ok: false,
        message: "Checkout did not return a Stripe URL.",
        statusCode: res.status,
      }
    }
    return { ok: true, url }
  } catch {
    return {
      ok: false,
      message: "Network error starting extra user checkout.",
      statusCode: 0,
    }
  }
}

export async function payExtraCompanyUserWithSavedMethod(
  companyId: string,
  dealId: string,
  paymentMethodId: string,
  quantity?: number,
): Promise<
  | { ok: true; extraUsersPaid: number; amountDueCents: number }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/extra-company-user/pay-saved`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          dealId,
          paymentMethodId,
          ...(quantity && quantity > 0 ? { extraCompanyUsers: quantity } : {}),
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Payment failed (${res.status}).`),
        statusCode: res.status,
      }
    }
    const extraUsersPaid =
      data && typeof data === "object"
        ? Number((data as { extraUsersPaid?: unknown }).extraUsersPaid ?? 0)
        : 0
    const amountDueCents =
      data && typeof data === "object"
        ? Number((data as { amountDueCents?: unknown }).amountDueCents ?? 0)
        : 0
    return {
      ok: true,
      extraUsersPaid: Number.isFinite(extraUsersPaid) ? extraUsersPaid : 0,
      amountDueCents: Number.isFinite(amountDueCents) ? amountDueCents : 0,
    }
  } catch {
    return {
      ok: false,
      message: "Network error paying for extra company users.",
      statusCode: 0,
    }
  }
}

export async function syncExtraCompanyUserCheckout(
  companyId: string,
  sessionId: string,
): Promise<
  | { ok: true; extraUsersPaid: number }
  | { ok: false; message: string; statusCode: number }
> {
  const base = getApiV1Base()
  if (!base) {
    return {
      ok: false,
      message: "API is not configured (VITE_BASE_URL).",
      statusCode: 0,
    }
  }
  try {
    const res = await fetch(
      `${base}/companies/${encodeURIComponent(companyId)}/billing/extra-company-user/sync-checkout`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        message: messageFromBody(data, `Could not sync extra user payment (${res.status}).`),
        statusCode: res.status,
      }
    }
    const extraUsersPaid =
      data && typeof data === "object"
        ? Number((data as { extraUsersPaid?: unknown }).extraUsersPaid ?? 0)
        : 0
    return {
      ok: true,
      extraUsersPaid: Number.isFinite(extraUsersPaid) ? extraUsersPaid : 0,
    }
  } catch {
    return {
      ok: false,
      message: "Network error syncing extra user payment.",
      statusCode: 0,
    }
  }
}
