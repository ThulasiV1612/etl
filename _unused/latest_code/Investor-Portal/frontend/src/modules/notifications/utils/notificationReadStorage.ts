const STORAGE_KEY = "portal_notifications_read_v1"

function readIdSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map((x) => String(x).trim()).filter(Boolean))
  } catch {
    return new Set()
  }
}

function writeIdSet(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore quota / private mode */
  }
}

export function getReadNotificationIds(): Set<string> {
  return readIdSet()
}

export function persistNotificationRead(id: string): void {
  const trimmed = id.trim()
  if (!trimmed) return
  const ids = readIdSet()
  ids.add(trimmed)
  writeIdSet(ids)
}

export function persistAllNotificationsRead(ids: string[]): void {
  const next = readIdSet()
  for (const id of ids) {
    const trimmed = id.trim()
    if (trimmed) next.add(trimmed)
  }
  writeIdSet(next)
}

export function clearNotificationReadState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
