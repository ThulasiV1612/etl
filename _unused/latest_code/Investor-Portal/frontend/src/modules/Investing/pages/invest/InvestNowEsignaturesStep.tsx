import { Download, Eye, FileSignature, Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { DealEsignTemplateFileRecord } from "@/modules/Syndication/Deals/api/dealsApi"
import {
  fetchDealEsignTemplateViewUrl,
  fetchDealMyEsignDocuments,
  isDealEsignTemplateReady,
  postDealMyEsignMarkViewed,
  type DealMyEsignScopeQuery,
} from "@/modules/Syndication/Deals/api/dealsApi"
import { esignCategoryLabel } from "@/modules/Syndication/Deals/utils/esignTemplateCategories"
import { esignTemplateDisplayName } from "@/modules/Syndication/Deals/utils/esignTemplateDisplay"
import { resolveEsignDocumentUrlForViewer } from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import {
  InvestmentEsignSignModal,
  type InvestmentEsignSignedResult,
} from "@/modules/Investing/pages/investments/InvestmentEsignSignModal"
import type { InvestmentSignStatusPayload } from "@/modules/Investing/api/investmentSignatureApi"
import { InvestNowStepLayout } from "./InvestNowStepLayout"

export type InvestNowEsignDocRow = {
  id: string
  name: string
  url: string
  status: "pending" | "signed"
  canSign: boolean
  signatureRequestId?: string
}

export interface InvestNowEsignaturesStepProps {
  dealId: string
  /** Pins eSign send/sign/sync to the selected saved profile commitment. */
  esignScope?: DealMyEsignScopeQuery
  esignCategoryId: string
  profileTemplate: DealEsignTemplateFileRecord | undefined
  profileLabel: string
  /** Commitment profile id — scopes unified template field visibility. */
  commitmentProfileId?: string
  /** When false, this profile's e-sign template does not include a questionnaire. */
  questionnaireInFlow?: boolean
  investorDisplayName: string
  sendError: string | null
  /** True after invest-now eSign send succeeded (documents prepared in Dropbox Sign). */
  esignSendOk: boolean
  esignLoading: boolean
  esignDocuments: InvestNowEsignDocRow[]
  esignPending: boolean
  esignCompleted: boolean
  /** Sequential workflow: true when this investor may open the sign session. */
  sequentialSignTurnOpen?: boolean
  /** Sequential workflow: documents sent but prior signers have not finished. */
  awaitingSequentialSignTurn?: boolean
  /** Sent | Viewed | Signed | Completed — legacy bundle label (fallback). */
  esignWorkflowLabel?: string | null
  /** Webhook-backed status from `investment_signatures` (source of truth for step 5). */
  webhookSignStatus?: InvestmentSignStatusPayload | null
  signStatusLoading?: boolean
  /** From invest-now eSign send when document rows lack a request id. */
  fallbackSignatureRequestId?: string | null
  onRefreshDocuments: () => void | Promise<void>
  /** After Dropbox Sign finish — refresh docs and complete Invest Now flow. */
  onSignedComplete?: (
    result: InvestmentEsignSignedResult,
  ) => void | Promise<void>
  disabled: boolean
  error?: string
}

function safeDownloadFilename(name: string): string {
  const base = name.trim() || "document"
  return base.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200)
}

