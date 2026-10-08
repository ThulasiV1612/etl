import { portalAuthHeaders } from "@/common/auth/portalAuthHeaders"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"

function baseOrThrow(): string {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  return base
}

async function jsonOrError(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `Payment request failed (${res.status}).`,
    )
  }
  return data
}

export async function startInvestorInvestmentCheckout(
  dealId: string,
  investmentId: string,
): Promise<{ url: string; sessionId: string; paymentStatus: string }> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/investments/${encodeURIComponent(investmentId)}/checkout`,
    {
      method: "POST",
      headers: portalAuthHeaders({ omitActiveOrganization: true }),
      credentials: "include",
    },
  )
  const data = await jsonOrError(res)
  const url = String(data.url ?? "").trim()
  if (!url) throw new Error("Stripe Checkout did not return a redirect URL.")
  return {
    url,
    sessionId: String(data.sessionId ?? "").trim(),
    paymentStatus: String(data.paymentStatus ?? "created").trim(),
  }
}

export async function syncInvestorInvestmentCheckout(
  sessionId: string,
): Promise<{ paymentStatus: string }> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/investing/investment-payments/sync-checkout`,
    {
      method: "POST",
      headers: {
        ...portalAuthHeaders({ omitActiveOrganization: true }),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ sessionId }),
    },
  )
  const data = await jsonOrError(res)
  return { paymentStatus: String(data.paymentStatus ?? "").trim() }
}

export type ConnectBankAccountSummary = {
  bankName: string | null
  last4: string | null
  routingNumber: string | null
  accountHolderName: string | null
  currency: string | null
  status: string | null
}

function parseConnectBankAccount(raw: unknown): ConnectBankAccountSummary | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const last4 =
    typeof row.last4 === "string" && row.last4.trim() ? row.last4.trim() : null
  const bankName =
    typeof row.bankName === "string" && row.bankName.trim()
      ? row.bankName.trim()
      : null
  const routingNumber =
    typeof row.routingNumber === "string" && row.routingNumber.trim()
      ? row.routingNumber.trim()
      : null
  const accountHolderName =
    typeof row.accountHolderName === "string" && row.accountHolderName.trim()
      ? row.accountHolderName.trim()
      : null
  const currency =
    typeof row.currency === "string" && row.currency.trim()
      ? row.currency.trim()
      : null
  const status =
    typeof row.status === "string" && row.status.trim()
      ? row.status.trim()
      : null
  // Keep stub summaries (e.g. "Bank account on file") so the Bank accounts tab
  // still shows a row when Stripe has not returned last4 yet.
  if (!last4 && !bankName && !routingNumber && !accountHolderName && !status) {
    return null
  }
  return {
    bankName: bankName || (last4 || routingNumber ? null : "Bank account on file"),
    last4,
    routingNumber,
    accountHolderName,
    currency,
    status,
  }
}

export type StripeConnectRecipientStatus = {
  accountId: string | null
  status: string
  detailsSubmitted: boolean
  payoutsEnabled: boolean
  bankAccount: ConnectBankAccountSummary | null
  sharedToProfileCount?: number
}

export async function fetchStripeConnectRecipientStatus(
  profileId: string,
): Promise<StripeConnectRecipientStatus> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/investing/profiles/${encodeURIComponent(profileId)}/stripe-connect/status`,
    {
      headers: portalAuthHeaders({ omitActiveOrganization: true }),
      credentials: "include",
    },
  )
  const data = await jsonOrError(res)
  return {
    accountId:
      typeof data.accountId === "string" && data.accountId.trim()
        ? data.accountId.trim()
        : null,
    status: String(data.status ?? "not_started").trim(),
    detailsSubmitted: Boolean(data.detailsSubmitted),
    payoutsEnabled: Boolean(data.payoutsEnabled),
    bankAccount: parseConnectBankAccount(data.bankAccount),
    sharedToProfileCount:
      typeof data.sharedToProfileCount === "number"
        ? data.sharedToProfileCount
        : undefined,
  }
}

export async function startStripeConnectRecipientOnboarding(
  profileId: string,
  opts?: { forceNew?: boolean },
): Promise<{ url: string; status: string; payoutsEnabled: boolean }> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/investing/profiles/${encodeURIComponent(profileId)}/stripe-connect/onboarding`,
    {
      method: "POST",
      headers: {
        ...portalAuthHeaders({ omitActiveOrganization: true }),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ forceNew: Boolean(opts?.forceNew) }),
    },
  )
  const data = await jsonOrError(res)
  const url = String(data.url ?? "").trim()
  if (!url) throw new Error("Bank setup did not return a URL. Please try again.")
  return {
    url,
    status: String(data.status ?? "onboarding").trim(),
    payoutsEnabled: Boolean(data.payoutsEnabled),
  }
}

export type InvestorSharedConnectBank = {
  accountId: string
  status: string
  payoutsEnabled: boolean
  bankAccount: ConnectBankAccountSummary | null
  profileIds: string[]
}

export async function fetchInvestorSharedConnectBanks(): Promise<
  InvestorSharedConnectBank[]
