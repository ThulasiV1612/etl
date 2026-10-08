const STORAGE_KEY = "ip_invest_now_intent:v1"
const MAX_AGE_MS = 30 * 60 * 1000

export type InvestNowIntent = {
  dealId: string
  createdAt: number
}

export function writeInvestNowIntent(dealId: string): void {
  const id = String(dealId ?? "").trim()
  if (!id || typeof sessionStorage === "undefined") return
  const payload: InvestNowIntent = { dealId: id, createdAt: Date.now() }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function readInvestNowIntent(): InvestNowIntent | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return null
    const parsed = JSON.parse(raw) as InvestNowIntent
    const dealId = String(parsed?.dealId ?? "").trim()
    const createdAt = Number(parsed?.createdAt)
    if (!dealId || !Number.isFinite(createdAt)) return null
    if (Date.now() - createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { dealId, createdAt }
  } catch {
    return null
  }
}

export function clearInvestNowIntent(): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Returns intent if present and clears storage (one-time consume). */
export function consumeInvestNowIntent(): InvestNowIntent | null {
  const intent = readInvestNowIntent()
  if (intent) clearInvestNowIntent()
  return intent
}
