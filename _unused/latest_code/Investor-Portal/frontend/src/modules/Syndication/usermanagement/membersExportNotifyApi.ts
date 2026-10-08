import { SESSION_BEARER_KEY } from "@/common/auth/sessionKeys"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"

function authHeaders(): HeadersInit {
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  const h: HeadersInit = {}
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/** Same audit inbox as contacts export. Best-effort; failures are ignored by callers. */
export async function notifyMembersExportAudit(params: {
  rowCount: number
  exportedMemberLines?: string[]
}): Promise<void> {
  const base = getApiV1Base()
  if (!base) return
  try {
    await fetch(`${base}/users/export-notify`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        rowCount: params.rowCount,
        format: "excel_csv",
        exportedMemberLines: params.exportedMemberLines,
      }),
    })
  } catch {
    /* non-blocking */
  }
}
