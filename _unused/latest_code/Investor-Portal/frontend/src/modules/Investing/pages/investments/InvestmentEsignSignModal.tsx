import { Clock3, FileSignature, Loader2, X } from "lucide-react"
import { useCallback, useEffect, useRef, type MouseEvent } from "react"
import { DropboxSignEmbeddedSigner } from "@/common/components/dropbox-sign-embedded/DropboxSignEmbeddedSigner"
import { SignFlowEmbeddedSigner } from "@/common/components/signflow-embedded"
import { toast } from "@/common/components/Toast"
import "@/modules/Syndication/Deals/deal-esign-ui.css"
import {
  postDealMyEsignMarkViewed,
  postDealMyEsignSync,
} from "@/modules/Syndication/Deals/api/dealsApi"
import { useInvestmentEsignSigning } from "./useInvestmentEsignSigning"
import type { InvestmentEsignSignModalProps } from "./investmentEsignSignModal.types"

export type {
  InvestmentEsignSignedResult,
  InvestmentEsignSignModalProps,
} from "./investmentEsignSignModal.types"

export function InvestmentEsignSignModal({
  open,
  dealId,
  signatureRequestId,
  esignScope,
  onClose,
  onSignedComplete,
}: InvestmentEsignSignModalProps) {
  const dealIdTrimmed = dealId.trim()
  const sigRequestId = signatureRequestId?.trim() || undefined
  const {
    phase,
    error,
    waitingFor,
    activeSession,
    embedKey,
    loadSession,
    reset,
    clearEmbed,
    setError,
  } = useInvestmentEsignSigning(dealIdTrimmed, sigRequestId, esignScope)

  const signedHandledRef = useRef(false)

  const handleClose = useCallback(() => {
    signedHandledRef.current = false
    reset()
    onClose()
  }, [onClose, reset])

  const handleSignProgress = useCallback(() => {
    const sigId =
      activeSession?.signatureRequestId?.trim() || sigRequestId || ""
    if (!sigId) return
    void postDealMyEsignSync(dealIdTrimmed, sigId, {
      phase: "sign",
      ...esignScope,
    })
  }, [activeSession?.signatureRequestId, dealIdTrimmed, esignScope, sigRequestId])

  const handleFinish = useCallback(() => {
    if (signedHandledRef.current) return
    signedHandledRef.current = true
    void (async () => {
      const sigId =
        activeSession?.signatureRequestId?.trim() ||
        sigRequestId ||
        undefined
      const syncRes = await postDealMyEsignSync(dealIdTrimmed, sigId, {
        phase: "finish",
        ...esignScope,
      })
      const workflowCompleted =
        syncRes.ok &&
        (syncRes.esignCompleted ||
          syncRes.workflowLabel?.toLowerCase() === "completed")
      if (!syncRes.ok) {
        toast.error(
          "Signed, sync pending",
          syncRes.message ||
            "Your signature was recorded. Refresh this step if status does not update.",
        )
      } else {
        toast.success(
          workflowCompleted ? "Documents completed" : "Signature received",
          workflowCompleted
            ? "Your subscription documents are fully signed."
            : "Your signature was saved. Returning you to Investments…",
        )
      }
      try {
        await onSignedComplete?.({
          esignCompleted: syncRes.ok,
          esignPending: syncRes.ok ? syncRes.esignPending : undefined,
        })
      } finally {
        reset()
        onClose()
      }
    })()
  }, [
    activeSession?.signatureRequestId,
    dealIdTrimmed,
    esignScope,
    onClose,
    onSignedComplete,
    reset,
    sigRequestId,
  ])

  const handleOpened = useCallback(() => {
    const sigId =
      activeSession?.signatureRequestId?.trim() || sigRequestId || ""
    if (!sigId) return
    void postDealMyEsignMarkViewed(dealIdTrimmed, sigId)
  }, [activeSession?.signatureRequestId, dealIdTrimmed, sigRequestId])

  useEffect(() => {
    if (!open || !dealIdTrimmed) {
      signedHandledRef.current = false
      reset()
      return
    }

    signedHandledRef.current = false
    void loadSession()

    return () => {
      reset()
    }
  }, [open, dealIdTrimmed, sigRequestId, loadSession, reset])

  if (!open || !dealIdTrimmed) return null

  const showEmbed = phase === "embed" && activeSession && embedKey > 0
  const isLoading = phase === "loading"

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
        aria-labelledby="investment-esign-sign-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head">
          <h2
            id="investment-esign-sign-title"
            className="um_modal_title um_title_with_icon"
          >
            <FileSignature size={20} aria-hidden />
            <span>Sign documents</span>
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
          <div className="deal_esign_modal_sign_stage">
            {isLoading && !showEmbed ? (
              <p className="deal_esign_status_row deal_esign_sign_loading" role="status">
                <Loader2
                  className="deal_esign_spin"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                Preparing your signing session…
              </p>
            ) : null}

            {error && phase === "error" ? (
              waitingFor === "prior_investor" ? (
                <div
                  className="deal_esign_sign_gate_notice"
                  role="status"
                  aria-live="polite"
                >
                  <span className="deal_esign_sign_gate_icon" aria-hidden>
                    <Clock3 size={18} strokeWidth={2} />
                  </span>
                  <div className="deal_esign_sign_gate_copy">
                    <p className="deal_esign_sign_gate_title">
                      Not ready to sign yet
                    </p>
                    <p className="deal_esign_sign_gate_message">
                      Your documents are not ready for signature yet.
                    </p>
                    <p className="deal_esign_sign_gate_hint">
                      You can close this window. We will email you and show an
                      alert here when your documents are ready to sign.
                    </p>
                  </div>
                </div>
              ) : waitingFor ? (
                <div
                  className="deal_esign_sign_gate_notice"
                  role="status"
                  aria-live="polite"
                >
                  <span className="deal_esign_sign_gate_icon" aria-hidden>
                    <Clock3 size={18} strokeWidth={2} />
                  </span>
                  <div className="deal_esign_sign_gate_copy">
                    <p className="deal_esign_sign_gate_title">
                      {waitingFor === "sponsor"
                        ? "Waiting for sponsor signature"
                        : "Waiting for investor signature"}
                    </p>
                    <p className="deal_esign_sign_gate_message">{error}</p>
                    <p className="deal_esign_sign_gate_hint">
                      Signing will unlock automatically once the prior party
                      completes their signature. You can close this window and
                      return later.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="deal_esign_notice deal_esign_notice--error" role="alert">
                  {error}
                </p>
              )
            ) : null}

            {phase === "completed" ? (
              <p className="deal_esign_notice" role="status">
                You have already completed signing for this deal.
              </p>
            ) : null}

            {phase === "error" ? (
              <div className="deal_esign_sign_actions">
                <button
                  type="button"
                  className={waitingFor ? "um_btn_secondary" : "um_btn_primary"}
                  onClick={() => void loadSession()}
                >
                  {waitingFor ? "Check again" : "Try again"}
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
                    embedApiKey={activeSession.embedApiKey}
                    appBaseUrl={activeSession.appBaseUrl}
                    useInlineContainer
                    onOpened={handleOpened}
                    onSign={handleSignProgress}
                    onFinish={handleFinish}
                    onCancel={handleClose}
                    onError={(msg) => {
                      setError(msg)
                      clearEmbed()
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
                    onOpened={handleOpened}
                    onSign={handleSignProgress}
                    onFinish={handleFinish}
                    onCancel={handleClose}
                    onError={(msg) => {
                      setError(msg)
                      clearEmbed()
                      toast.error("Signing error", msg)
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
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

export default InvestmentEsignSignModal
