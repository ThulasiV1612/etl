import { FileSignature, ListChecks, Loader2, Send, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchDealEsignTemplates,
  type DealEsignTemplateFileRecord,
} from "../../api/dealsApi"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  esignCategoriesWithDocuments,
  ESIGN_TEMPLATE_CATEGORIES,
  esignSelectableFilesForInvestor,
  investorProfileLabelForRow,
  resolveInvestorEsignCategoryId,
} from "../../utils/esignTemplateCategories"
import { dealUsesUnifiedEsignTemplate, ESIGN_UNIFIED_CATEGORY, ESIGN_UNIFIED_CATEGORY_ID } from "../../utils/esignUnifiedTemplate"
import { isDealEsignTemplateReady } from "../../utils/dealEsignTemplatesConfigured"
import { esignTemplateDisplayName } from "../../utils/esignTemplateDisplay"
import { investorEsignWasSent } from "../../utils/investorEsignStatus"
import "./send-esign-documents-modal.css"

function rowRecipientLabel(row: DealInvestorRow): string {
  const name = row.displayName?.trim()
  if (name && name !== "—") return name
  const email = row.userEmail?.trim()
  if (email && email !== "—") return email
  return "Investor"
}

function fileSelectable(file: DealEsignTemplateFileRecord): boolean {
  return isDealEsignTemplateReady(file)
}

export interface SendEsignDocumentsModalProps {
  open: boolean
  dealId: string
  row: DealInvestorRow | null
  onClose: () => void
  onConfirm: (row: DealInvestorRow, fileIds: string[]) => void | Promise<void>
}

