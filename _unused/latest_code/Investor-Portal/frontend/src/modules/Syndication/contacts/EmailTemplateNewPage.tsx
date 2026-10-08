import {
  ArrowLeft,
  LayoutTemplate,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { flushSync } from "react-dom"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import { toast } from "../../../common/components/Toast"
import "../../../common/components/work_in_progress_page.css"
import "../usermanagement/user_management.css"
import "../Deals/deal-offering-details.css"
import "../Deals/deals-create.css"
import "../Deals/deals-list.css"
import "./contacts.css"
import {
  appendEmailTemplate,
  EMAIL_TEMPLATE_ATTACHMENT_MAX_BYTES,
  EMAIL_TEMPLATE_BODY_HTML_MAX,
  EMAIL_TEMPLATE_BODY_MAX,
  EMAIL_TEMPLATE_SUBJECT_MAX,
  fileToStoredAttachment,
  formatEmailAttachmentSize,
  getEmailTemplateById,
  updateEmailTemplate,
  type EmailTemplateRow,
  type EmailTemplateAttachmentStored,
} from "./emailTemplatesStorage"

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

export default function EmailTemplateNewPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(templateId)
  const [existingRow, setExistingRow] = useState<EmailTemplateRow | null>(null)

  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [preparedAttachment, setPreparedAttachment] =
    useState<EmailTemplateAttachmentStored | null>(null)
  /** When true, a stored attachment (edit mode) is cleared and not kept on save. */
  const [stripStoredAttachment, setStripStoredAttachment] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentPhase, setAttachmentPhase] = useState<
    "idle" | "picking" | "processing"
  >("idle")
  const [submitting, setSubmitting] = useState(false)
  const [bodyPlainLen, setBodyPlainLen] = useState(0)

  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const attachmentPhaseRef = useRef<"idle" | "picking" | "processing">("idle")
  const [attachmentDropFocus, setAttachmentDropFocus] = useState(false)

  function setAttachmentPhaseSafe(
    next: "idle" | "picking" | "processing",
  ) {
    attachmentPhaseRef.current = next
    setAttachmentPhase(next)
    setAttachmentBusy(next !== "idle")
  }

  useEffect(() => {
    if (!templateId) return
    void (async () => {
      const row = await getEmailTemplateById(templateId)
      if (!row) {
        toast.error("Template not found", "It may have been removed.")
        navigate("/contacts/email-templates", { replace: true })
        return
      }
      setExistingRow(row)
    })()
  }, [templateId, navigate])

  useEffect(() => {
    if (!existingRow) return
    setName(existingRow.name)
    setSubject(existingRow.subject)
    setAttachmentFile(null)
    setPreparedAttachment(null)
    setStripStoredAttachment(false)
    setAttachmentBusy(false)
    setAttachmentPhase("idle")
    attachmentPhaseRef.current = "idle"
  }, [existingRow?.id])

  useEffect(() => {
    const editorEl = editorRef.current
    if (!editorEl) return
    if (isEdit && !existingRow) return

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

    if (isEdit) {
      const bodyHtml = existingRow?.body?.trim() ? existingRow?.body : ""
      if (bodyHtml) {
        try {
          const delta = quill.clipboard.convert({ html: bodyHtml })
          quill.setContents(delta, "silent")
        } catch {
          quill.setText("")
        }
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
  }, [isEdit, existingRow])

  const removeAttachment = useCallback(() => {
    if (attachmentPhaseRef.current !== "idle") return
    if (attachmentFile || preparedAttachment) {
      setAttachmentFile(null)
      setPreparedAttachment(null)
      return
    }
    if (isEdit && existingRow?.attachment) {
      setStripStoredAttachment(true)
    }
  }, [attachmentFile, preparedAttachment, isEdit, existingRow?.attachment])

  const applyAttachmentFile = useCallback(async (file: File | null) => {
    if (!file) {
      if (attachmentPhaseRef.current === "picking") setAttachmentPhaseSafe("idle")
      return
    }
    if (attachmentPhaseRef.current === "processing") return
    if (file.size > EMAIL_TEMPLATE_ATTACHMENT_MAX_BYTES) {
      setAttachmentPhaseSafe("idle")
      toast.error(
        "File too large",
        `Choose a file up to ${EMAIL_TEMPLATE_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`,
      )
      return
    }
    setAttachmentPhaseSafe("processing")
    try {
      const result = await fileToStoredAttachment(file)
      if (!result.ok) {
        toast.error("Attachment", result.error)
        return
      }
      setAttachmentFile(file)
      setPreparedAttachment(result.data)
      setStripStoredAttachment(false)
    } finally {
      setAttachmentPhaseSafe("idle")
    }
  }, [])

  const onAttachmentChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      const file = files?.[0] ?? null
      e.target.value = ""
      if (!file) {
        if (attachmentPhaseRef.current === "picking") setAttachmentPhaseSafe("idle")
        return
      }
      void applyAttachmentFile(file)
    },
    [applyAttachmentFile],
  )

  const onAttachmentPickerCancel = useCallback(() => {
    if (attachmentPhaseRef.current === "picking") setAttachmentPhaseSafe("idle")
  }, [])

  const pickAttachmentFile = useCallback(() => {
    if (attachmentPhaseRef.current !== "idle") return
    flushSync(() => {
      setAttachmentPhaseSafe("picking")
    })
    attachmentInputRef.current?.click()
  }, [])

  useEffect(() => {
    if (attachmentPhase !== "picking") return
    function onWindowFocus() {
      window.setTimeout(() => {
        if (attachmentPhaseRef.current === "picking") setAttachmentPhaseSafe("idle")
      }, 400)
    }
    window.addEventListener("focus", onWindowFocus)
    return () => window.removeEventListener("focus", onWindowFocus)
  }, [attachmentPhase])

  const onAttachmentDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setAttachmentDropFocus(false)
      if (attachmentPhaseRef.current !== "idle") return
      void applyAttachmentFile(e.dataTransfer.files?.[0] ?? null)
    },
    [applyAttachmentFile],
  )

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (attachmentPhaseRef.current !== "idle") return
      const trimmedName = name.trim()
      if (!trimmedName) {
        toast.error("Name required", "Enter a template name.")
        return
      }
      if (subject.length > EMAIL_TEMPLATE_SUBJECT_MAX) {
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
      const len = quill.getLength()
      const html =
        len <= 1 && !quill.getText().trim()
          ? ""
          : quill.getSemanticHTML(0, Math.max(0, len - 1))

      setSubmitting(true)
      try {
        if (isEdit && templateId) {
          const current = existingRow
          if (!current) {
            toast.error("Template not found", "It may have been removed.")
            return
          }
          let attachment: EmailTemplateAttachmentStored | null = null
          if (preparedAttachment) {
            attachment = preparedAttachment
          } else if (attachmentFile) {
            const result = await fileToStoredAttachment(attachmentFile)
            if (!result.ok) {
              toast.error("Attachment", result.error)
              return
            }
            attachment = result.data
          } else if (current.attachment && !stripStoredAttachment) {
            attachment = current.attachment
          }
          const ok = await updateEmailTemplate({
            ...current,
            name: trimmedName,
            subject: subject.slice(0, EMAIL_TEMPLATE_SUBJECT_MAX),
            body: html.slice(0, EMAIL_TEMPLATE_BODY_HTML_MAX),
            attachment,
          })
          if (!ok) {
            toast.error("Could not save", "Template was not found.")
            return
          }
          toast.success("Template updated", trimmedName)
        } else {
          let attachment: EmailTemplateAttachmentStored | null = null
          if (preparedAttachment) {
            attachment = preparedAttachment
          } else if (attachmentFile) {
            const result = await fileToStoredAttachment(attachmentFile)
            if (!result.ok) {
              toast.error("Attachment", result.error)
              return
            }
            attachment = result.data
          }
          const id =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `tpl-${Date.now()}`
          await appendEmailTemplate({
            id,
            name: trimmedName,
            subject: subject.slice(0, EMAIL_TEMPLATE_SUBJECT_MAX),
            body: html.slice(0, EMAIL_TEMPLATE_BODY_HTML_MAX),
            attachment,
            archived: false,
            createdBy: "—",
            createdAt: new Date().toISOString(),
          })
          toast.success("Template saved", trimmedName)
        }
        navigate("/contacts/email-templates")
      } finally {
        setSubmitting(false)
      }
    },
    [
      attachmentFile,
      preparedAttachment,
      isEdit,
      name,
      navigate,
      existingRow,
      stripStoredAttachment,
      subject,
      templateId,
    ],
  )

  const cancel = useCallback(() => {
    navigate("/contacts/email-templates")
  }, [navigate])

  const hasStoredAttachmentVisible =
    isEdit && Boolean(existingRow?.attachment) && !stripStoredAttachment
  const showAttachmentChosen =
    Boolean(attachmentFile) || hasStoredAttachmentVisible
  const attachmentDisplayName = attachmentFile
    ? attachmentFile.name
    : (existingRow?.attachment?.fileName ?? "")
  const attachmentDisplaySize = attachmentFile
    ? formatEmailAttachmentSize(attachmentFile.size)
    : existingRow?.attachment
      ? formatEmailAttachmentSize(existingRow.attachment.size)
      : ""

  const formTitle = isEdit ? "Edit email template" : "New email template"
  const formTitleId = "email-template-form-title"

  return (
    <section
      className="um_page deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page contacts_page email_templates_page email_template_new_page"
      aria-labelledby={formTitleId}
    >
      <header className="deals_list_head deals_add_investor_class_page_head">
        <div className="deals_add_deal_asset_head_main">
          <div className="deals_list_title_row deals_add_deal_asset_title_row">
            <Link
              to="/contacts/email-templates"
              className="deals_list_back_circle"
              aria-label="Back to email templates"
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
            </Link>
            <div className="deals_add_deal_asset_title_stack">
              <h1
                id={formTitleId}
                className="deals_list_title email_template_new_title"
              >
                <LayoutTemplate
                  className="email_template_new_title_icon"
                  size={22}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {formTitle}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <form
        className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel email_template_new_form"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="um_field">
          <label
            className="um_field_label_row"
            htmlFor="email-template-form-name"
          >
            Template name *
          </label>
          <input
            id="email-template-form-name"
            type="text"
            className="um_input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            required
            aria-required
          />
        </div>

        <div className="um_field">
          <div className="email_template_new_label_row">
            <label
              className="um_field_label_row"
              htmlFor="email-template-form-subject"
            >
              Subject
            </label>
            <span className="email_template_char_count" aria-live="polite">
              {subject.length}/{EMAIL_TEMPLATE_SUBJECT_MAX}
            </span>
          </div>
          <input
            id="email-template-form-subject"
            type="text"
            className="um_input"
            value={subject}
            maxLength={EMAIL_TEMPLATE_SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="um_field email_template_body_field">
          <div className="email_template_new_label_row">
            <span
              className="um_field_label_row"
              id="email-template-form-body-label"
            >
              Body
            </span>
            <span className="email_template_char_count" aria-live="polite">
              {bodyPlainLen}/{EMAIL_TEMPLATE_BODY_MAX}
            </span>
          </div>
          <div
            className="deal_offering_quill"
            aria-labelledby="email-template-form-body-label"
          >
            <div ref={editorRef} className="deal_offering_quill_editor_host" />
          </div>
        </div>

        <div className="um_field email_template_attachment_field">
          <span className="um_field_label_row">Attachment</span>
          <p className="um_hint email_template_field_hint">
            Optional. One file, up to{" "}
            {EMAIL_TEMPLATE_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.
          </p>
          <input
            ref={attachmentInputRef}
            type="file"
            className="email_template_attachment_input_hidden"
            onChange={onAttachmentChange}
            {...({ onCancel: onAttachmentPickerCancel } as InputHTMLAttributes<HTMLInputElement>)}
            disabled={submitting}
            aria-label="Choose attachment file"
          />
          {!showAttachmentChosen ? (
            <div
              role="button"
              tabIndex={attachmentBusy ? -1 : 0}
              className={`email_template_attachment_dropzone${
                attachmentDropFocus
                  ? " email_template_attachment_dropzone--focus"
                  : ""
              }${
                attachmentBusy
                  ? " email_template_attachment_dropzone--busy"
                  : ""
              }`}
              aria-busy={attachmentBusy}
              aria-disabled={attachmentBusy}
              aria-live="polite"
              onClick={() => {
                if (!attachmentBusy) pickAttachmentFile()
              }}
              onKeyDown={(e) => {
                if (attachmentBusy) return
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  pickAttachmentFile()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (!attachmentBusy) setAttachmentDropFocus(true)
              }}
              onDragLeave={() => setAttachmentDropFocus(false)}
              onDrop={onAttachmentDrop}
            >
              <span
                className="email_template_attachment_dropzone_icon_ring"
                aria-hidden
              >
                {attachmentBusy ? (
                  <Loader2
                    size={20}
                    strokeWidth={1.75}
                    className="email_template_new_btn_spin"
                  />
                ) : (
                  <Upload size={20} strokeWidth={1.75} />
                )}
              </span>
              <span className="email_template_attachment_dropzone_text">
                <span className="email_template_attachment_dropzone_title">
                  {attachmentPhase === "picking"
                    ? "Opening file picker…"
                    : attachmentBusy
                      ? "Adding attachment…"
                      : "Add an attachment"}
                </span>
                <span className="email_template_attachment_dropzone_sub">
                  {attachmentPhase === "picking"
                    ? "Your file manager is opening"
                    : attachmentBusy
                      ? "Please wait until the file is ready"
                      : "Drop a file here or click to browse"}
                </span>
              </span>
            </div>
          ) : (
            <ul
              className="email_template_attachment_file_list"
              aria-label="Selected attachment"
            >
              <li className="email_template_attachment_file_row">
                <span
                  className="email_template_attachment_file_icon_wrap"
                  aria-hidden
                >
                  <Paperclip size={18} strokeWidth={2} />
                </span>
                <span className="email_template_attachment_file_meta">
                  <span
                    className="email_template_attachment_file_name"
                    title={attachmentDisplayName}
                  >
                    {attachmentDisplayName}
                  </span>
                  {attachmentDisplaySize ? (
                    <span className="email_template_attachment_file_size">
                      {attachmentDisplaySize}
                    </span>
                  ) : null}
                </span>
                <div
                  className="email_template_attachment_file_actions"
                  role="group"
                  aria-label="Attachment actions"
                >
                  <button
                    type="button"
                    className="email_template_attachment_file_btn"
                    onClick={pickAttachmentFile}
                    disabled={attachmentBusy || submitting}
                    aria-label={
                      attachmentBusy
                        ? "Adding attachment"
                        : "Replace attachment"
                    }
                    title={attachmentBusy ? "Adding attachment…" : "Replace file"}
                    aria-busy={attachmentBusy}
                  >
                    {attachmentBusy ? (
                      <Loader2
                        size={16}
                        strokeWidth={2}
                        className="email_template_new_btn_spin"
                        aria-hidden
                      />
                    ) : (
                      <Upload size={16} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="email_template_attachment_file_btn email_template_attachment_file_btn--danger"
                    onClick={removeAttachment}
                    disabled={attachmentBusy || submitting}
                    aria-label="Remove attachment"
                    title="Remove file"
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </li>
            </ul>
          )}
        </div>

        <div className="email_template_new_actions um_modal_actions add_contact_modal_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={cancel}
            disabled={submitting}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <div className="add_contact_modal_actions_trailing">
            <button type="submit" className="um_btn_primary" disabled={submitting || attachmentBusy}>
            {submitting ? (
              <>
                <Loader2
                  size={16}
                  strokeWidth={2}
                  className="email_template_new_btn_spin"
                  aria-hidden
                />
                Saving…
              </>
            ) : isEdit ? (
              <>
                <Save size={16} strokeWidth={2} aria-hidden />
                Save changes
              </>
            ) : (
              <>
                <Save size={16} strokeWidth={2} aria-hidden />
                Save template
              </>
            )}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
