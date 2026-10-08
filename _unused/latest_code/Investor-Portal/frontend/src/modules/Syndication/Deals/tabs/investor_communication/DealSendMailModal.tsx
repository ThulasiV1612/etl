import {
  Eye,
  Info,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getSessionUserEmail } from "../../../../../common/auth/sessionUserEmail"
import { getSessionUserId } from "../../../../../common/auth/sessionUserId"
import {
  getCurrentSessionUserEmail,
  parseEmailInput,
} from "../../../../../common/features/send-mail"
import { toast } from "../../../../../common/components/Toast"
import {
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealMembers,
} from "../../api/dealsApi"
import {
  parseViewerDealMemberRoleFromApi,
  scopeDealInvestorRowsForViewer,
} from "../../utils/dealDetailTabVisibility"
import {
  loadEmailTemplates,
  type EmailTemplateRow,
} from "../../../contacts/emailTemplatesStorage"
import {
  SendMailEmailPreviewModal,
  type SendMailEmailPreviewPayload,
} from "../../../contacts/components/SendMailEmailPreviewModal"
import { DealMailRecipientPicker } from "./DealMailRecipientPicker"
import {
  appendAdminAndCoSponsorMembersAsRecipients,
  buildDealMailRecipients,
  defaultDealMailRecipientIds,
  deliveryEmailsForRecipients,
  filterDealMailRecipientsForCoSponsorViewer,
  mergeDealInvestorRowsForMail,
  type DealMailRecipient,
} from "./dealMailRecipients"
import { postDealInvestorCommunicationMail } from "./investorCommunicationApi"
import type { InvestorCommunicationMailRow } from "./investor-communication.types"
import "../../../contacts/contacts.css"
import "../../../usermanagement/user_management.css"
import "./investor_communication.css"

export interface DealSendMailModalProps {
  dealId: string
  open: boolean
  onClose: () => void
  onSent?: (mail: InvestorCommunicationMailRow) => void
  /** Pre-select recipients by email when opening (e.g. resend from mail log). */
  initialRecipientEmails?: string[]
  /** Pre-select this template (e.g. co-sponsor releasing a no-intercept mail). */
  initialTemplateId?: string | null
  /** Co-sponsor releasing a held no-intercept email to their own LPs. */
  releaseToOwnInvestors?: boolean
}

