import { portalAuthHeaders } from "../../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../../common/utils/apiBaseUrl"

export type OfferingShareRecipientOption = {
  id: string
  email: string
  label: string
}

/** Contacts + company members for share-preview email (directory picker). */
export type OfferingShareRecipientDirectoryPayload = {
  contacts: OfferingShareRecipientOption[]
  members: OfferingShareRecipientOption[]
}

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

function normalizeShareRecipientList(
  raw: unknown,
): OfferingShareRecipientOption[] {
  if (!Array.isArray(raw)) return []
  const out: OfferingShareRecipientOption[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const email = String(o.email ?? "").trim().toLowerCase()
    const idOpt = String(o.id ?? "").trim()
    if (!email || !idOpt) continue
    out.push({
      id: idOpt,
      email,
      label: String(o.label ?? email).trim() || email,
    })
  }
  return out
}

/** Contacts + company members for the deal’s organization (share preview email UI). */
export async function fetchOfferingShareRecipients(dealId: string): Promise<{
  contacts: OfferingShareRecipientOption[]
  members: OfferingShareRecipientOption[]
  /**
   * When the directory endpoint is missing (404 on older API builds) or returns
   * “deal not found”, we still return empty lists so manual emails work; show this hint.
   */
  directoryWarning?: string | null
}> {
  const base = getApiV1Base()
  if (!base) throw new Error("VITE_BASE_URL is not configured.")
  const id = dealId.trim()
  if (!id) throw new Error("Missing deal id.")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(id)}/offering-share-recipients`,
    {
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    contacts?: unknown
    members?: unknown
    message?: string
  }
  if (!res.ok) {
    if (res.status === 404) {
      return {
        contacts: [],
        members: [],
        directoryWarning:
          typeof data.message === "string" && data.message.trim()
            ? `${data.message.trim()} You can add recipient emails manually below.`
            : "Could not load the organization directory for this request. You can add recipient emails manually below.",
      }
    }
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `Could not load recipients (${res.status})`,
    )
  }
  return {
    contacts: normalizeShareRecipientList(data.contacts),
    members: normalizeShareRecipientList(data.members),
    directoryWarning: null,
  }
}
