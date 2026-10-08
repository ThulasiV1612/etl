import { Download, Eye, FileSignature, FileText, Loader2, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"
import { fetchDealMemberEsignStatus } from "../../api/dealsApi"
import type {
  DealInvestorEsignSendStatus,
  DealInvestorEsignStatus,
  DealInvestorRow,
} from "../../types/deal-investors.types"
import {
  buildEsignProfileStatusTabs,
  resolveInvestorEsignCategoryId,
  ESIGN_UNIFIED_CATEGORY_ID,
  type EsignProfileStatusTab,
} from "../../utils/esignTemplateCategories"
import {
  esignSignedPdfDownloadFilename,
  esignStatusForProfileTab,
  esignWorkflowSteps,
  findEsignSendForCategory,
  fallbackEsignStatusForRow,
  isProfileTabEsignCompleted,
  mergeEsignStatusWithDropbox,
  parseEsignSendsFromApi,
  parseEsignStatusFromApi,
  resolveEsignPendingDocumentViewUrl,
  resolveEsignSignedPdfUrlForDocument,
  type DealEsignDropboxDetail,
  type EsignWorkflowStep,
} from "../../utils/investorEsignStatus"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./investor-esign-status-modal.css"

function rowRecipientLabel(row: DealInvestorRow): string {
  const name = row.displayName?.trim()
  if (name && name !== "—") return name
  const email = row.userEmail?.trim()
  if (email && email !== "—") return email
  return "Investor"
}

export interface InvestorEsignStatusModalProps {
  open: boolean
  dealId: string
  row: DealInvestorRow | null
  onClose: () => void
}

function EsignHorizontalProgress({ steps }: { steps: EsignWorkflowStep[] }) {
  return (
    <ol className="deal_esign_progress_h" aria-label="Signing progress">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`deal_esign_progress_h_step${
            step.done ? " deal_esign_progress_h_step_done" : ""
          }${step.done ? "" : " deal_esign_progress_h_step_pending"}`}
        >
          <span className="deal_esign_progress_h_dot" aria-hidden />
          <p className="deal_esign_progress_h_label">{step.label}</p>
          <p className="deal_esign_progress_h_time">{step.atDisplay}</p>
        </li>
      ))}
    </ol>
  )
}

