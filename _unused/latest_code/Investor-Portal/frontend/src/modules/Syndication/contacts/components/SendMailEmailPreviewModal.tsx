import DOMPurify from "dompurify"
import {
  LayoutTemplate,
  Loader2,
  Mail,
  Pencil,
  Paperclip,
  Save,
  X,
} from "lucide-react"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "../../../../common/components/Toast"
import {
  EMAIL_TEMPLATE_BODY_HTML_MAX,
  EMAIL_TEMPLATE_BODY_MAX,
  EMAIL_TEMPLATE_SUBJECT_MAX,
  attachmentToObjectUrl,
  formatEmailAttachmentSize,
  updateEmailTemplate,
  type EmailTemplateAttachmentStored,
  type EmailTemplateRow,
} from "../emailTemplatesStorage"
import "../contacts.css"

export type SendMailEmailPreviewPayload = {
  templateId: string
  templateName: string
  templateArchived: boolean
  createdBy: string
  createdAt: string
  subject: string
  bodyHtml: string
  toEmails: string[]
  ccEmails: string[]
  /** When set, investors are shown as BCC (addresses hidden from other recipients). */
  bccEmails?: string[]
  attachment: EmailTemplateAttachmentStored | null
  /** When true, opens with the inline template editor (pencil on send mail). */
  startInEditMode?: boolean
}

type SendMailEmailPreviewModalProps = {
  preview: SendMailEmailPreviewPayload | null
  onClose: () => void
  /** Called after a successful template save; parent should merge `subject` / `bodyHtml` and reload templates. */
  onSaved?: (patch: { subject: string; bodyHtml: string }) => void
}

function joinRecipients(emails: string[]): string {
  if (emails.length === 0) return "—"
  return emails.join(", ")
}

function removeQuillSnowArtifacts(host: HTMLDivElement | null): void {
  if (!host) return
  const wrap = host.parentElement
  if (wrap) {
    for (const el of wrap.querySelectorAll(":scope > .ql-toolbar")) {
      el.remove()
    }
  }
  host.classList.remove("ql-container", "ql-snow", "ql-bubble", "ql-disabled")
  host.removeAttribute("data-quill-id")
  host.innerHTML = ""
}

