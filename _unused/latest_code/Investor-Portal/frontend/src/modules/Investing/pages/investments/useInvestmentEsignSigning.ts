import { useCallback, useRef, useState } from "react"
import {
  fetchDealMyEsignSignSession,
  type DealMyEsignScopeQuery,
} from "@/modules/Syndication/Deals/api/dealsApi"

export interface InvestmentEsignActiveSession {
  provider?: "signflow" | "dropbox"
  signUrl: string
  clientId: string
  testMode: boolean
  signatureRequestId: string | null
  embedApiKey?: string | null
  appBaseUrl?: string | null
  documentId?: string | null
}

export type InvestmentEsignSignPhase =
  | "idle"
  | "loading"
  | "embed"
  | "completed"
  | "error"

export function useInvestmentEsignSigning(
  dealId: string,
  signatureRequestId?: string,
  esignScope?: DealMyEsignScopeQuery,
) {
  const [phase, setPhase] = useState<InvestmentEsignSignPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [waitingFor, setWaitingFor] = useState<
    "sponsor" | "investor" | "prior_investor" | null
  >(null)
  const [activeSession, setActiveSession] =
    useState<InvestmentEsignActiveSession | null>(null)
  const [embedKey, setEmbedKey] = useState(0)
  const loadGenRef = useRef(0)
  const loadingRef = useRef(false)

  const loadSession = useCallback(async () => {
    const id = dealId.trim()
    if (!id || loadingRef.current) return false
    loadingRef.current = true
    const gen = ++loadGenRef.current
    setPhase("loading")
    setError(null)
    setWaitingFor(null)

    const result = await fetchDealMyEsignSignSession(
      id,
      signatureRequestId?.trim() || undefined,
      esignScope,
    )

    if (gen !== loadGenRef.current) {
      loadingRef.current = false
      return false
    }

    loadingRef.current = false

    if (!result.ok) {
      setError(result.message)
      setWaitingFor(
        result.code === "waiting_for_prior_signer" && result.waitingFor
          ? result.waitingFor
          : null,
      )
      setActiveSession(null)
      setPhase("error")
      return false
    }

    if (result.alreadyCompleted) {
      setActiveSession(null)
      setPhase("completed")
      return true
    }

    if (!result.configured) {
      setError("eSign is not configured on this portal. Contact your sponsor.")
      setActiveSession(null)
      setPhase("error")
      return false
    }

    const provider =
      result.provider ??
      (result.signUrl?.trim() && !result.clientId?.trim() ? "signflow" : "dropbox")

    if (
      provider === "signflow"
        ? !result.signUrl?.trim() && !result.documentId?.trim()
        : !result.signUrl?.trim() || !result.clientId?.trim()
    ) {
      setError(
        "Could not start signing. Ask your sponsor to resend the eSign request.",
      )
      setActiveSession(null)
      setPhase("error")
      return false
    }

    setActiveSession({
      provider,
      signUrl: result.signUrl?.trim() || "",
      clientId: result.clientId?.trim() || "",
      testMode: result.testMode,
      signatureRequestId: result.signatureRequestId?.trim() || null,
      embedApiKey: result.embedApiKey,
      appBaseUrl: result.appBaseUrl,
      documentId: result.documentId,
    })
    setEmbedKey((k) => k + 1)
    setPhase("embed")
    return true
  }, [dealId, signatureRequestId, esignScope])

  const reset = useCallback(() => {
    loadGenRef.current += 1
    loadingRef.current = false
    setPhase("idle")
    setError(null)
    setWaitingFor(null)
    setActiveSession(null)
    setEmbedKey(0)
  }, [])

  const clearEmbed = useCallback(() => {
    setActiveSession(null)
    setPhase((p) => (p === "embed" ? "error" : p))
  }, [])

  return {
    phase,
    error,
    waitingFor,
    activeSession,
    embedKey,
    loadSession,
    reset,
    clearEmbed,
    setError,
  }
}
