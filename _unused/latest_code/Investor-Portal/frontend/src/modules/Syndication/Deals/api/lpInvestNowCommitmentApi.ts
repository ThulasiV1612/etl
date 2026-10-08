import { ensureValidAccessToken } from "../../../../common/auth/portalFetch"
import { portalAuthHeaders } from "../../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../../common/utils/apiBaseUrl"
import type { DealInvestorsPayload } from "../types/deal-investors.types"
import { fetchDealInvestors } from "./dealsApi"

function authHeaders(): HeadersInit {
  return portalAuthHeaders({ omitActiveOrganization: true })
}

export type PatchMyLpDealInvestNowCommitmentResult =
  | { ok: true; investorsPayload: DealInvestorsPayload; investmentId: string | null }
  | { ok: false; message: string }

export type MyLpDealInvestNowCommitmentPayload = {
  investmentId: string
  profileId: string
  userInvestorProfileId: string
  committedAmount: string
  fundingMethod: string
  investorClass: string
  status: string
  docSignedDate: string | null
  questionnaireAnswers: Record<string, string>
  w9Form: Record<string, string> | null
}

export type FetchMyLpDealInvestNowCommitmentResult =
  | { ok: true; payload: MyLpDealInvestNowCommitmentPayload }
  | { ok: false; message: string; notFound?: boolean }

export type InvestNowCommitmentScope = {
  userInvestorProfileId?: string
  profileId?: string
  investmentId?: string
}

export type PatchMyLpDealInvestNowCommitmentOptions = {
  profileId: string
  status: string
  docSignedDate: string
  includeUserInvestorProfileInBody: boolean
  userInvestorProfileId: string
  questionnaireAnswers?: Record<string, string>
  w9Form?: Record<string, string>
  fundingMethod?: string
  investorClassId?: string
  /** Profile / questionnaire saves without amount. */
  progressOnly?: boolean
  /** Omit `committed_amount` from the request body. */
  skipCommittedAmount?: boolean
  /** Server sets commitment to this value instead of adding. */
  replaceCommittedAmount?: boolean
  /** Encrypted sponsor ref from the offering preview link. */
  referringSponsorRef?: string
}

export type PostMyLpDealInvestNowEsignSendResult =
  | {
      ok: true
      alreadySent: boolean
      alreadyCompleted: boolean
      signatureRequestId: string | null
      investmentId: string | null
      documentNames: string[]
    }
  | { ok: false; message: string }

function commitmentScopeQuery(scope?: InvestNowCommitmentScope): string {
  if (!scope) return ""
  const params = new URLSearchParams()
  const inv = scope.investmentId?.trim()
  const uip = scope.userInvestorProfileId?.trim()
  const pid = scope.profileId?.trim()
  if (inv) params.set("investment_id", inv)
  if (uip) params.set("user_investor_profile_id", uip)
  if (pid) params.set("profile_id", pid)
  const q = params.toString()
  return q ? `?${q}` : ""
}

/**
 * GET `/deals/:dealId/lp-investors/my-invest-now-commitment` — saved Invest Now progress
 * for one book profile (W-9 omits SSN).
 */