export function SendMailEmailPreviewModal({
  preview,
  onClose,
  onSaved,
}: SendMailEmailPreviewModalProps) {
  const [editing, setEditing] = useState(false)
  const [draftSubject, setDraftSubject] = useState("")
  const [saveBusy, setSaveBusy] = useState(false)
  const [bodyPlainLen, setBodyPlainLen] = useState(0)

  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  /** Avoid resetting edit mode when the parent passes a new preview object reference. */
  const previewSessionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!preview) {
      previewSessionRef.current = null
      setEditing(false)
      setDraftSubject("")
      setSaveBusy(false)
      return
    }
    const sid = `${preview.templateId}:${preview.startInEditMode ? "1" : "0"}`
    const isNewSession = previewSessionRef.current !== sid
    if (isNewSession) {
      previewSessionRef.current = sid
      setDraftSubject(preview.subject)
      setEditing(Boolean(preview.startInEditMode))
    } else if (!editing) {
      setDraftSubject(preview.subject)
    }
  }, [preview, editing])

  useEffect(() => {
    if (!preview || !editing) {
      if (quillRef.current) {
        quillRef.current = null
      }
      return
    }
    const editorEl = editorRef.current
    if (!editorEl) return

    removeQuillSnowArtifacts(editorEl)

    const quill = new Quill(editorEl, {
      theme: "snow",
      modules: {
        toolbar: [
          [{ font: [] }, { size: [] }],
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ indent: "-1" }, { indent: "+1" }],
          ["link", "image", "video"],
          ["blockquote", "code-block"],
          ["clean"],
        ],
      },
      placeholder: "Email body…",
    })

    const bodyHtml = preview.bodyHtml?.trim() ? preview.bodyHtml : ""
    if (bodyHtml) {
      try {
        const delta = quill.clipboard.convert({ html: bodyHtml })
        quill.setContents(delta, "silent")
      } catch {
        quill.setText("")
      }
    }

    const updatePlainLen = () => {
      const t = quill.getText().replace(/\n$/, "").trim()
      setBodyPlainLen(t.length)
    }
    updatePlainLen()
    quill.on("text-change", updatePlainLen)
    quillRef.current = quill

    return () => {
      quill.off("text-change", updatePlainLen)
      quillRef.current = null
      removeQuillSnowArtifacts(editorRef.current)
    }
  }, [preview?.templateId, preview?.bodyHtml, editing])

  const handleCancelEdit = useCallback(() => {
    if (!preview) return
    setDraftSubject(preview.subject)
    setEditing(false)
  }, [preview])

  const handleSaveTemplate = useCallback(async () => {
    if (!preview) return
    const trimmedSubject = draftSubject.trim()
    if (!trimmedSubject) {
      toast.error("Subject required", "Enter a subject for the template.")
      return
    }
    if (trimmedSubject.length > EMAIL_TEMPLATE_SUBJECT_MAX) {
      toast.error(
        "Subject too long",
        `Use at most ${EMAIL_TEMPLATE_SUBJECT_MAX} characters.`,
      )
      return
    }
    const quill = quillRef.current
    if (!quill) {
      toast.error("Editor not ready", "Please wait a moment and try again.")
      return
    }
    const plain = quill.getText().replace(/\n$/, "").trim()
    if (plain.length > EMAIL_TEMPLATE_BODY_MAX) {
      toast.error(
        "Body too long",
        `Use at most ${EMAIL_TEMPLATE_BODY_MAX} characters of text.`,
      )
      return
    }
    let bodyHtml = quill.root.innerHTML
    if (bodyHtml.length > EMAIL_TEMPLATE_BODY_HTML_MAX) {
      toast.error(
        "Body too large",
        `HTML must be at most ${EMAIL_TEMPLATE_BODY_HTML_MAX} characters.`,
      )
      return
    }

    const row: EmailTemplateRow = {
      id: preview.templateId,
      name: preview.templateName,
      subject: trimmedSubject,
      body: bodyHtml,
      attachment: preview.attachment,
      archived: preview.templateArchived,
      createdBy: preview.createdBy,
      createdAt: preview.createdAt,
    }

    setSaveBusy(true)
    try {
      await updateEmailTemplate(row)
      toast.success("Template saved", "Your changes were stored.")
      onSaved?.({ subject: trimmedSubject, bodyHtml })
      setEditing(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save template."
      toast.error("Save failed", msg)
    } finally {
      setSaveBusy(false)
    }
  }, [draftSubject, onSaved, preview])

  if (!preview) return null

  const toLine = joinRecipients(preview.toEmails)
  const ccLine = joinRecipients(preview.ccEmails)
  const bccLine =
    preview.bccEmails != null ? joinRecipients(preview.bccEmails) : null

  return (
    <div
      className="um_modal_overlay contacts_view_modal_overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="um_modal contacts_view_modal um_modal_view email_templates_email_preview_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-mail-email-preview-title"
      >
        <div className="um_modal_head">
          <h3
            id="send-mail-email-preview-title"
            className="um_modal_title um_title_with_icon"
          >
            <Mail
              className="um_title_icon"
              size={22}
              strokeWidth={1.75}
              aria-hidden
            />
            Email preview
          </h3>
          <button
            type="button"
            className="um_modal_close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="email_templates_view_modal_body email_preview_modal_body">
          <p className="email_preview_internal_note">
            <LayoutTemplate
              size={14}
              strokeWidth={2}
              className="email_preview_internal_icon"
              aria-hidden
            />
            <span>
              Template: <strong>{preview.templateName}</strong>
            </span>
          </p>
          <div className="email_preview_sheet" role="document">
            {editing ? (
              <div className="email_preview_edit_fields">
                <label className="email_preview_edit_label" htmlFor="send-mail-preview-subject">
                  Subject
                </label>
                <input
                  id="send-mail-preview-subject"
                  type="text"
                  className="um_input email_preview_edit_subject_input"
                  maxLength={EMAIL_TEMPLATE_SUBJECT_MAX}
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  autoComplete="off"
                />
                <p className="email_preview_body_len_hint" aria-live="polite">
                  Body text: {bodyPlainLen} / {EMAIL_TEMPLATE_BODY_MAX}
                </p>
                <div
                  ref={editorRef}
                  className="email_preview_quill_host"
                  aria-label="Email body editor"
                />
              </div>
            ) : (
              <>
                <h2 className="email_preview_subject_line">
                  {preview.subject?.trim() || "(No subject)"}
                </h2>
                <dl className="email_preview_header_lines">
                  <div className="email_preview_dl_row">
                    <dt>To</dt>
                    <dd>{toLine}</dd>
                  </div>
                  <div className="email_preview_dl_row">
                    <dt>CC</dt>
                    <dd>{ccLine}</dd>
                  </div>
                  {bccLine != null ? (
                    <div className="email_preview_dl_row">
                      <dt>BCC</dt>
                      <dd>{bccLine}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="email_preview_message_card">
                  {preview.bodyHtml?.trim() ? (
                    <div
                      className="email_preview_message_body"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(preview.bodyHtml),
                      }}
                    />
                  ) : (
                    <p className="email_preview_empty_body">(No message body)</p>
                  )}
                </div>
              </>
            )}
            {editing ? (
              <dl className="email_preview_header_lines email_preview_header_lines_edit">
                <div className="email_preview_dl_row">
                  <dt>To</dt>
                  <dd>{toLine}</dd>
                </div>
                <div className="email_preview_dl_row">
                  <dt>CC</dt>
                  <dd>{ccLine}</dd>
                </div>
              </dl>
            ) : null}
            {preview.attachment ? (
              <div className="email_preview_attachments">
                <div className="email_preview_attachments_label">Attachment</div>
                <button
                  type="button"
                  className="email_preview_attachment_chip"
                  onClick={() => {
                    const att = preview.attachment
                    if (!att) return
                    const url = attachmentToObjectUrl(att)
                    if (!url) return
                    const a = document.createElement("a")
                    a.href = url
                    a.download = att.fileName
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <span
                    className="email_preview_attachment_icon_wrap"
                    aria-hidden
                  >
                    <Paperclip
                      className="email_preview_attachment_icon"
                      size={18}
                      strokeWidth={2}
                    />
                  </span>
                  <span className="email_preview_attachment_meta">
                    <span className="email_preview_attachment_name">
                      {preview.attachment.fileName}
                    </span>
                    {formatEmailAttachmentSize(preview.attachment.size) ? (
                      <span className="email_preview_attachment_size">
                        {formatEmailAttachmentSize(preview.attachment.size)}
                      </span>
                    ) : null}
                  </span>
                  <span className="email_preview_attachment_action">
                    Download
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="um_modal_actions contacts_view_modal_footer send_mail_preview_modal_footer">
          {editing ? (
            <>
              <button
                type="button"
                className="um_btn_secondary"
                disabled={saveBusy}
                onClick={handleCancelEdit}
              >
                <X size={18} strokeWidth={2} aria-hidden />
                Cancel edit
              </button>
              <button
                type="button"
                className="um_btn_primary"
                disabled={saveBusy}
                onClick={() => void handleSaveTemplate()}
              >
                {saveBusy ? (
                  <Loader2
                    size={18}
                    strokeWidth={2}
                    className="email_preview_save_spinner"
                    aria-hidden
                  />
                ) : (
                  <Save size={18} strokeWidth={2} aria-hidden />
                )}
                Save template
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="um_btn_secondary"
                onClick={onClose}
              >
                <X size={18} strokeWidth={2} aria-hidden />
                Close
              </button>
              <button
                type="button"
                className="um_btn_primary"
                onClick={() => setEditing(true)}
              >
                <Pencil size={18} strokeWidth={2} aria-hidden />
                Edit template
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
