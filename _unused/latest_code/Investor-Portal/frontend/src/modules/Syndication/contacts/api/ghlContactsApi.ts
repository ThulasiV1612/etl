import { portalAuthHeaders, organizationIdQueryParam } from "@/common/auth/portalAuthHeaders"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"
import type { ContactRow } from "../types/contact.types"

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

function normalizeGhlContact(raw: Record<string, unknown>): ContactRow {
  const tags = raw.tags
  const lists = raw.lists
  const owners = raw.owners
  return {
    id: String(raw.id ?? ""),
    ghlId: raw.ghlId != null ? String(raw.ghlId) : undefined,
    source: "ghl",
    readOnly: true,
    firstName: String(raw.firstName ?? raw.first_name ?? ""),
    lastName: String(raw.lastName ?? raw.last_name ?? ""),
    email: String(raw.email ?? ""),
    phone: String(raw.phone ?? ""),
    note: String(raw.note ?? ""),
    tags: Array.isArray(tags) ? tags.map((x) => String(x)) : [],
    lists: Array.isArray(lists) ? lists.map((x) => String(x)) : [],
    owners: Array.isArray(owners) ? owners.map((x) => String(x)) : [],
    status: "active",
    createdByDisplayName:
      raw.createdByDisplayName != null || raw.created_by_display_name != null
        ? String(raw.createdByDisplayName ?? raw.created_by_display_name)
        : "GoHighLevel",
    createdAt:
      raw.createdAt != null || raw.created_at != null
        ? String(raw.createdAt ?? raw.created_at).trim() || undefined
        : undefined,
    dealCount: 0,
    ghlSource:
      raw.ghlSource != null || raw.ghl_source != null
        ? String(raw.ghlSource ?? raw.ghl_source).trim() || undefined
        : undefined,
    companyName:
      raw.companyName != null || raw.company_name != null
        ? String(raw.companyName ?? raw.company_name).trim() || undefined
        : undefined,
    address: raw.address != null ? String(raw.address).trim() || undefined : undefined,
    city: raw.city != null ? String(raw.city).trim() || undefined : undefined,
    state: raw.state != null ? String(raw.state).trim() || undefined : undefined,
    country: raw.country != null ? String(raw.country).trim() || undefined : undefined,
    postalCode:
      raw.postalCode != null || raw.postal_code != null
        ? String(raw.postalCode ?? raw.postal_code).trim() || undefined
        : undefined,
    website: raw.website != null ? String(raw.website).trim() || undefined : undefined,
    timezone: raw.timezone != null ? String(raw.timezone).trim() || undefined : undefined,
    assignedTo:
      raw.assignedTo != null || raw.assigned_to != null
        ? String(raw.assignedTo ?? raw.assigned_to).trim() || undefined
        : undefined,
    contactType:
      raw.contactType != null || raw.contact_type != null
        ? String(raw.contactType ?? raw.contact_type).trim() || undefined
        : undefined,
    customFields: Array.isArray(raw.customFields)
      ? raw.customFields
          .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
          .map((f) => ({
            label: String(f.label ?? "Field").trim(),
            value: String(f.value ?? "").trim(),
          }))
          .filter((f) => f.label && f.value)
      : Array.isArray(raw.custom_fields)
        ? raw.custom_fields
            .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
            .map((f) => ({
              label: String(f.label ?? "Field").trim(),
              value: String(f.value ?? "").trim(),
            }))
            .filter((f) => f.label && f.value)
        : undefined,
    updatedAt:
      raw.updatedAt != null || raw.updated_at != null
        ? String(raw.updatedAt ?? raw.updated_at).trim() || undefined
        : undefined,
  }
}

export type GhlIntegrationConfig = {
  configured: boolean
  syncEnabled: boolean
  hasPrivateIntegrationKey: boolean
  hasLocationId: boolean
  baseUrl: string | null
  locationId: string | null
  appBaseUrl?: string
  provider: "gohighlevel"
  message?: string
}

export type FetchGhlContactsResult = {
  contacts: ContactRow[]
  configured: boolean
  message?: string
  meta?: {
    hasMore?: boolean
    startAfterId?: string | null
    total?: number
  }
}

