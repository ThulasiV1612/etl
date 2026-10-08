import { ArrowLeft, FileUp, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { DropboxSignEmbeddedEditor } from "@/common/components/dropbox-sign-embedded"
import type { DropboxSignCreateTemplateEvent } from "@/common/components/dropbox-sign-embedded/dropboxSignEmbedded.types"
import { toast } from "@/common/components/Toast"
import { toastTemplateEditorOpenError } from "@/modules/Syndication/Deals/utils/esignTemplateDisplay"
import "@/common/components/work_in_progress_page.css"
import "../usermanagement/user_management.css"
import "../Deals/deals-list.css"
import "./reusable-templates.css"
import {
  fetchTemplatesDropboxSignConfig,
  postReusableTemplateEmbeddedDraft,
  postReusableTemplateSave,
  postReusableTemplateUpload,
} from "./api/templatesApi"

type EmbeddedSession = {
  portalTemplateId: string
  editUrl: string
  clientId: string
  testMode: boolean
  templateName: string
}

export default function CreateReusableTemplatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resumeId = searchParams.get("resume")?.trim() || ""

  const [name, setName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dropboxConfigured, setDropboxConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [embeddedSession, setEmbeddedSession] = useState<EmbeddedSession | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      const cfg = await fetchTemplatesDropboxSignConfig()
      if (cfg.ok) setDropboxConfigured(cfg.configured)
    })()
  }, [])

  const openEmbeddedEditor = useCallback(
    async (portalTemplateId: string, templateName: string) => {
      const draft = await postReusableTemplateEmbeddedDraft(portalTemplateId, {
        title: templateName,
      })
      if (!draft.ok) {
        toastTemplateEditorOpenError(draft.message)
        return false
      }
      setEmbeddedSession({
        portalTemplateId,
        editUrl: draft.editUrl,
        clientId: draft.clientId,
        testMode: draft.testMode,
        templateName,
      })
      return true
    },
    [],
  )

  const handleCreate = useCallback(async () => {
    if (!dropboxConfigured) {
      toast.error(
        "Dropbox Sign not configured",
        "Add DROPBOX_SIGN_API_KEY and DROPBOX_SIGN_CLIENT_ID to backend .env",
      )
      return
    }

    setBusy(true)
    try {
      if (resumeId) {
        const title = name.trim() || "Reusable template"
        await openEmbeddedEditor(resumeId, title)
        return
      }

      if (!file) {
        toast.error("Choose a PDF document to upload")
        return
      }
      const isPdf =
        file.name.toLowerCase().endsWith(".pdf") ||
        file.type === "application/pdf"
      if (!isPdf) {
        toast.error(
          "PDF required",
          "Dropbox Sign templates require PDF. Convert Word documents to PDF first.",
        )
        return
      }

      const templateName =
        name.trim() || file.name.replace(/\.[^.]+$/i, "").trim() || "Untitled template"

      const upload = await postReusableTemplateUpload({
        name: templateName,
        file,
      })
      if (!upload.ok) {
        toast.error("Upload failed", upload.message)
        return
      }

      await openEmbeddedEditor(upload.template.id, templateName)
    } finally {
      setBusy(false)
    }
  }, [dropboxConfigured, file, name, openEmbeddedEditor, resumeId])

  const handleTemplateSaved = useCallback(
    (data: DropboxSignCreateTemplateEvent) => {
      if (!embeddedSession) return
      void (async () => {
        setBusy(true)
        try {
          const roles =
            data.templateInfo?.signerRoles?.map((r, i) => ({
              name: r.name?.trim() || `Signer ${i + 1}`,
              order: typeof r.order === "number" ? r.order : i,
            })) ?? []

          const result = await postReusableTemplateSave({
            portalTemplateId: embeddedSession.portalTemplateId,
            template_id: data.templateId,
            name: data.templateInfo?.title?.trim() || embeddedSession.templateName,
            roles,
          })
          setEmbeddedSession(null)
          if (result.ok) {
            toast.success(
              "Template saved",
              "Your reusable template is ready to send to signers.",
            )
            navigate("/templates", { replace: true })
          } else {
            toast.error("Could not save template", result.message)
          }
        } finally {
          setBusy(false)
        }
      })()
    },
    [embeddedSession, navigate],
  )

  return (
    <div className="work_in_progress_page reusable_templates_root">
      <Link to="/templates" className="deals_create_back_link">
        <ArrowLeft size={16} aria-hidden />
        Back to templates
      </Link>

      <h1 className="work_in_progress_page_title">Create Template</h1>
      <p className="work_in_progress_page_desc">
        Upload a PDF, then use the Dropbox Sign editor to place signature, name, date,
        and text fields. Assign signer roles (e.g. Signer 1, Signer 2) before saving.
      </p>

      <div className="reusable_templates_create_panel">
        {resumeId ? (
          <p className="reusable_templates_status">
            Continuing setup for an existing upload. Click below to open the field
            editor.
          </p>
        ) : (
          <>
            <div className="reusable_templates_field">
              <label htmlFor="template-name">Template name</label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Subscription agreement"
                disabled={busy}
              />
            </div>
            <div className="reusable_templates_field">
              <label htmlFor="template-file">Document (PDF)</label>
              <input
                id="template-file"
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </>
        )}

        {!dropboxConfigured ? (
          <p className="reusable_templates_status" role="alert">
            Dropbox Sign is not configured on the server.
          </p>
        ) : null}

        <button
          type="button"
          className="deals_list_primary_btn"
          disabled={busy || !dropboxConfigured || (!resumeId && !file)}
          onClick={() => void handleCreate()}
        >
          {busy ? (
            <Loader2 size={16} className="deals_spin" aria-hidden />
          ) : (
            <FileUp size={16} aria-hidden />
          )}
          {resumeId ? "Open field editor" : "Create Template"}
        </button>
      </div>

      {embeddedSession ? (
        <DropboxSignEmbeddedEditor
          editUrl={embeddedSession.editUrl}
          clientId={embeddedSession.clientId}
          testMode={embeddedSession.testMode}
          onTemplateSaved={handleTemplateSaved}
          onCancel={() => setEmbeddedSession(null)}
          onError={(message) => {
            setEmbeddedSession(null)
            toast.error("Dropbox Sign", message)
          }}
        />
      ) : null}
    </div>
  )
}
