import { ensureValidAccessToken } from "../../../common/auth/portalFetch"
import { portalAuthHeaders } from "../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../common/utils/apiBaseUrl"

export type InvestmentSignStatus =
  | "Sent"
  | "Viewed"
  | "Signed"
  | "Completed"

export type InvestmentSignStatusPayload = {
  status: InvestmentSignStatus
  sent_at: string | null
  viewed_at: string | null
  signed_at: string | null
  completed_at: string | null
  signature_request_id?: string | null
}

function authHeaders(): HeadersInit {
  return portalAuthHeaders({ omitActiveOrganization: true })
}

export type FetchInvestmentSignStatusResult =
  | { ok: true; payload: InvestmentSignStatusPayload }
  | { ok: false; message: string }

/**
 * GET `/api/v1/investments/:investmentId/sign-status` — webhook-backed Dropbox Sign status.
 */
export async function fetchInvestmentSignStatus(
  investmentId: string,
): Promise<FetchInvestmentSignStatusResult> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured." }
  const id = investmentId.trim()
  if (!id) return { ok: false, message: "Missing investment id." }

  try {
    if (!(await ensureValidAccessToken())) {
      return { ok: false, message: "Your session expired. Sign in again." }
    }
    const res = await fetch(
      `${base}/investments/${encodeURIComponent(id)}/sign-status`,
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
          : `Could not load sign status (${res.status})`
      return { ok: false, message: msg }
    }

    const statusRaw = String(data.status ?? "Sent").trim()
    const status: InvestmentSignStatus =
      statusRaw === "Viewed" ||
      statusRaw === "Signed" ||
      statusRaw === "Completed"
        ? statusRaw
        : "Sent"

    return {
      ok: true,
      payload: {
        status,
        sent_at:
          typeof data.sent_at === "string" ? data.sent_at : null,
        viewed_at:
          typeof data.viewed_at === "string" ? data.viewed_at : null,
        signed_at:
          typeof data.signed_at === "string" ? data.signed_at : null,
        completed_at:
          typeof data.completed_at === "string" ? data.completed_at : null,
        signature_request_id:
          typeof data.signature_request_id === "string"
            ? data.signature_request_id
            : null,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error"
    return { ok: false, message: msg }
  }
}
