const STORAGE_KEY = "ip_offering_preview_sponsor_ref:v1"
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type OfferingPreviewSponsorAttribution = {
  dealId: string
  sponsorRef: string
  sponsorDisplayName?: string
  createdAt: number
}

export function writeOfferingPreviewSponsorAttribution(
  input: Omit<OfferingPreviewSponsorAttribution, "createdAt">,
): void {
  const dealId = String(input.dealId ?? "").trim()
  const sponsorRef = String(input.sponsorRef ?? "").trim()
  if (!dealId || !sponsorRef || typeof sessionStorage === "undefined") return
  const payload: OfferingPreviewSponsorAttribution = {
    dealId,
    sponsorRef,
    sponsorDisplayName: input.sponsorDisplayName?.trim() || undefined,
    createdAt: Date.now(),
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

function readOfferingPreviewSponsorAttribution():
  | OfferingPreviewSponsorAttribution
  | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return null
    const parsed = JSON.parse(raw) as OfferingPreviewSponsorAttribution
    const dealId = String(parsed?.dealId ?? "").trim()
    const sponsorRef = String(parsed?.sponsorRef ?? "").trim()
    const createdAt = Number(parsed?.createdAt)
    if (!dealId || !sponsorRef || !Number.isFinite(createdAt)) return null
    if (Date.now() - createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      dealId,
      sponsorRef,
      sponsorDisplayName: parsed.sponsorDisplayName?.trim() || undefined,
      createdAt,
    }
  } catch {
    return null
  }
}

export function clearOfferingPreviewSponsorAttribution(): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Returns attribution when it matches the deal; does not clear storage. */
export function readOfferingPreviewSponsorAttributionForDeal(
  dealId: string,
): OfferingPreviewSponsorAttribution | null {
  const id = String(dealId ?? "").trim()
  if (!id) return null
  const stored = readOfferingPreviewSponsorAttribution()
  if (!stored || stored.dealId.toLowerCase() !== id.toLowerCase()) return null
  return stored
}

/** One-time read for the deal; clears storage after consume. */
export function consumeOfferingPreviewSponsorAttributionForDeal(
  dealId: string,
): OfferingPreviewSponsorAttribution | null {
  const match = readOfferingPreviewSponsorAttributionForDeal(dealId)
  if (match) clearOfferingPreviewSponsorAttribution()
  return match
}

export function offeringPreviewRefFromSearchParams(
  searchParams: URLSearchParams,
): string | undefined {
  const raw = searchParams.get("ref")
  if (!raw?.trim()) return undefined
  try {
    return decodeURIComponent(raw.trim())
  } catch {
    return raw.trim()
  }
}
