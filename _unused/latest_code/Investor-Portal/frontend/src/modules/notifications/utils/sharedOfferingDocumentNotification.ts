const BASELINE_KEY = "investor_offering_docs_baseline_v1"

type BaselineMap = Record<string, string[]>

function readBaselineMap(): BaselineMap {
  try {
    const raw = localStorage.getItem(BASELINE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {}
    const out: BaselineMap = {}
    for (const [dealId, ids] of Object.entries(parsed as Record<string, unknown>)) {
      const key = dealId.trim()
      if (!key || !Array.isArray(ids)) continue
      out[key] = ids.map((id) => String(id).trim()).filter(Boolean)
    }
    return out
  } catch {
    return {}
  }
}

function writeBaselineMap(map: BaselineMap): void {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

export function sharedOfferingDocumentNotificationId(
  dealId: string,
  documentId: string,
): string {
  return `doc-shared:${dealId.trim()}:${documentId.trim()}`
}

/** True when this deal already has a first-seen snapshot (do not notify those ids). */
export function dealHasOfferingDocsBaseline(dealId: string): boolean {
  const key = dealId.trim()
  if (!key) return false
  return Object.prototype.hasOwnProperty.call(readBaselineMap(), key)
}

export function getOfferingDocsBaselineIds(dealId: string): Set<string> {
  const key = dealId.trim()
  if (!key) return new Set()
  return new Set(readBaselineMap()[key] ?? [])
}

/** Record the first snapshot of visible offering docs so historical files do not flood the inbox. */
export function rememberOfferingDocsBaseline(
  dealId: string,
  documentIds: string[],
): void {
  const key = dealId.trim()
  if (!key) return
  const map = readBaselineMap()
  if (Object.prototype.hasOwnProperty.call(map, key)) return
  map[key] = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))]
  writeBaselineMap(map)
}

/** After the investor opens a newly shared file, stop treating it as new. */
export function markOfferingDocSeen(dealId: string, documentId: string): void {
  const key = dealId.trim()
  const id = documentId.trim()
  if (!key || !id) return
  const map = readBaselineMap()
  const existing = new Set(map[key] ?? [])
  if (existing.has(id)) return
  existing.add(id)
  map[key] = [...existing]
  writeBaselineMap(map)
}

export function isNewlySharedOfferingDoc(
  dealId: string,
  documentId: string,
): boolean {
  const key = dealId.trim()
  const id = documentId.trim()
  if (!key || !id) return false
  if (!dealHasOfferingDocsBaseline(key)) return false
  return !getOfferingDocsBaselineIds(key).has(id)
}