export function InvestNowEsignaturesStep({
  dealId,
  esignScope,
  esignCategoryId,
  profileTemplate,
  profileLabel,
  commitmentProfileId,
  investorDisplayName,
  sendError,
  esignSendOk,
  esignLoading,
  esignDocuments,
  esignPending,
  esignCompleted,
  sequentialSignTurnOpen = true,
  awaitingSequentialSignTurn = false,
  esignWorkflowLabel,
  webhookSignStatus,
  fallbackSignatureRequestId,
  onRefreshDocuments,
  onSignedComplete,
  disabled,
  error,
}: InvestNowEsignaturesStepProps) {
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signModalSignatureRequestId, setSignModalSignatureRequestId] = useState<
    string | null
  >(null)
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(
    null,
  )
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false)

  const templateName = useMemo(
    () =>
      profileTemplate
        ? esignTemplateDisplayName(profileTemplate)
        : "Subscription document",
    [profileTemplate],
  )

  const categoryLabel = useMemo(() => {
    const templateCategory = profileTemplate?.categoryId?.trim()
    if (templateCategory) return esignCategoryLabel(templateCategory)
    return esignCategoryLabel(esignCategoryId)
  }, [profileTemplate, esignCategoryId])

  const profileReady = isDealEsignTemplateReady(profileTemplate)

  const firstPendingSignatureRequestId = useMemo(() => {
    const pending = esignDocuments.find(
      (d) => d.status !== "signed" && d.signatureRequestId?.trim(),
    )
    return (
      pending?.signatureRequestId?.trim() ||
      fallbackSignatureRequestId?.trim() ||
      null
    )
  }, [esignDocuments, fallbackSignatureRequestId])

  const hasUnsignedDocuments = useMemo(
    () => esignDocuments.some((d) => d.status !== "signed"),
    [esignDocuments],
  )

  const needsSignature = !esignLoading && !esignCompleted && Boolean(profileTemplate)

  const hasOutboundSignatureRequest = Boolean(firstPendingSignatureRequestId)

  /** True when Dropbox already has a pending request (this session or sponsor / prior send). */
  const esignAwaitingSignature =
    hasOutboundSignatureRequest &&
    hasUnsignedDocuments &&
    !esignCompleted &&
    !sendError

  const canStartSigning =
    needsSignature &&
    esignAwaitingSignature &&
    sequentialSignTurnOpen &&
    (esignSendOk || esignDocuments.length > 0 || esignPending) &&
    (profileReady || esignDocuments.length > 0 || esignPending)

  const openSignModal = useCallback((signatureRequestId?: string | null) => {
    setSignModalSignatureRequestId(
      signatureRequestId?.trim() || firstPendingSignatureRequestId || null,
    )
    setSignModalOpen(true)
  }, [firstPendingSignatureRequestId])

  useEffect(() => {
    const fileId = profileTemplate?.id?.trim()
    if (!fileId || !dealId.trim()) {
      setTemplatePreviewUrl(null)
      return
    }
    let cancelled = false
    setTemplatePreviewLoading(true)
      void fetchDealEsignTemplateViewUrl(dealId, fileId, {
        profileId: commitmentProfileId?.trim(),
      }).then((res) => {
      if (cancelled) return
      setTemplatePreviewLoading(false)
      setTemplatePreviewUrl(res.ok ? res.viewUrl : null)
    })
    return () => {
      cancelled = true
    }
  }, [dealId, profileTemplate?.id, commitmentProfileId])

  const displayDocuments =
    esignDocuments.length > 0
      ? esignDocuments
      : profileTemplate &&
          needsSignature &&
          esignSendOk &&
          !sendError &&
          firstPendingSignatureRequestId
        ? [
            {
              id: `template-${profileTemplate.id}`,
              name: templateName,
              url: templatePreviewUrl ?? "",
              status: "pending" as const,
              canSign: canStartSigning,
              signatureRequestId: firstPendingSignatureRequestId,
            },
          ]
        : []

  function docCanSign(doc: InvestNowEsignDocRow): boolean {
    if (doc.status === "signed" || esignCompleted || disabled) return false
    const sigId =
      doc.signatureRequestId?.trim() || firstPendingSignatureRequestId
    if (!sigId) return false
    return doc.status === "pending" || canStartSigning
  }

  return (
    <InvestNowStepLayout
      titleId="invest-now-step-esignatures-title"
      title="E-signatures"
      hint="Review and sign the subscription document your lead sponsor configured on this deal’s eSign Templates tab. Your profile was already selected in step 1."
      error={error}
    >
      {sendError && !esignLoading ? (
        <div className="invest_now_esign_send_error" role="alert">
          <p className="invest_now_esign_send_error_text">{sendError}</p>
          <button
            type="button"
            className="um_btn_secondary"
            disabled={disabled}
            onClick={() => onRefreshDocuments()}
          >
            <RefreshCw size={16} strokeWidth={2} aria-hidden />
            Retry preparing documents
          </button>
        </div>
      ) : null}

      {esignLoading ? (
        <p className="invest_now_esign_status" role="status">
          <Loader2
            className="deals_create_loading_icon"
            size={18}
            aria-hidden
          />
          Preparing your documents…
        </p>
      ) : null}

      {!esignLoading && awaitingSequentialSignTurn && !esignCompleted ? (
        <p className="invest_now_esign_status" role="status">
          Your documents will be ready to sign soon. We will email you and show
          an alert when it is your turn.
        </p>
      ) : null}

      {/* 
      {!esignLoading && webhookSignStatus ? (
        <div className="invest_now_esign_webhook_status" role="status">
          <p className="invest_now_esign_status">
            Signing progress (updated automatically):
          </p>
          <InvestNowSignStatusBadges
            status={webhookSignStatus.status}
            loading={signStatusLoading}
          />
          {webhookSignStatus.status !== "Completed" ? (
            <p className="invest_now_field_hint">
              Complete signing below. Status updates when Dropbox Sign confirms
              each step.
            </p>
          ) : (
            <p className="invest_now_field_hint">
              All signatures received. You can finish Invest Now.
            </p>
          )}
        </div>
      ) : null} */}

      {!esignLoading && !webhookSignStatus && esignWorkflowLabel ? (
        <p className="invest_now_esign_status" role="status">
          Document status:{" "}
          <strong>{esignWorkflowLabel}</strong>
          {esignWorkflowLabel.toLowerCase() !== "completed"
            ? " — complete signing below; you will return to Investments automatically."
            : " — returning you to Investments."}
        </p>
      ) : null}

      {!esignLoading && esignCompleted ? (
        <p className="invest_now_esign_status invest_now_esign_status_ok" role="status">
          All required documents are signed. Returning you to Investments…
        </p>
      ) : null}

      {!esignLoading && canStartSigning ? (
        <div className="invest_now_esign_sign_cta">
          <p className="invest_now_esign_sign_cta_text">
            Your subscription document is ready. Open the signing form to complete
            your signature.
          </p>
        </div>
      ) : null}

      {!profileTemplate && !esignLoading ? (
        <p className="deals_create_hint invest_now_step_desc_warn">
          No eSign template is configured for this deal yet. Contact your sponsor to
          complete setup on the eSign Templates tab
          {profileLabel && profileLabel !== "—"
            ? ` (fields for ${profileLabel} are placed on the shared template).`
            : "."}
        </p>
      ) : null}

      {profileTemplate &&
      !profileReady &&
      !esignPending &&
      !esignCompleted &&
      !sendError ? (
        <p className="deals_create_hint invest_now_step_desc_warn">
          The subscription document for this deal is not ready for signing yet. Your
          sponsor must finish eSign setup on the eSign Templates tab.
        </p>
      ) : null}

      {displayDocuments.length > 0 ? (
        <ul className="invest_now_esign_doc_list">
          {displayDocuments.map((doc) => {
            const url = doc.url?.trim() || ""
            const showSign = docCanSign(doc)
            const viewUrl =
              url && (doc.status === "signed" || !esignCompleted) ? url : ""
            return (
              <li key={doc.id} className="invest_now_esign_doc_row">
                <div className="invest_now_esign_doc_main">
                  <FileSignature
                    className="invest_now_esign_doc_icon"
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <div className="invest_now_esign_doc_text">
                    <div className="invest_now_esign_doc_name">{doc.name}</div>
                    <div className="invest_now_esign_doc_meta">
                      <span className="invest_now_esign_doc_meta_category">
                        {categoryLabel}
                      </span>
                      <span
                        className={
                          doc.status === "signed"
                            ? "invest_now_esign_doc_status invest_now_esign_doc_status--signed"
                            : templatePreviewLoading && !url
                              ? "invest_now_esign_doc_status invest_now_esign_doc_status--loading"
                              : "invest_now_esign_doc_status invest_now_esign_doc_status--pending"
                        }
                      >
                        {doc.status === "signed"
                          ? "Signed"
                          : templatePreviewLoading && !url
                            ? "Loading preview…"
                            : "Awaiting signature"}
                      </span>
                    </div>
                  </div>
                </div>
                {viewUrl || showSign ? (
                  <div
                    className="invest_now_esign_doc_actions"
                    role="group"
                    aria-label={`${doc.name} actions`}
                  >
                    {showSign ? (
                      <button
                        type="button"
                        className="um_btn_secondary invest_now_esign_doc_sign_btn"
                        disabled={disabled}
                        aria-label={`Sign ${doc.name}`}
                        onClick={() =>
                          openSignModal(doc.signatureRequestId ?? null)
                        }
                      >
                        <FileSignature size={16} strokeWidth={2} aria-hidden />
                        Sign
                      </button>
                    ) : null}
                    {viewUrl ? (
                      <>
                        <a
                          href={viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="invest_now_esign_doc_link"
                          aria-label={`View ${doc.name}`}
                          onClick={() => {
                            const sig =
                              doc.signatureRequestId?.trim() ||
                              firstPendingSignatureRequestId
                            if (sig && dealId.trim()) {
                              void postDealMyEsignMarkViewed(dealId, sig, esignScope)
                            }
                          }}
                        >
                          <Eye size={16} strokeWidth={2} aria-hidden />
                          View
                        </a>
                        <a
                          href={viewUrl}
                          download={safeDownloadFilename(doc.name)}
                          rel="noopener noreferrer"
                          className="invest_now_esign_doc_link"
                          aria-label={`Download ${doc.name}`}
                        >
                          <Download size={16} strokeWidth={2} aria-hidden />
                          Download
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {investorDisplayName ? (
        <p className="invest_now_field_hint">
          Signing as {investorDisplayName}.
        </p>
      ) : null}

      <InvestmentEsignSignModal
        open={signModalOpen}
        dealId={dealId.trim()}
        esignScope={esignScope}
        signatureRequestId={signModalSignatureRequestId}
        onClose={() => {
          setSignModalOpen(false)
          setSignModalSignatureRequestId(null)
        }}
        onSignedComplete={async (result) => {
          await onRefreshDocuments()
          await onSignedComplete?.(result)
        }}
      />
    </InvestNowStepLayout>
  )
}

export function mapMyEsignDocumentsToInvestNowRows(
  documents: Awaited<ReturnType<typeof fetchDealMyEsignDocuments>>["documents"],
): InvestNowEsignDocRow[] {
  return documents.map((d) => ({
    id: d.fileId,
    name: d.name,
    url: resolveEsignDocumentUrlForViewer(d.url) || "",
    status: d.status === "signed" ? "signed" : "pending",
    canSign:
      d.status !== "signed" && Boolean(d.signatureRequestId?.trim()),
    signatureRequestId: d.signatureRequestId?.trim() || undefined,
  }))
}
