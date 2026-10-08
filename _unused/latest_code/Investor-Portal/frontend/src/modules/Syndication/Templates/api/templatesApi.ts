import { portalAuthHeaders } from "@/common/auth/portalAuthHeaders"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"

export type EsignTemplateSignerRole = {
  name: string
  order: number
}

export type DropboxSignTemplateStatus = "none" | "draft" | "ready"

export type ReusableEsignTemplateRow = {
  id: string
  name: string
  template_id?: string
  dropboxSignTemplateId?: string
  dropboxSignStatus: DropboxSignTemplateStatus | string
  roles: EsignTemplateSignerRole[]
  relativePath?: string
  originalName?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  archived: boolean
}

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

export async function fetchTemplatesDropboxSignConfig(): Promise<
  | { ok: true; configured: boolean; clientId: string | null; testMode: boolean }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured" }
  try {
    const res = await fetch(`${base}/templates/dropbox-sign-config`, {
      headers: { ...authHeaders() },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      configured?: unknown
      clientId?: unknown
      testMode?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not load Dropbox Sign config",
      }
    }
    return {
      ok: true,
      configured: Boolean(data.configured),
      clientId:
        typeof data.clientId === "string" && data.clientId.trim()
          ? data.clientId.trim()
          : null,
      testMode: Boolean(data.testMode),
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function fetchReusableTemplates(): Promise<
  | { ok: true; templates: ReusableEsignTemplateRow[] }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured" }
  try {
    const res = await fetch(`${base}/templates`, {
      headers: { ...authHeaders() },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      templates?: unknown
      message?: unknown
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not load templates",
      }
    }
    const templates = Array.isArray(data.templates)
      ? (data.templates as ReusableEsignTemplateRow[])
      : []
    return { ok: true, templates }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function postReusableTemplateUpload(params: {
  name: string
  file: File
}): Promise<
  | { ok: true; template: ReusableEsignTemplateRow }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured" }
  const fd = new FormData()
  fd.append("file", params.file)
  fd.append("name", params.name.trim())
  try {
    const res = await fetch(`${base}/templates/upload`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: fd,
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      template?: ReusableEsignTemplateRow
      message?: unknown
    }
    if (!res.ok || !data.template) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not upload document",
      }
    }
    return { ok: true, template: data.template }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function postReusableTemplateEmbeddedDraft(
  portalTemplateId: string,
  options?: { title?: string },
): Promise<
  | {
      ok: true
      editUrl: string
      templateId: string
      expiresAt: number
      clientId: string
      testMode: boolean
    }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured" }
  try {
    const res = await fetch(
      `${base}/templates/${encodeURIComponent(portalTemplateId)}/embedded-draft`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: options?.title?.trim() || undefined }),
        credentials: "include",
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      editUrl?: unknown
      templateId?: unknown
      expiresAt?: unknown
      clientId?: unknown
      testMode?: unknown
      message?: unknown
    }
    if (
      !res.ok ||
      typeof data.editUrl !== "string" ||
      typeof data.templateId !== "string" ||
      typeof data.clientId !== "string"
    ) {
      return {
        ok: false,
        message:
          data.message != null
            ? String(data.message)
            : "Could not open Dropbox Sign editor",
      }
    }
    return {
      ok: true,
      editUrl: data.editUrl,
      templateId: data.templateId,
      expiresAt:
        typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + 3600_000,
      clientId: data.clientId,
      testMode: Boolean(data.testMode),
    }
  } catch {
    return { ok: false, message: "Network error" }
  }
}

export async function postReusableTemplateSave(params: {
  portalTemplateId: string
  template_id: string
  name: string
  roles: EsignTemplateSignerRole[]
}): Promise<
  | { ok: true; template: ReusableEsignTemplateRow }
  | { ok: false; message: string }
> {
  const base = getApiV1Base()
  if (!base) return { ok: false, message: "API base URL is not configured" }
  try {
    const res = await fetch(`${base}/templates/save`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        portalTemplateId: params.portalTemplateId,
        template_id: params.template_id,
        name: params.name.trim(),
        roles: params.roles,
      }),
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      template?: ReusableEsignTemplateRow
      message?: unknown
    }
    if (!res.ok || !data.template) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not save template",
      }
    }
    return { ok: true, template: data.template }
  } catch {
    return { ok: false, message: "Network error" }
  }
}