export async function fetchGhlIntegrationConfig(): Promise<GhlIntegrationConfig> {
  const base = getApiV1Base()
  if (!base) {
    return {
      configured: false,
      syncEnabled: false,
      hasPrivateIntegrationKey: false,
      hasLocationId: false,
      baseUrl: null,
      locationId: null,
      appBaseUrl: "https://app.gohighlevel.com",
      provider: "gohighlevel",
      message: "API is not configured (VITE_BASE_URL).",
    }
  }

  try {
    const res = await fetch(`${base}/integrations/ghl/config`, {
      headers: { ...authHeaders() },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as GhlIntegrationConfig
    if (!res.ok) {
      return {
        configured: false,
        syncEnabled: false,
        hasPrivateIntegrationKey: false,
        hasLocationId: false,
        baseUrl: null,
        locationId: null,
        appBaseUrl: "https://app.gohighlevel.com",
        provider: "gohighlevel",
        message: data.message ?? `Error ${res.status}`,
      }
    }
    return data
  } catch {
    return {
      configured: false,
      syncEnabled: false,
      hasPrivateIntegrationKey: false,
      hasLocationId: false,
      baseUrl: null,
      locationId: null,
      appBaseUrl: "https://app.gohighlevel.com",
      provider: "gohighlevel",
      message: "Could not load GoHighLevel configuration.",
    }
  }
}

/** Load all GHL contacts for the CRM page (paginates until exhausted). */
export async function fetchGhlContacts(options?: {
  query?: string
  maxPages?: number
}): Promise<FetchGhlContactsResult> {
  const base = getApiV1Base()
  if (!base) {
    return {
      contacts: [],
      configured: false,
      message: "API is not configured (VITE_BASE_URL).",
    }
  }

  const maxPages = Math.min(Math.max(1, options?.maxPages ?? 10), 20)
  const query = options?.query?.trim() ?? ""
  const contacts: ContactRow[] = []
  let startAfterId: string | undefined
  let configured = true
  let message: string | undefined
  let meta: FetchGhlContactsResult["meta"]

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ limit: "100" })
    const oid = organizationIdQueryParam()
    if (oid) params.set("organizationId", oid)
    if (startAfterId) params.set("startAfterId", startAfterId)
    if (query) params.set("query", query)

    const res = await fetch(`${base}/integrations/ghl/contacts?${params}`, {
      headers: { ...authHeaders() },
      credentials: "include",
    })
    const data = (await res.json().catch(() => ({}))) as {
      contacts?: unknown
      configured?: boolean
      message?: string
      meta?: FetchGhlContactsResult["meta"]
    }

    if (!res.ok) {
      return {
        contacts,
        configured: Boolean(data.configured),
        message:
          data.message != null ? String(data.message) : `Error ${res.status}`,
        meta: data.meta,
      }
    }

    configured = data.configured !== false
    message = data.message != null ? String(data.message) : undefined
    meta = data.meta

    const list = data.contacts
    if (!Array.isArray(list)) break

    for (const item of list) {
      if (item != null && typeof item === "object") {
        contacts.push(normalizeGhlContact(item as Record<string, unknown>))
      }
    }

    if (!meta?.hasMore || !meta.startAfterId) break
    startAfterId = meta.startAfterId
  }

  return { contacts, configured, message, meta }
}

/** Load one GHL contact via the backend private integration key (no GHL login). */
export async function fetchGhlContactDetail(
  ghlContactId: string,
): Promise<ContactRow> {
  const base = getApiV1Base()
  if (!base) {
    throw new Error("API is not configured (VITE_BASE_URL).")
  }

  const id = ghlContactId.trim().replace(/^ghl:/i, "")
  if (!id) throw new Error("GoHighLevel contact id is required")

  const params = new URLSearchParams()
  const oid = organizationIdQueryParam()
  if (oid) params.set("organizationId", oid)
  const q = params.toString()

  const res = await fetch(
    `${base}/integrations/ghl/contacts/${encodeURIComponent(id)}${q ? `?${q}` : ""}`,
    {
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as {
    message?: unknown
    contact?: Record<string, unknown>
  }
  if (!res.ok) {
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  }
  const contact = data.contact
  if (!contact || typeof contact !== "object") {
    throw new Error("Invalid GoHighLevel contact response")
  }
  return normalizeGhlContact(contact)
}
