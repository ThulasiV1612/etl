/**
 * One-time read of legacy browser localStorage keys before sponsor preview
 * state was persisted on the deal row (`offering_investor_preview_json`).
 */

const SECTIONS_PREFIX = "ip_offering_preview_sections:v1:"
const DOCS_PREFIX = "ip_offering_preview_docs:v1:"
const VISIBILITY_PREFIX = "ip_offering_investor_preview_visibility:v1:"

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw?.trim()) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function readLegacyOfferingPreviewSectionsFromLocalStorage(
  dealId: string,
): unknown {
  const id = dealId.trim()
  if (!id) return null
  return readJson(`${SECTIONS_PREFIX}${id}`)
}

export function readLegacyOfferingPreviewDocumentsFromLocalStorage(
  dealId: string,
): unknown {
  const id = dealId.trim()
  if (!id) return null
  return readJson(`${DOCS_PREFIX}${id}`)
}

export function readLegacyOfferingPreviewVisibilityFromLocalStorage(
  dealId: string,
): Record<string, boolean> | null {
  const id = dealId.trim()
  if (!id) return null
  const parsed = readJson(`${VISIBILITY_PREFIX}${id}`)
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed))
    return null
  const sections = (parsed as { sections?: unknown }).sections
  if (sections == null || typeof sections !== "object" || Array.isArray(sections))
    return null
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(sections)) {
    if (typeof v === "boolean") out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

export function clearLegacyOfferingPreviewLocalStorage(dealId: string): void {
  const id = dealId.trim()
  if (!id || typeof window === "undefined") return
  try {
    window.localStorage.removeItem(`${SECTIONS_PREFIX}${id}`)
    window.localStorage.removeItem(`${DOCS_PREFIX}${id}`)
    window.localStorage.removeItem(`${VISIBILITY_PREFIX}${id}`)
  } catch {
    /* private mode */
  }
}
