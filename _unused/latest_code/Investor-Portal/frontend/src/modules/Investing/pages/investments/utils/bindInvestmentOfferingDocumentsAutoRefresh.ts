import { refreshInvestmentDealDocumentsPreview } from "./refreshInvestmentDealDocumentsPreview"

/**
 * Re-fetch offering document sections from the server when the investor returns
 * to this tab/window (e.g. after the sponsor saved on the Documents tab).
 */
export function bindInvestmentOfferingDocumentsAutoRefresh(
  dealId: string | null | undefined,
  onUpdated: () => void,
): () => void {
  const id = dealId?.trim() ?? ""
  if (!id || typeof window === "undefined") return () => {}

  let inflight = false
  const refresh = () => {
    if (inflight) return
    inflight = true
    void refreshInvestmentDealDocumentsPreview(id)
      .then(() => {
        onUpdated()
      })
      .finally(() => {
        inflight = false
      })
  }

  window.addEventListener("focus", refresh)
  const onVisibility = () => {
    if (document.visibilityState === "visible") refresh()
  }
  document.addEventListener("visibilitychange", onVisibility)

  return () => {
    window.removeEventListener("focus", refresh)
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