function ProfileTabPanel({
  tab,
  steps,
  dropbox,
  status,
  completed,
  downloadName,
}: {
  tab: EsignProfileStatusTab
  steps: EsignWorkflowStep[]
  dropbox: DealEsignDropboxDetail | null
  status: DealInvestorEsignStatus
  completed: boolean
  downloadName: string
}) {
  return (
    <div
      role="tabpanel"
      id={`deal-esign-profile-panel-${tab.categoryId}`}
      aria-labelledby={`deal-esign-profile-tab-${tab.categoryId}`}
      className="deal_esign_status_panel"
    >
      <div className="deal_esign_panel deal_esign_panel--muted">
        <p className="deal_esign_panel_title">Signing progress — {tab.label}</p>
        <EsignHorizontalProgress steps={steps} />
        {/* {primarySigner ? (
          <p className="deal_esign_dropbox_inline">
            Dropbox Sign:{" "}
            {formatDropboxSignerStatusCode(primarySigner.statusCode)}
            {primarySigner.lastViewedAt
              ? ` · viewed ${formatEsignStepTimestamp(primarySigner.lastViewedAt)}`
              : ""}
            {primarySigner.signedAt
              ? ` · signed ${formatEsignStepTimestamp(primarySigner.signedAt)}`
              : ""}
          </p>
        ) : null} */}
        {dropbox?.isDeclined ? (
          <p className="deal_esign_notice deal_esign_notice--error">
            Declined in Dropbox Sign.
          </p>
        ) : null}
      </div>

      <div className="deal_esign_panel">
        <p className="deal_esign_panel_title">{tab.label}</p>
        <ul className="deal_esign_status_doc_list">
          {tab.documents.map((d) => {
            const signedUrl = resolveEsignSignedPdfUrlForDocument(status, d)
            const pendingViewUrl = resolveEsignPendingDocumentViewUrl(d)
            const viewUrl = signedUrl ?? pendingViewUrl
            const showView = Boolean(viewUrl)
            const showDownload = completed && Boolean(signedUrl)
            return (
              <li key={d.fileId} className="deal_esign_status_doc_row">
                <div className="deal_esign_status_doc_main">
                  <FileText
                    size={16}
                    className="deal_esign_doc_item_icon"
                    aria-hidden
                  />
                  <span className="deal_esign_status_doc_name">{d.name}</span>
                  {completed ? (
                    <span className="deal_esign_status_doc_badge">Signed</span>
                  ) : (
                    <span className="deal_esign_status_doc_badge deal_esign_status_doc_badge--pending">
                      Pending
                    </span>
                  )}
                </div>
                {showView ? (
                  <div
                    className="deal_esign_actions deal_esign_status_doc_actions"
                    role="group"
                    aria-label={`${d.name} document`}
                  >
                    <a
                      href={viewUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="deal_esign_btn_link"
                    >
                      <Eye size={15} strokeWidth={2} aria-hidden />
                      View
                    </a>
                    {showDownload ? (
                      <a
                        href={signedUrl!}
                        download={downloadName}
                        rel="noopener noreferrer"
                        className="deal_esign_btn_link deal_esign_btn_link--primary"
                      >
                        <Download size={15} strokeWidth={2} aria-hidden />
                        Download
                      </a>
                    ) : null}
                  </div>
                ) : !completed ? (
                  <p className="deal_esign_sync_hint">
                    Document preview will appear after the investor completes
                    Invest Now questionnaire and W-9 steps.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
        {completed && !tab.documents.some((d) =>
          resolveEsignSignedPdfUrlForDocument(status, d),
        ) ? (
          <p className="deal_esign_notice" role="status">
            Signing is complete. The signed PDF is still being saved—use Refresh
            in a moment.
          </p>
        ) : null}
        {/* {!completed ? (
          <p className="deal_esign_sync_hint">
            The investor has not finished signing documents in this profile yet.
          </p>
        ) : null} */}
      </div>
    </div>
  )
}

export function InvestorEsignStatusModal({
  open,
  dealId,
  row,
  onClose,
}: InvestorEsignStatusModalProps) {
  const rowId = row?.id?.trim() ?? ""
  const dealIdTrimmed = dealId.trim()

  const [initialLoading, setInitialLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<DealInvestorEsignStatus | null>(null)
  const [sends, setSends] = useState<DealInvestorEsignSendStatus[]>([])
  const [dropbox, setDropbox] = useState<DealEsignDropboxDetail | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const rowRef = useRef(row)
  rowRef.current = row

  const applyFetchResult = useCallback(
    (
      result: Awaited<ReturnType<typeof fetchDealMemberEsignStatus>>,
      fallbackRow: DealInvestorRow,
    ) => {
      if (!result.ok) {
        setError(result.message)
        const fallback = fallbackEsignStatusForRow(fallbackRow)
        setStatus(fallback)
        setSends(
          parseEsignSendsFromApi(null, fallbackRow.esignStatusBundleJson),
        )
        setDropbox(null)
        return
      }
      setError(null)
      setStatus(result.status)
      setSends(result.sends)
      setDropbox(result.dropbox)
    },
    [],
  )

  const fetchStatus = useCallback(async () => {
    const currentRow = rowRef.current
    if (!rowId || !dealIdTrimmed || !currentRow) return
    setInitialLoading(true)

    const result = await fetchDealMemberEsignStatus(dealIdTrimmed, rowId)

    setInitialLoading(false)
    applyFetchResult(result, currentRow)
  }, [applyFetchResult, dealIdTrimmed, rowId])

  useEffect(() => {
    if (!open || !rowId) {
      setStatus(null)
      setSends([])
      setDropbox(null)
      setError(null)
      setActiveTabId(null)
      setInitialLoading(false)
      return
    }
    void fetchStatus()
  }, [open, rowId, dealIdTrimmed, fetchStatus])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  const resolvedSends = useMemo(() => {
    if (sends.length > 0) return sends
    if (!row) return []
    return parseEsignSendsFromApi(null, row.esignStatusBundleJson)
  }, [sends, row])

  const investorCategoryId = useMemo(
    () => (row ? resolveInvestorEsignCategoryId(row) : null),
    [row],
  )

  const usesUnifiedTemplate = useMemo(() => {
    if (resolvedSends.some((s) => s.categoryId.trim() === ESIGN_UNIFIED_CATEGORY_ID)) {
      return true
    }
    const fallback =
      status ??
      (row ? fallbackEsignStatusForRow(row) : null) ??
      (row ? parseEsignStatusFromApi(row.esignStatus) : null)
    return (
      fallback?.documents?.some(
        (d) => d.categoryId?.trim() === ESIGN_UNIFIED_CATEGORY_ID,
      ) ?? false
    )
  }, [resolvedSends, status, row])

  const profileTabs = useMemo(() => {
    const documents = resolvedSends.flatMap((send) =>
      send.documents.map((d) => ({
        ...d,
        categoryId: d.categoryId?.trim() || send.categoryId,
      })),
    )
    if (documents.length === 0) {
      const fallback =
        status ??
        (row ? fallbackEsignStatusForRow(row) : null) ??
        (row ? parseEsignStatusFromApi(row.esignStatus) : null)
      if (!fallback?.documents?.length) return []
      return buildEsignProfileStatusTabs(
        fallback.documents,
        investorCategoryId,
        { usesUnifiedTemplate },
      )
    }
    return buildEsignProfileStatusTabs(documents, investorCategoryId, {
      usesUnifiedTemplate,
    })
  }, [resolvedSends, status, row, investorCategoryId, usesUnifiedTemplate])

  useEffect(() => {
    if (profileTabs.length === 0) {
      setActiveTabId(null)
      return
    }
    setActiveTabId((prev) => {
      if (prev && profileTabs.some((t) => t.categoryId === prev)) return prev
      const match = profileTabs.find((t) => t.isInvestorProfile)
      return match?.categoryId ?? profileTabs[0]?.categoryId ?? null
    })
  }, [profileTabs])

  const activeTab = profileTabs.find((t) => t.categoryId === activeTabId) ?? null

  const activeTabSend = useMemo(() => {
    if (!activeTab) return null
    return (
      findEsignSendForCategory(
        resolvedSends,
        activeTab.categoryId,
        investorCategoryId,
      ) ?? null
    )
  }, [activeTab, resolvedSends, investorCategoryId])

  const activeTabStatus = useMemo(() => {
    if (!activeTab || !activeTabSend?.sentAt?.trim()) return null
    const fromSend = esignStatusForProfileTab(
      activeTab,
      resolvedSends,
      investorCategoryId,
    )
    if (!fromSend) return null
    return mergeEsignStatusWithDropbox(fromSend, dropbox, {
      signatureRequestId: activeTabSend.signatureRequestId,
    })
  }, [activeTab, activeTabSend, resolvedSends, dropbox, investorCategoryId])

  const activeTabSteps = useMemo(
    () => (activeTabStatus ? esignWorkflowSteps(activeTabStatus) : []),
    [activeTabStatus],
  )

  const activeTabCompleted = useMemo(
    () => isProfileTabEsignCompleted(activeTabSend),
    [activeTabSend],
  )

  if (!open || !row) return null

  const hasEsignData =
    profileTabs.length > 0 || resolvedSends.length > 0 || Boolean(status?.sentAt)

  const downloadName = esignSignedPdfDownloadFilename(row)
  const recipient = rowRecipientLabel(row)
  const email = row.userEmail?.trim()

  const handleBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const modalTree = (
    <div
      className="um_modal_overlay deal_esign_overlay deal_esign_status_overlay"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="um_modal deal_esign_modal deal_esign_modal--status"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-inv-esign-status-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head">
          <h2
            id="deal-inv-esign-status-title"
            className="um_modal_title um_title_with_icon"
          >
            <FileSignature size={20} aria-hidden />
            <span>eSign status</span>
          </h2>
          <button
            type="button"
            className="um_modal_close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div
          className={`deal_esign_modal_body deal_esign_status_body${
            initialLoading ? " deal_esign_status_body--loading" : ""
          }`}
        >
          <div className="deal_esign_recipient">
            <p className="deal_esign_recipient_name">{recipient}</p>
            {email && email !== "—" ? (
              <p className="deal_esign_recipient_meta">{email}</p>
            ) : null}
          </div>

          {/* <div className="deal_esign_status_toolbar">
            <p className="deal_esign_sync_hint" aria-live="polite">
              {syncing || initialLoading ? (
                <span className="deal_esign_status_row">
                  <Loader2 className="deal_esign_spin" size={14} aria-hidden />
                  Syncing from Dropbox Sign…
                </span>
              ) : (
                syncLabel
              )}
            </p>
            <button
              type="button"
              className="um_btn_secondary deal_esign_status_refresh_btn"
              disabled={syncing || initialLoading}
              onClick={handleRefresh}
            >
              <RefreshCw
                size={14}
                aria-hidden
                className={syncing ? "deal_esign_spin" : undefined}
              />
              Refresh
            </button>
          </div> */}

          {error ? (
            <p className="deal_esign_notice deal_esign_notice--error" role="alert">
              {error}
              {dropbox ? null : " Showing last known status."}
            </p>
          ) : null}

          {initialLoading && !hasEsignData ? (
            <p className="deal_esign_status_row" role="status">
              <Loader2 className="deal_esign_spin" size={18} aria-hidden />
              Loading eSign status…
            </p>
          ) : null}

          {!initialLoading && !hasEsignData && !error ? (
            <p className="deal_esign_notice" role="status">
              No eSign request found for this investor. Send eSign from the
              Actions menu first.
            </p>
          ) : null}

          {hasEsignData && profileTabs.length > 0 ? (
            <>
              <div
                className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer deal_esign_status_tabs_outer"
                role="presentation"
              >
                <div
                  className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row deal_esign_status_tabs_row"
                  role="tablist"
                  aria-label="Investor profile types"
                >
                  {profileTabs.map((tab) => {
                    const selected = tab.categoryId === activeTabId
                    return (
                      <button
                        key={tab.categoryId}
                        type="button"
                        role="tab"
                        id={`deal-esign-profile-tab-${tab.categoryId}`}
                        className={`um_members_tab deals_tabs_tab um_segmented_tab${
                          selected ? " um_members_tab_active" : ""
                        }`}
                        aria-selected={selected}
                        aria-controls={`deal-esign-profile-panel-${tab.categoryId}`}
                        onClick={() => setActiveTabId(tab.categoryId)}
                      >
                        <span className="deals_tabs_label um_segmented_tab_label">
                          {tab.label}
                        </span>
                        {/* {tab.isInvestorProfile ? (
                          <span className="deal_esign_status_inv_badge">Investor</span>
                        ) : null} */}
                      </button>
                    )
                  })}
                </div>
              </div>

              {activeTab && activeTabStatus ? (
                <ProfileTabPanel
                  tab={activeTab}
                  steps={activeTabSteps}
                  dropbox={dropbox}
                  status={activeTabStatus}
                  completed={activeTabCompleted}
                  downloadName={downloadName}
                />
              ) : null}
            </>
          ) : profileTabs.length === 0 ? (
            <div className="deal_esign_panel deal_esign_panel--muted">
              <p className="deal_esign_notice">
                No documents were recorded for this eSign send.
              </p>
            </div>
          ) : null}
        </div>

        <div className="deal_esign_modal_foot">
          <button type="button" className="um_btn_secondary" onClick={onClose}>
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== "undefined"
    ? createPortal(modalTree, document.body)
    : modalTree
}
