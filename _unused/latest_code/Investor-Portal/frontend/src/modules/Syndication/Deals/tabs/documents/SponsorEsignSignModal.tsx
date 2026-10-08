import { FileSignature, Loader2, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import { DropboxSignEmbeddedSigner } from "@/common/components/dropbox-sign-embedded/DropboxSignEmbeddedSigner"
import { SignFlowEmbeddedSigner } from "@/common/components/signflow-embedded"
import { toast } from "@/common/components/Toast"
import {
  fetchDealSponsorEsignSignSession,
  postDealSponsorEsignSync,
  syncCompletedEsignDocumentsToDocumentsTab,
  type DealSponsorEsignSignerOption,
} from "../../api/dealsApi"
import "../../deal-esign-ui.css"

type SponsorEsignSignPhase =
  | "idle"
  | "picker"
  | "loading"
  | "embed"
  | "completed"
  | "error"

type ActiveSession = {
  provider: "signflow" | "dropbox"
  signUrl: string
  clientId: string
  testMode: boolean
  signatureRequestId: string
  embedApiKey?: string | null
  appBaseUrl?: string | null
  documentId?: string | null
}

export interface SponsorEsignSignModalProps {
  open: boolean
  dealId: string
  documentName: string
  signatureRequestId: string
  onClose: () => void
  onSignedComplete?: () => void
}

export function SponsorEsignSignModal({
  open,
  dealId,
  documentName,
  signatureRequestId,
  onClose,
  onSignedComplete,
}: SponsorEsignSignModalProps) {
  const dealIdTrimmed = dealId.trim()
  const sigId = signatureRequestId.trim()
  const [phase, setPhase] = useState<SponsorEsignSignPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [signerOptions, setSignerOptions] = useState<
    DealSponsorEsignSignerOption[]
  >([])
  const [selectedSignerRowId, setSelectedSignerRowId] = useState("")
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [embedKey, setEmbedKey] = useState(0)
  const signedHandledRef = useRef(false)
  const loadGenRef = useRef(0)

  const clearEmbed = useCallback(() => {
    setActiveSession(null)
    setEmbedKey(0)
  }, [])

  const reset = useCallback(() => {
    setPhase("idle")
    setError(null)
    setSignerOptions([])
    setSelectedSignerRowId("")
    setActiveSession(null)
    setEmbedKey(0)
  }, [])

  const handleClose = useCallback(() => {
    signedHandledRef.current = false
    reset()
    onClose()
  }, [onClose, reset])

  const loadSession = useCallback(
    async (assigneeMemberRowId?: string, isRetry = false) => {
      const id = dealIdTrimmed
      if (!id || !sigId) return false
      const gen = ++loadGenRef.current
      setPhase("loading")
      setError(null)

      const result = await fetchDealSponsorEsignSignSession(
        id,
        sigId,
        assigneeMemberRowId,
      )
      if (gen !== loadGenRef.current) return false

      if (
        !result.ok &&
        !isRetry &&
        result.code === "waiting_for_prior_signer" &&
        result.waitingFor === "investor"
      ) {
        await syncCompletedEsignDocumentsToDocumentsTab(id)
        await postDealSponsorEsignSync(id, sigId)
        return loadSession(assigneeMemberRowId, true)
      }

      if (!result.ok) {
        const waitingHint =
          result.code === "waiting_for_prior_signer" && result.waitingFor === "investor"
            ? " The investor profile for this document may still be syncing — try again in a moment."
            : result.code === "waiting_for_prior_signer" && result.waitingFor === "sponsor"
              ? " The lead sponsor must sign before other parties can proceed."
              : ""
        setError(`${result.message}${waitingHint}`)
        setActiveSession(null)
        setPhase("error")
        return false
      }

      if (result.alreadyCompleted) {
        setActiveSession(null)
        setPhase("completed")
        return true
      }

      if (result.needsSignerSelection) {
        setSignerOptions(result.signerOptions)
        setSelectedSignerRowId(result.signerOptions[0]?.rowId ?? "")
        setPhase("picker")
        return true
      }

      if (!result.configured) {
        setError("eSign is not configured on this portal.")
        setPhase("error")
        return false
      }

      const provider = result.provider
      if (
        provider === "signflow"
          ? !result.signUrl?.trim() && !result.documentId?.trim()
          : !result.signUrl?.trim() || !result.clientId?.trim()
      ) {
        setError("Could not start sponsor signing.")
        setPhase("error")
        return false
      }

      setActiveSession({
        provider,
        signUrl: result.signUrl?.trim() || "",
        clientId: result.clientId?.trim() || "",
        testMode: result.testMode,
        signatureRequestId: result.signatureRequestId,
        embedApiKey: result.embedApiKey,
        appBaseUrl: result.appBaseUrl,
        documentId: result.documentId,
      })
      setEmbedKey((k) => k + 1)
      setPhase("embed")
      return true
    },
    [dealIdTrimmed, sigId],
  )

  const handleFinish = useCallback(() => {
    if (signedHandledRef.current) return
    signedHandledRef.current = true
    void (async () => {
      const syncRes = await postDealSponsorEsignSync(dealIdTrimmed, sigId)
      if (!syncRes.ok) {
        toast.error(
          "Signed, sync pending",
          syncRes.message ||
            "Your signature was recorded. Refresh the Documents tab if status does not update.",
        )
      } else {
        toast.success("Sponsor signature received", "The document has been updated.")
      }
      try {
        await onSignedComplete?.()
      } finally {
        reset()
        onClose()
      }
    })()
  }, [dealIdTrimmed, onClose, onSignedComplete, reset, sigId])

  useEffect(() => {
    if (!open || !dealIdTrimmed || !sigId) {
      signedHandledRef.current = false
      reset()
      return
    }
    signedHandledRef.current = false
    void loadSession()
    return () => {
      reset()
    }
  }, [open, dealIdTrimmed, sigId, loadSession, reset])

  if (!open || !dealIdTrimmed || !sigId) return null

  const showEmbed = phase === "embed" && activeSession && embedKey > 0
  const docLabel = documentName.trim() || "Document"

  const handleBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose()
  }

  return (
    <div
      className="um_modal_overlay deal_esign_overlay deal_esign_overlay--signing"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="um_modal deal_esign_modal deal_esign_modal--signing"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsor-esign-sign-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head">
          <h2
            id="sponsor-esign-sign-title"
            className="um_modal_title um_title_with_icon"
          >
            <FileSignature size={20} aria-hidden />
            <span>Sponsor counter-sign</span>
          </h2>
          <button
            type="button"
            className="um_modal_close"
            onClick={handleClose}
            aria-label="Close signing"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="deal_esign_modal_body deal_esign_modal_body--signing">
          <p className="deal_esign_modal_doc_name">{docLabel}</p>

          {phase === "picker" ? (
            <div className="deal_esign_sponsor_picker">
              <label className="deal_esign_sponsor_picker_label" htmlFor="sponsor-signer-select">
                Who will sign for the sponsor?
              </label>
              <select
                id="sponsor-signer-select"
                className="deal_esign_sponsor_picker_select"
                value={selectedSignerRowId}
                onChange={(e) => setSelectedSignerRowId(e.target.value)}
              >
                {signerOptions.map((o) => (
                  <option key={o.rowId} value={o.rowId}>
                    {o.name} ({o.role})
                  </option>
                ))}
              </select>
              <div className="deal_esign_sign_actions">
                <button
                  type="button"
                  className="um_btn_primary"
                  disabled={!selectedSignerRowId}
                  onClick={() => void loadSession(selectedSignerRowId)}
                >
                  Continue to sign
                </button>
              </div>
            </div>
          ) : null}

          {phase === "loading" && !showEmbed ? (
            <p className="deal_esign_status_row deal_esign_sign_loading" role="status">
              <Loader2
                className="deal_esign_spin"
                size={18}
                strokeWidth={2}
                aria-hidden
              />
              Preparing signing session…
            </p>
          ) : null}

          {error && phase === "error" ? (
            <p className="deal_esign_notice deal_esign_notice--error" role="alert">
              {error}
            </p>
          ) : null}

          {phase === "completed" ? (
            <p className="deal_esign_notice" role="status">
              Sponsor signing is already complete for this document.
            </p>
          ) : null}

          {phase === "error" ? (
            <div className="deal_esign_sign_actions">
              <button
                type="button"
                className="um_btn_primary"
                onClick={() => void loadSession(selectedSignerRowId || undefined)}
              >
                Try again
              </button>
            </div>
          ) : null}

          {showEmbed && activeSession ? (
            <div className="deal_esign_modal_sign_embed">
              {activeSession.provider === "signflow" ? (
                <SignFlowEmbeddedSigner
                  key={`${embedKey}-${activeSession.documentId ?? activeSession.signUrl}`}
                  signUrl={activeSession.signUrl}
                  documentId={
                    activeSession.documentId ??
                    activeSession.signatureRequestId ??
                    ""
                  }
                  embedApiKey={activeSession.embedApiKey ?? undefined}
                  appBaseUrl={activeSession.appBaseUrl ?? undefined}
                  useInlineContainer
                  onFinish={handleFinish}
                  onCancel={handleClose}
                  onError={(msg) => {
                    setError(msg)
                    clearEmbed()
                    setPhase("error")
                    toast.error("Signing error", msg)
                  }}
                />
              ) : (
                <DropboxSignEmbeddedSigner
                  key={`${embedKey}-${activeSession.signUrl}`}
                  signUrl={activeSession.signUrl}
                  clientId={activeSession.clientId}
                  testMode={activeSession.testMode}
                  useInlineContainer
                  onFinish={handleFinish}
                  onCancel={handleClose}
                  onError={(msg) => {
                    setError(msg)
                    clearEmbed()
                    setPhase("error")
                    toast.error("Signing error", msg)
                  }}
                />
              )}
            </div>
          ) : null}
        </div>

        <div className="deal_esign_modal_foot deal_esign_modal_foot--compact">
          <button type="button" className="um_btn_secondary" onClick={handleClose}>
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