export function DealSendMailModal({
  dealId,
  open,
  onClose,
  onSent,
  initialRecipientEmails,
  initialTemplateId,
  releaseToOwnInvestors = false,
}: DealSendMailModalProps) {
  const navigate = useNavigate()
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [recipients, setRecipients] = useState<DealMailRecipient[]>([])
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<
    Set<string>
  >(() => new Set())
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [sendMailCc, setSendMailCc] = useState("")
  const [sendMailEmailPreview, setSendMailEmailPreview] =
    useState<SendMailEmailPreviewPayload | null>(null)
  const [sending, setSending] = useState(false)
  const [viewerIsCosponsor, setViewerIsCosponsor] = useState(false)
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false)

  const senderEmail = useMemo(() => getCurrentSessionUserEmail(), [])

  const selectedRecipients = useMemo(
    () => recipients.filter((r) => selectedRecipientIds.has(r.id)),
    [recipients, selectedRecipientIds],
  )

  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [emailTemplates, selectedTemplateId],
  )

  const selectedCanDeliver = useMemo(
    () => selectedRecipients.some((r) => r.canDeliver),
    [selectedRecipients],
  )

  const selectedDeliveryEmails = useMemo(
    () => deliveryEmailsForRecipients(selectedRecipients),
    [selectedRecipients],
  )

  const selectedReleaseCount = useMemo(
    () =>
      selectedRecipients.filter((r) => r.requiresCosponsorRelease).length,
    [selectedRecipients],
  )

  const selectedOwnLpCount = useMemo(
    () =>
      selectedRecipients.filter(
        (r) => r.classKind === "lp" && !r.requiresCosponsorRelease,
      ).length,
    [selectedRecipients],
  )

  useEffect(() => {
    if (!open || !dealId.trim()) return
    let cancelled = false
    setLoadingRecipients(true)
    setSelectedRecipientIds(new Set())
    setViewerIsCosponsor(false)
    setReleaseConfirmOpen(false)
    const preselectEmails = new Set(
      (initialRecipientEmails ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    )
    void (async () => {
      const [templates, lpPayload, allPayload, classes, membersPayload] =
        await Promise.all([
          loadEmailTemplates(),
          fetchDealInvestors(dealId.trim(), { lpInvestorsOnly: true }),
          fetchDealInvestors(dealId.trim()),
          fetchDealInvestorClasses(dealId.trim()),
          fetchDealMembers(dealId.trim()),
        ])
      if (cancelled) return
      const viewerRole = parseViewerDealMemberRoleFromApi(
        membersPayload.viewerDealMemberRole,
      )
      const viewerIsCo = viewerRole === "co_sponsor"
      setViewerIsCosponsor(viewerIsCo)
      const investors = scopeDealInvestorRowsForViewer(
        mergeDealInvestorRowsForMail(
          lpPayload.investors,
          allPayload.investors,
        ),
        viewerRole,
        getSessionUserId(),
      )
      const built = buildDealMailRecipients({
        investors,
        classes,
        viewerUserId: getSessionUserId(),
        viewerEmail: getSessionUserEmail(),
      })
      const merged = viewerIsCo
        ? filterDealMailRecipientsForCoSponsorViewer(built, {
            viewerUserId: getSessionUserId(),
            viewerEmail: getSessionUserEmail(),
          })
        : appendAdminAndCoSponsorMembersAsRecipients(
            built,
            membersPayload.members ?? [],
          )
      setRecipients(merged)
      setSelectedRecipientIds(
        defaultDealMailRecipientIds(merged, {
          viewerIsCosponsor: viewerIsCo,
          viewerUserId: getSessionUserId(),
          viewerEmail: getSessionUserEmail(),
          preselectEmails: releaseToOwnInvestors ? [] : [...preselectEmails],
        }),
      )
      const active = templates.filter((t) => !t.archived)
      setEmailTemplates(active)
      const preferredTemplateId = String(initialTemplateId ?? "").trim()
      setSelectedTemplateId((prev) => {
        if (preferredTemplateId && active.some((t) => t.id === preferredTemplateId)) {
          return preferredTemplateId
        }
        if (prev && active.some((t) => t.id === prev)) return prev
        return active[0]?.id ?? ""
      })
      setSendMailCc("")
      setSendMailEmailPreview(null)
      setLoadingRecipients(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, dealId, initialRecipientEmails, initialTemplateId, releaseToOwnInvestors])

  const closeModal = useCallback(() => {
    if (sending) return
    setSendMailEmailPreview(null)
    setReleaseConfirmOpen(false)
    onClose()
  }, [onClose, sending])

  const goNewTemplateFromSendMail = useCallback(() => {
    navigate("/contacts/email-templates/new")
  }, [navigate])

  const openSendMailEmailPreview = useCallback(
    (mode: "view" | "edit") => {
      const template = emailTemplates.find((t) => t.id === selectedTemplateId)
      if (!template) {
        toast.error("Template required", "Choose an email template first.")
        return
      }
      if (!selectedCanDeliver) {
        toast.error(
          "No email recipients",
          "Select investors with a valid email, or a co-sponsor who can receive this message.",
        )
        return
      }
      setSendMailEmailPreview({
        templateId: template.id,
        templateName: template.name,
        templateArchived: Boolean(template.archived),
        createdBy: template.createdBy,
        createdAt: template.createdAt,
        subject: template.subject,
        bodyHtml: template.body,
        toEmails: senderEmail ? [senderEmail] : [],
        ccEmails: parseEmailInput(sendMailCc),
        bccEmails: selectedDeliveryEmails,
        attachment: template.attachment,
        startInEditMode: mode === "edit",
      })
    },
    [emailTemplates, selectedCanDeliver, selectedDeliveryEmails, selectedTemplateId, sendMailCc, senderEmail],
  )

  const handleSendMailPreviewSaved = useCallback(
    (patch: { subject: string; bodyHtml: string }) => {
      setSendMailEmailPreview((p) =>
        p ? { ...p, ...patch, startInEditMode: false } : null,
      )
      void loadEmailTemplates().then((rows) => {
        setEmailTemplates(rows.filter((t) => !t.archived))
      })
    },
    [],
  )

  const handleSend = useCallback(async () => {
    if (!selectedCanDeliver) {
      toast.error(
        "No email recipients",
        "Select investors with a valid email, or a co-sponsor who can receive this message.",
      )
      return
    }
    const template = emailTemplates.find((t) => t.id === selectedTemplateId)
    if (!template) {
      toast.error("Template required", "Choose an email template first.")
      return
    }
    const previewSubject = sendMailEmailPreview?.subject?.trim()
    const previewBody = sendMailEmailPreview?.bodyHtml
    const subject = previewSubject || template.subject
    const bodyHtml = previewBody ?? template.body

    setSending(true)
    const result = await postDealInvestorCommunicationMail({
      dealId,
      templateId: template.id,
      subject,
      bodyHtml,
      ccRaw: sendMailCc,
      recipientUsers: selectedRecipients,
      deliveryEmails: selectedDeliveryEmails,
    })
    setSending(false)
    if (!result.ok) {
      toast.error("Could not send email", result.message)
      if (result.mail) onSent?.(result.mail)
      return
    }
    onSent?.(result.mail)
    toast.success("Email sent", "Message was sent and logged for this deal.")
    closeModal()
  }, [
    closeModal,
    dealId,
    emailTemplates,
    onSent,
    selectedCanDeliver,
    selectedDeliveryEmails,
    selectedRecipients,
    selectedTemplateId,
    sendMailCc,
    sendMailEmailPreview,
    senderEmail,
  ])

  const requestSend = useCallback(() => {
    if (viewerIsCosponsor && selectedOwnLpCount > 0) {
      setReleaseConfirmOpen(true)
      return
    }
    void handleSend()
  }, [handleSend, selectedOwnLpCount, viewerIsCosponsor])

  if (!open) return null

  return (
    <>
      <div
        className="um_modal_overlay contacts_suspend_overlay"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}
      >
        <div
          className="um_modal contacts_suspend_modal deal_inv_comm_send_mail_modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deal-inv-comm-send-mail-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="um_modal_head">
            <h3
              id="deal-inv-comm-send-mail-title"
              className="um_modal_title um_title_with_icon"
            >
              <Mail
                className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_info"
                size={22}
                strokeWidth={2}
                aria-hidden
              />
              <span>Send email</span>
            </h3>
            <button
              type="button"
              className="um_modal_close"
              aria-label="Close"
              disabled={sending}
              onClick={closeModal}
            >
              <X size={20} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="deal_inv_comm_send_mail_body">
            <p className="contacts_suspend_modal_desc contacts_suspend_modal_desc_info">
            <Info
              className="contacts_suspend_modal_desc_icon"
              size={15}
              strokeWidth={2}
              aria-hidden
            />
            <span>
              {loadingRecipients
                ? "Loading investors for this deal…"
                : selectedRecipients.length === 0
                  ? viewerIsCosponsor
                    ? "Select your investors to send this email."
                    : "Select limited partners or general partners to send this email."
                  : viewerIsCosponsor
                    ? `${selectedRecipients.length} selected. This email goes only to your investors.`
                    : selectedReleaseCount > 0
                      ? `${selectedRecipients.length} selected · ${selectedReleaseCount} held for co-sponsor (No intercept).`
                      : `Sending to ${selectedRecipients.length} selected recipient${
                          selectedRecipients.length === 1 ? "" : "s"
                        } on this deal.`}
            </span>
          </p>

          <div className="contacts_suspend_reason_field deal_inv_comm_recipients_field">
            <label className="um_field_label_row deal_inv_comm_recipients_label">
              <span>Recipients (BCC)</span>
            </label>
            {loadingRecipients ? (
              <p className="deal_inv_comm_recipients_loading" role="status">
                <Loader2
                  size={18}
                  strokeWidth={2}
                  className="deal_inv_comm_recipients_spinner"
                  aria-hidden
                />
                Loading investors…
              </p>
            ) : (
              <DealMailRecipientPicker
                recipients={recipients}
                selectedIds={selectedRecipientIds}
                onChangeSelectedIds={setSelectedRecipientIds}
                viewerIsCosponsor={viewerIsCosponsor}
              />
            )}
          </div>

          <div className="deal_inv_comm_send_mail_fields">
            <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="deal-inv-comm-send-mail-cc"
              >
                <span>CC</span>
              </label>
              <input
                id="deal-inv-comm-send-mail-cc"
                type="text"
                className="um_input"
                placeholder="email1@domain.com, email2@domain.com"
                value={sendMailCc}
                onChange={(e) => setSendMailCc(e.target.value)}
                disabled={sending}
              />
            </div>

            <div className="um_field contacts_suspend_reason_field">
              <div className="contacts_send_mail_template_head">
                <label
                  className="um_field_label_row"
                  htmlFor="deal-inv-comm-send-mail-template"
                >
                  <span>Email template</span>
                </label>
              </div>
              <div className="contacts_send_mail_template_select_row">
                <select
                  id="deal-inv-comm-send-mail-template"
                  className="um_field_select contacts_send_mail_template_select"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={sending || loadingRecipients}
                >
                  {emailTemplates.length === 0 ? (
                    <option value="">No active templates</option>
                  ) : null}
                  {emailTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate ? (
                  <>
                    <button
                      type="button"
                      className="contacts_send_mail_template_edit_btn"
                      aria-label="View"
                      title="View"
                      onClick={() => openSendMailEmailPreview("view")}
                    >
                      <Eye size={15} strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="contacts_send_mail_template_edit_btn"
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => openSendMailEmailPreview("edit")}
                    >
                      <Pencil size={15} strokeWidth={2} aria-hidden />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="contacts_send_mail_template_edit_btn"
                  aria-label="New template"
                  title="New template"
                  onClick={goNewTemplateFromSendMail}
                >
                  <Plus size={15} strokeWidth={2} aria-hidden />
                </button>
              </div>
              {emailTemplates.length === 0 ? (
                <p className="um_hint deal_inv_comm_template_hint" role="status">
                  Create an email template first in Email Templates.
                </p>
              ) : null}
            </div>
          </div>
          </div>

          <div className="um_modal_actions contacts_suspend_modal_actions">
            <button
              type="button"
              className="um_btn_secondary"
              onClick={closeModal}
              disabled={sending}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Close
            </button>
            <button
              type="button"
              className="um_btn_primary"
              disabled={
                sending ||
                loadingRecipients ||
                !selectedTemplateId ||
                selectedRecipients.length === 0 ||
                !selectedCanDeliver
              }
              onClick={requestSend}
            >
              {sending ? (
                <>
                  Sending…
                  <Loader2
                    size={16}
                    strokeWidth={2}
                    className="deal_inv_comm_recipients_spinner"
                    aria-hidden
                  />
                </>
              ) : (
                <>
                  <Send size={16} strokeWidth={2} aria-hidden />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {releaseConfirmOpen ? (
        <div
          className="um_modal_overlay contacts_suspend_overlay deal_inv_comm_release_overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !sending)
              setReleaseConfirmOpen(false)
          }}
        >
          <div
            className="um_modal contacts_suspend_modal deal_inv_comm_release_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deal-inv-comm-release-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="um_modal_head">
              <h3
                id="deal-inv-comm-release-title"
                className="um_modal_title um_title_with_icon"
              >
                <Mail
                  className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_info"
                  size={22}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>Release email to your investors?</span>
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={sending}
                onClick={() => setReleaseConfirmOpen(false)}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <p className="contacts_suspend_modal_desc contacts_suspend_modal_desc_info">
              <Info
                className="contacts_suspend_modal_desc_icon"
                size={18}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                As a cosponsor, sending this message releases it to the
                investors you selected.
              </span>
            </p>
            <p className="deal_inv_comm_release_copy">
              They will receive the email using the template you chose.
            </p>
            <p className="deal_inv_comm_release_meta">
              {selectedOwnLpCount} limited partner
              {selectedOwnLpCount === 1 ? "" : "s"} will receive this email.
            </p>
            <div className="um_modal_actions contacts_suspend_modal_actions">
              <button
                type="button"
                className="um_btn_secondary"
                disabled={sending}
                onClick={() => setReleaseConfirmOpen(false)}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Cancel
              </button>
              <button
                type="button"
                className="um_btn_primary"
                disabled={sending}
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <>
                    Sending…
                    <Loader2
                      size={16}
                      strokeWidth={2}
                      className="deal_inv_comm_recipients_spinner"
                      aria-hidden
                    />
                  </>
                ) : (
                  <>
                    <Send size={16} strokeWidth={2} aria-hidden />
                    Release & send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SendMailEmailPreviewModal
        preview={sendMailEmailPreview}
        onClose={() => setSendMailEmailPreview(null)}
        onSaved={handleSendMailPreviewSaved}
      />
    </>
  )
}