export function SendEsignDocumentsModal({
  open,
  dealId,
  row,
  onClose,
  onConfirm,
}: SendEsignDocumentsModalProps) {
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filesByCategory, setFilesByCategory] = useState<
    Record<string, DealEsignTemplateFileRecord[]>
  >({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const esignWasSent = row ? investorEsignWasSent(row) : false

  useEffect(() => {
    if (!open || !dealId.trim()) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setSelectedIds(new Set())
    void fetchDealEsignTemplates(dealId.trim()).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setLoadError(result.message)
        setFilesByCategory({})
        return
      }
      setFilesByCategory(result.filesByCategory)
    })
    return () => {
      cancelled = true
    }
  }, [open, dealId])

  const usesUnifiedTemplate = useMemo(
    () => dealUsesUnifiedEsignTemplate(filesByCategory),
    [filesByCategory],
  )

  const investorCategoryId = useMemo(
    () => (row ? resolveInvestorEsignCategoryId(row) : null),
    [row],
  )

  const profileLabel = useMemo(
    () => (row ? investorProfileLabelForRow(row) : "—"),
    [row],
  )

  const investorTemplatePick = useMemo(
    () =>
      row
        ? esignSelectableFilesForInvestor(row, filesByCategory)
        : { categoryId: null, categoryLabel: "—", files: [], profileLabel: "—" },
    [row, filesByCategory],
  )

  const categoriesWithDocs = useMemo(
    () => esignCategoriesWithDocuments(filesByCategory),
    [filesByCategory],
  )

  const sections = useMemo(() => {
    if (usesUnifiedTemplate) {
      const files = filesByCategory[ESIGN_UNIFIED_CATEGORY_ID] ?? []
      if (files.length === 0) return []
      return [
        {
          id: ESIGN_UNIFIED_CATEGORY.id,
          label: ESIGN_UNIFIED_CATEGORY.label,
          files,
          isInvestorProfile: true,
        },
      ]
    }
    const list = ESIGN_TEMPLATE_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: cat.label,
      files: filesByCategory[cat.id] ?? [],
      isInvestorProfile: cat.id === investorCategoryId,
    })).filter((s) => s.files.length > 0)
    list.sort((a, b) => {
      if (a.isInvestorProfile) return -1
      if (b.isInvestorProfile) return 1
      return 0
    })
    return list
  }, [filesByCategory, investorCategoryId, usesUnifiedTemplate])

  const allFiles = useMemo(
    () => sections.flatMap((s) => s.files),
    [sections],
  )

  const selectableFiles = useMemo(
    () => allFiles.filter(fileSelectable),
    [allFiles],
  )

  const defaultSelectedIds = useMemo(() => {
    if (selectableFiles.length === 0) return []
    if (usesUnifiedTemplate) {
      return selectableFiles.map((f) => f.id)
    }
    if (investorTemplatePick.files.length > 0) {
      const match = investorTemplatePick.files.filter(fileSelectable)
      if (match.length > 0) return match.map((f) => f.id)
    }
    if (investorCategoryId) {
      const match = selectableFiles.filter(
        (f) => f.categoryId === investorCategoryId,
      )
      if (match.length > 0) return match.map((f) => f.id)
    }
    return selectableFiles.map((f) => f.id)
  }, [
    selectableFiles,
    investorCategoryId,
    investorTemplatePick.files,
    usesUnifiedTemplate,
  ])

  useEffect(() => {
    if (!open || loading || defaultSelectedIds.length === 0) return
    setSelectedIds(new Set(defaultSelectedIds))
  }, [open, loading, defaultSelectedIds])

  const toggleFile = useCallback((fileId: string, enabled: boolean) => {
    if (!enabled) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }, [])

  const allSelectableSelected =
    selectableFiles.length > 0 &&
    selectableFiles.every((f) => selectedIds.has(f.id))

  const toggleSelectAll = useCallback(() => {
    if (allSelectableSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableFiles.map((f) => f.id)))
    }
  }, [allSelectableSelected, selectableFiles])

  const handleConfirm = useCallback(() => {
    if (!row || selectedIds.size === 0 || sending) return
    void (async () => {
      setSending(true)
      try {
        await onConfirm(row, Array.from(selectedIds))
        onClose()
      } finally {
        setSending(false)
      }
    })()
  }, [row, selectedIds, sending, onConfirm, onClose])

  if (!open || !row) return null

  const recipient = rowRecipientLabel(row)
  const email = row.userEmail?.trim()
  const hasAnyTemplates = categoriesWithDocs.length > 0
  const selectedCount = selectedIds.size

  return (
    <div
      className="um_modal_overlay deal_esign_overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div
        className="um_modal deal_esign_modal deal_esign_modal--send"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-send-esign-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head">
          <h3
            id="deal-send-esign-title"
            className="um_modal_title um_title_with_icon"
          >
            <FileSignature size={22} strokeWidth={2} aria-hidden />
            <span>{esignWasSent ? "Re-send E-sign" : "Send E-sign"}</span>
          </h3>
          <button
            type="button"
            className="um_modal_close"
            aria-label="Close"
            disabled={sending}
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="deal_esign_modal_body">
          <div className="deal_esign_recipient">
            <p className="deal_esign_recipient_name">{recipient}</p>
            {email && email !== "—" ? (
              <p className="deal_esign_recipient_meta">{email}</p>
            ) : null}
            {profileLabel !== "—" ? (
              <p className="deal_esign_recipient_meta">
                Profile: <span className="deal_send_esign_profile">{profileLabel}</span>
              </p>
            ) : null}
          </div>

          {/* <p className="deal_esign_lead">
            Choose documents by investor profile. The card matching this investor is
            highlighted.
          </p> */}

          {loading ? (
            <p className="deal_esign_status_row" role="status">
              <Loader2 className="deal_esign_spin" size={18} aria-hidden />
              Loading templates…
            </p>
          ) : loadError ? (
            <p className="deal_esign_notice deal_esign_notice--error" role="alert">
              {loadError}
            </p>
          ) : !hasAnyTemplates ? (
            <p className="deal_esign_notice deal_esign_notice--empty" role="status">
              No eSign templates are uploaded for this deal yet. Upload a PDF on the
              eSign Templates tab.
            </p>
          ) : selectableFiles.length === 0 ? (
            <p className="deal_esign_notice deal_esign_notice--empty" role="status">
              Uploaded documents need a saved eSign template (status Ready) before they
              can be sent. Complete setup on the eSign Templates tab.
            </p>
          ) : (
            <>
              {selectableFiles.length > 1 ? (
                <div className="deal_esign_picker_toolbar">
                  <label className="deal_esign_select_all">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={toggleSelectAll}
                      disabled={sending}
                    />
                    <span>
                      <ListChecks size={14} strokeWidth={2} aria-hidden />
                      Select all ready
                    </span>
                  </label>
                </div>
              ) : null}

              <div className="deal_esign_profile_cards_grid">
                {sections.map((section) => {
                  const readyCount = section.files.filter(fileSelectable).length
                  const selectedInCard = section.files.filter(
                    (f) => fileSelectable(f) && selectedIds.has(f.id),
                  ).length
                  return (
                    <article
                      key={section.id}
                      className={`deal_esign_profile_card${section.isInvestorProfile ? " deal_esign_profile_card--match" : ""}`}
                      aria-labelledby={`deal-send-esign-cat-${section.id}`}
                    >
                      <header className="deal_esign_profile_card_head">
                        <h4
                          id={`deal-send-esign-cat-${section.id}`}
                          className="deal_esign_profile_card_title"
                        >
                          {section.label}
                        </h4>
                        <p className="deal_esign_profile_card_meta">
                          {readyCount} ready
                          {selectedInCard > 0
                            ? ` · ${selectedInCard} selected`
                            : ""}
                        </p>
                        {section.isInvestorProfile ? (
                          <span className="deal_esign_badge">Investor profile</span>
                        ) : null}
                      </header>
                      <div className="deal_esign_profile_card_body">
                        <ul className="deal_esign_file_list">
                          {section.files.map((file) => {
                            const enabled = fileSelectable(file)
                            const checked = enabled && selectedIds.has(file.id)
                            return (
                              <li
                                key={file.id}
                                className={`deal_esign_file_row${enabled ? "" : " deal_esign_file_row--disabled"}`}
                              >
                                <label
                                  className={`deal_esign_file_label${enabled ? "" : " deal_esign_file_label--disabled"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!enabled || sending}
                                    onChange={() => toggleFile(file.id, enabled)}
                                  />
                                  <span
                                    className="deal_esign_file_name"
                                    title={esignTemplateDisplayName(file)}
                                  >
                                    {esignTemplateDisplayName(file)}
                                  </span>
                                  <span
                                    className={`deal_esign_badge${enabled ? " deal_esign_badge--ready" : " deal_esign_badge--draft"}`}
                                  >
                                    {enabled ? "Ready" : "Setup"}
                                  </span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </article>
                  )
                })}
              </div>

              {usesUnifiedTemplate ? (
                <p className="deal_esign_notice" role="note">
                  Unified template — investors only see fields scoped to their profile (
                  {profileLabel}) when signing.
                </p>
              ) : !investorCategoryId ? (
                <p className="deal_esign_notice" role="note">
                  This investor has no profile type set. You can still send any ready
                  document above.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="deal_esign_modal_foot">
          {!loading && !loadError && selectableFiles.length > 0 ? (
            <p className="deal_esign_modal_foot_hint">
              {selectedCount === 0
                ? "Select at least one document to send."
                : `${selectedCount} document${selectedCount === 1 ? "" : "s"} selected`}
            </p>
          ) : null}
          <div className="um_modal_actions add_contact_modal_actions">
            <button
              type="button"
              className="um_btn_secondary"
              disabled={sending}
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Close
            </button>
            <button
              type="button"
              className="um_btn_primary"
              disabled={
                sending ||
                loading ||
                Boolean(loadError) ||
                selectableFiles.length === 0 ||
                selectedIds.size === 0
              }
              onClick={handleConfirm}
            >
              {sending ? (
                <>
                  <Loader2 className="deal_esign_spin" size={16} aria-hidden />
                  {esignWasSent ? "Re-sending…" : "Sending…"}
                </>
              ) : (
                <>
                  <Send size={16} strokeWidth={2} aria-hidden />
                  {esignWasSent ? "Re-send E-sign" : "Send E-sign"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
