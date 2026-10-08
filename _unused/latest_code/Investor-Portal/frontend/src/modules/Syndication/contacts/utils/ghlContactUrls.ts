import type { ContactRow } from "../types/contact.types"

const DEFAULT_GHL_APP_BASE_URL = "https://app.gohighlevel.com"

/** Resolve the GoHighLevel contact id from a CRM row. */
export function resolveGhlContactId(contact: ContactRow): string {
  const fromField = contact.ghlId?.trim()
  if (fromField) return fromField
  const id = contact.id.trim()
  if (id.toLowerCase().startsWith("ghl:")) return id.slice(4).trim()
  return id
}

/** Deep link to the native GoHighLevel contact detail page. */
export function buildGhlContactDetailUrl(params: {
  locationId: string
  contactId: string
  appBaseUrl?: string
}): string {
  const locationId = params.locationId.trim()
  const contactId = params.contactId.trim()
  if (!locationId || !contactId) return ""

  const base = (params.appBaseUrl?.trim() || DEFAULT_GHL_APP_BASE_URL).replace(
    /\/$/,
    "",
  )
  return `${base}/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contactId)}`
}

export function buildGhlContactDetailUrlForRow(
  contact: ContactRow,
  locationId: string,
  appBaseUrl?: string,
): string {
  return buildGhlContactDetailUrl({
    locationId,
    contactId: resolveGhlContactId(contact),
    appBaseUrl,
  })
}