export async function fetchMyLpDealInvestNowCommitment(
  dealId: string,
  scope: InvestNowCommitmentScope,
): Promise<FetchMyLpDealInvestNowCommitmentResult> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const did = dealId.trim()
  if (!did) return { ok: false, message: "Missing deal id." }
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/lp-investors/my-invest-now-commitment${commitmentScopeQuery(scope)}`,
      {
        method: "GET",
        headers: authHeaders(),
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : `Could not load saved progress (${res.status})`
      return { ok: false, message: msg }
    }
    if (data.found === false) {
      return {
        ok: false,
        notFound: true,
        message:
          typeof data.message === "string"
            ? data.message
            : "No saved investment progress was found for this profile on this deal.",
      }
    }
    const questionnaireRaw = data.questionnaireAnswers ?? data.questionnaire_answers
    const answers: Record<string, string> = {}
    if (questionnaireRaw && typeof questionnaireRaw === "object") {
      for (const [k, v] of Object.entries(
        questionnaireRaw as Record<string, unknown>,
      )) {
        if (typeof v === "string") answers[k] = v
      }
    }
    const w9Raw = data.w9Form ?? data.w9_form
    return {
      ok: true,
      payload: {
        investmentId: String(data.investmentId ?? data.investment_id ?? "").trim(),
        profileId: String(data.profileId ?? data.profile_id ?? "").trim(),
        userInvestorProfileId: String(
          data.userInvestorProfileId ?? data.user_investor_profile_id ?? "",
        ).trim(),
        committedAmount: String(
          data.committedAmount ?? data.committed_amount ?? "",
        ).trim(),
        fundingMethod: String(
          data.fundingMethod ?? data.funding_method ?? "",
        ).trim(),
        investorClass: String(
          data.investorClass ?? data.investor_class ?? "",
        ).trim(),
        status: String(data.status ?? "").trim(),
        docSignedDate:
          data.docSignedDate === null || data.doc_signed_date === null
            ? null
            : String(data.docSignedDate ?? data.doc_signed_date ?? "").trim() ||
              null,
        questionnaireAnswers: answers,
        w9Form:
          w9Raw && typeof w9Raw === "object" && !Array.isArray(w9Raw)
            ? (w9Raw as Record<string, string>)
            : null,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

/**
 * PATCH `/deals/:dealId/lp-investors/my-invest-now-commitment` — sets committed amount
 * (replace mode for Invest Now wizard), optional status, funding, questionnaire, W-9.
 */
export async function patchMyLpDealInvestNowCommitment(
  dealId: string,
  committedAmount: string | undefined,
  body: PatchMyLpDealInvestNowCommitmentOptions,
): Promise<PatchMyLpDealInvestNowCommitmentResult> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const did = dealId.trim()
  if (!did) return { ok: false, message: "Missing deal id." }
  try {
    const bodyObj: Record<string, string | boolean | Record<string, string>> = {
      profile_id: body.profileId.trim(),
      status: body.status ?? "",
      doc_signed_date: body.docSignedDate ?? "",
      replace_committed_amount: true,
    }
    if (body.progressOnly) bodyObj.progress_only = true
    if (!body.skipCommittedAmount && committedAmount != null) {
      bodyObj.committed_amount = committedAmount
    }
    if (body.fundingMethod?.trim()) {
      bodyObj.funding_method = body.fundingMethod.trim()
    }
    if (body.investorClassId?.trim()) {
      bodyObj.investor_class = body.investorClassId.trim()
    }
    if (body.includeUserInvestorProfileInBody) {
      bodyObj.user_investor_profile_id = (body.userInvestorProfileId ?? "").trim()
    }
    if (body.questionnaireAnswers && Object.keys(body.questionnaireAnswers).length > 0) {
      bodyObj.questionnaire_answers = body.questionnaireAnswers
    }
    if (body.w9Form && Object.keys(body.w9Form).length > 0) {
      bodyObj.w9_form = body.w9Form
    }
    if (body.referringSponsorRef?.trim()) {
      bodyObj.referring_sponsor_ref = body.referringSponsorRef.trim()
    }
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/lp-investors/my-invest-now-commitment`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(bodyObj),
      },
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : `Could not save commitment (${res.status})`
      return { ok: false, message: msg }
    }
    const investorsPayload = await fetchDealInvestors(did, {
      lpInvestorsOnly: true,
    })
    const investmentId =
      typeof data.investmentId === "string"
        ? data.investmentId.trim()
        : typeof data.investment_id === "string"
          ? data.investment_id.trim()
          : null
    return {
      ok: true,
      investorsPayload,
      investmentId: investmentId || null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}

/**
 * POST `/deals/:dealId/lp-investors/my-invest-now-esign-send` — sends profile-matched
 * eSign templates to the signed-in investor (Invest Now step 4).
 */
export type InvestNowEsignScope = {
  userInvestorProfileId?: string
  investmentId?: string
}

export async function postMyLpDealInvestNowEsignSend(
  dealId: string,
  body: {
    profileId: string
    memberDisplayName?: string
    questionnaireAnswers?: Record<string, string>
    w9Form?: Record<string, string>
  } & InvestNowEsignScope,
): Promise<PostMyLpDealInvestNowEsignSendResult> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const did = dealId.trim()
  if (!did) return { ok: false, message: "Missing deal id." }
  try {
    if (!(await ensureValidAccessToken())) {
      return { ok: false, message: "Your session expired. Sign in again." }
    }
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(did)}/lp-investors/my-invest-now-esign-send`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          profile_id: body.profileId.trim(),
          member_display_name: body.memberDisplayName?.trim() ?? "",
          ...(body.userInvestorProfileId?.trim()
            ? {
                user_investor_profile_id: body.userInvestorProfileId.trim(),
              }
            : {}),
          ...(body.investmentId?.trim()
            ? { investment_id: body.investmentId.trim() }
            : {}),
          ...(body.questionnaireAnswers &&
          Object.keys(body.questionnaireAnswers).length > 0
            ? { questionnaire_answers: body.questionnaireAnswers }
            : {}),
          ...(body.w9Form && Object.keys(body.w9Form).length > 0
            ? { w9_form: body.w9Form }
            : {}),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : `Could not send eSign (${res.status})`
      return { ok: false, message: msg }
    }
    const names = data.documentNames
    return {
      ok: true,
      alreadySent: Boolean(data.alreadySent),
      alreadyCompleted: Boolean(data.alreadyCompleted),
      signatureRequestId:
        typeof data.signatureRequestId === "string"
          ? data.signatureRequestId
          : null,
      investmentId:
        typeof data.investmentId === "string" ? data.investmentId : null,
      documentNames: Array.isArray(names)
        ? names.map((n) => String(n))
        : [],
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}