> {
  const base = baseOrThrow()
  const res = await fetch(`${base}/investing/stripe-connect/banks`, {
    headers: portalAuthHeaders({ omitActiveOrganization: true }),
    credentials: "include",
  })
  const data = await jsonOrError(res)
  if (!Array.isArray(data.banks)) return []
  return data.banks.map((raw) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >
    return {
      accountId: String(row.accountId ?? "").trim(),
      status: String(row.status ?? "not_started").trim(),
      payoutsEnabled: Boolean(row.payoutsEnabled),
      bankAccount: parseConnectBankAccount(row.bankAccount),
      profileIds: Array.isArray(row.profileIds)
        ? row.profileIds.map((id) => String(id).trim()).filter(Boolean)
        : [],
    }
  }).filter((b) => Boolean(b.accountId))
}

export async function attachStripeConnectBankToProfile(
  profileId: string,
  accountId: string,
): Promise<StripeConnectRecipientStatus> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/investing/profiles/${encodeURIComponent(profileId)}/stripe-connect/attach`,
    {
      method: "POST",
      headers: {
        ...portalAuthHeaders({ omitActiveOrganization: true }),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ accountId }),
    },
  )
  const data = await jsonOrError(res)
  return {
    accountId:
      typeof data.accountId === "string" && data.accountId.trim()
        ? data.accountId.trim()
        : null,
    status: String(data.status ?? "not_started").trim(),
    detailsSubmitted: Boolean(data.detailsSubmitted),
    payoutsEnabled: Boolean(data.payoutsEnabled),
    bankAccount: parseConnectBankAccount(data.bankAccount),
  }
}

export type DealDistributionFundingBankAccount = ConnectBankAccountSummary

export type DealDistributionFundingStatus = {
  accountId: string | null
  status: string
  detailsSubmitted: boolean
  fundingReady: boolean
  canManage: boolean
  bankAccount: DealDistributionFundingBankAccount | null
}

export async function fetchDealDistributionFundingStatus(
  dealId: string,
): Promise<DealDistributionFundingStatus> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/distribution-funding/status`,
    { headers: portalAuthHeaders(), credentials: "include" },
  )
  const data = await jsonOrError(res)
  return {
    accountId:
      typeof data.accountId === "string" && data.accountId.trim()
        ? data.accountId.trim()
        : null,
    status: String(data.status ?? "not_started").trim(),
    detailsSubmitted: Boolean(data.detailsSubmitted),
    fundingReady: Boolean(data.fundingReady),
    canManage: Boolean(data.canManage),
    bankAccount: parseConnectBankAccount(data.bankAccount),
  }
}

export async function startDealDistributionFundingOnboarding(
  dealId: string,
): Promise<{ url: string; status: string; fundingReady: boolean }> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/distribution-funding/onboarding`,
    {
      method: "POST",
      headers: portalAuthHeaders(),
      credentials: "include",
    },
  )
  const data = await jsonOrError(res)
  const url = String(data.url ?? "").trim()
  if (!url) {
    throw new Error("Bank setup did not return a URL. Please try again.")
  }
  return {
    url,
    status: String(data.status ?? "onboarding").trim(),
    fundingReady: Boolean(data.fundingReady),
  }
}

export type DistributionPayout = {
  id: string
  investmentId: string
  amountCents: number
  currency: string
  status: string
  failureCode: string | null
  failureMessage: string | null
  initiatedAt: string | null
  paidAt: string | null
  updatedAt: string
}

export async function fetchDistributionPayouts(
  dealId: string,
  distributionId: string,
): Promise<DistributionPayout[]> {
  const base = baseOrThrow()
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/distributions/${encodeURIComponent(distributionId)}/payouts`,
    { headers: portalAuthHeaders(), credentials: "include" },
  )
  const data = await jsonOrError(res)
  return Array.isArray(data.payouts)
    ? (data.payouts as DistributionPayout[])
    : []
}

export async function executeDistributionAchPayouts(
  dealId: string,
  distributionId: string,
  opts?: { investmentId?: string; investmentIds?: string[] },
): Promise<{
  initiated: number
  skipped: number
  failed: number
  results: Array<{
    investmentId: string
    investorName: string
    amountCents: number
    status: string
    message?: string
  }>
}> {
  const base = baseOrThrow()
  const investmentIds = [
    ...(opts?.investmentId?.trim() ? [opts.investmentId.trim()] : []),
    ...(opts?.investmentIds ?? []).map((id) => id.trim()).filter(Boolean),
  ]
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/distributions/${encodeURIComponent(distributionId)}/payouts`,
    {
      method: "POST",
      headers: {
        ...portalAuthHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(
        investmentIds.length === 1
          ? { investmentId: investmentIds[0] }
          : investmentIds.length > 1
            ? { investmentIds }
            : {},
      ),
    },
  )
  const data = await jsonOrError(res)
  return {
    initiated: Number(data.initiated) || 0,
    skipped: Number(data.skipped) || 0,
    failed: Number(data.failed) || 0,
    results: Array.isArray(data.results)
      ? (data.results as Array<{
          investmentId: string
          investorName: string
          amountCents: number
          status: string
          message?: string
        }>)
      : [],
  }
}
