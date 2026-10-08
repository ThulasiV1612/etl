import {
  SESSION_BEARER_KEY,
  SESSION_USER_DETAILS_KEY,
} from "../../auth/sessionKeys"
import { decodeJwtPayload } from "../../../modules/auth/utils/decode-jwt-payload"
import { getApiV1Base } from "../../utils/apiBaseUrl"

function splitEmailCsv(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter((x) => x.includes("@"))
}

export function parseEmailInput(raw: string): string[] {
  return [...new Set(splitEmailCsv(raw))]
}

export function getCurrentSessionUserEmail(): string {
  try {
    const rawUserDetails = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (rawUserDetails) {
      const parsed = JSON.parse(rawUserDetails) as unknown
      const first = Array.isArray(parsed) ? parsed[0] : null
      if (first && typeof first === "object") {
        const email = String((first as Record<string, unknown>).email ?? "").trim()
        if (email.includes("@")) return email
      }
    }
  } catch {
    // ignore bad session payload
  }

  const token = sessionStorage.getItem(SESSION_BEARER_KEY)
  if (!token) return ""
  const payload = decodeJwtPayload<Record<string, unknown>>(token)
  const email = String(payload?.email ?? "").trim()
  return email.includes("@") ? email : ""
}

let cachedBackendBcc: string[] | null = null

/** BCC list comes from backend mail defaults (not frontend env). */
export async function getDefaultBccFromEnv(): Promise<string[]> {
  if (cachedBackendBcc) return cachedBackendBcc
  const base = getApiV1Base()
  const token = sessionStorage.getItem(SESSION_BEARER_KEY)
  if (!base || !token) return []
  try {
    const res = await fetch(`${base}/mail/defaults`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as { bcc?: unknown }
    if (!res.ok) return []
    const list = Array.isArray(data.bcc)
      ? data.bcc.map((x) => String(x).trim()).filter((x) => x.includes("@"))
      : []
    cachedBackendBcc = [...new Set(list)]
    return cachedBackendBcc
  } catch {
    return []
  }
}

export function buildMailtoHref(params: {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  body?: string
}): string {
  const q = new URLSearchParams()
  if (params.to.length > 0) q.set("to", [...new Set(params.to)].join(","))
  if (params.cc && params.cc.length > 0) q.set("cc", [...new Set(params.cc)].join(","))
  if (params.bcc && params.bcc.length > 0) q.set("bcc", [...new Set(params.bcc)].join(","))
  if (params.subject && params.subject.trim()) q.set("subject", params.subject.trim())
  if (params.body && params.body.trim()) q.set("body", params.body.trim())
  return `mailto:?${q.toString()}`
}

export function emailTemplateHtmlToPlainText(html: string): string {
  const stripped = String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
  const decoded = decodeHtmlEntities(stripped)
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
  return decoded.trim()
}

function decodeHtmlEntities(input: string): string {
  if (!input) return ""
  const textarea = document.createElement("textarea")
  textarea.innerHTML = input
  return textarea.value
}

export async function openSendMailDraft(params: {
  to: string[]
  ccRaw?: string
  templateSubject?: string
  templateBodyHtml?: string
  senderEmail?: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = getApiV1Base()
  const token = sessionStorage.getItem(SESSION_BEARER_KEY)
  if (!base || !token) {
    return { ok: false, message: "Not signed in or API is not configured." }
  }
  const cc = parseEmailInput(params.ccRaw ?? "")
  const to = [...new Set(params.to.filter((x) => x.includes("@")))]
  const subject = decodeHtmlEntities(params.templateSubject ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (to.length === 0) {
    return { ok: false, message: "No valid recipients selected." }
  }
  if (!subject) {
    return { ok: false, message: "Template subject is required." }
  }
  const bodyText = emailTemplateHtmlToPlainText(params.templateBodyHtml ?? "")
  try {
    const res = await fetch(`${base}/mail/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        to,
        cc,
        subject,
        bodyHtml: params.templateBodyHtml ?? "",
        bodyText,
        senderEmail: params.senderEmail || getCurrentSessionUserEmail(),
      }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: unknown }
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not send email.",
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: "Unable to connect. Try again later." }
  }
}

export function buildSendMailPreviewHref(params: {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  body?: string
}): string {
  return buildMailtoHref({
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    body: params.body,
  })
}
