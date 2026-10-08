import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Link2,
  Loader2,
  Plus,
  Save,
  Sparkles,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"
import { toast } from "@/common/components/Toast"
import { postDealEsignAddInvestorDataField } from "@/modules/Syndication/Deals/api/dealsApi"
import {
  ESIGN_ENTITY_CATEGORIES,
  ESIGN_ENTITY_CATEGORY_COLUMN_LABELS,
  ESIGN_ENTITY_PROFILE_IDS,
} from "@/modules/Syndication/Deals/tabs/esign_templates/esignEntityCategories"
import {
  ESIGN_INVESTOR_DATA_FIELDS,
  groupEsignInvestorDataFields,
  type EsignInvestorDataField,
} from "@/modules/Syndication/Deals/tabs/esign_templates/esignInvestorDataFieldCatalog"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./signflow-embedded.css"

export type SignFlowEmbeddedEditorProps = {
  editUrl: string
  documentId: string
  templateTitle?: string
  /** True while waiting for the server to return an embed URL (first-time setup). */
  sessionLoading?: boolean
  /** Deal + template file used to add investor data fields onto the draft. */
  dealId?: string
  fileId?: string
  onTemplateSaved: (data: {
    templateId: string
    templateInfo?: { title?: string }
  }) => void
  onCancel?: () => void
  onError?: (message: string) => void
}

/**
 * SignFlow template field editor — premium full-screen popup with embedded builder.
 */
const EMBED_SAVE_DISABLED_HINT =
  "Place at least one field for both Investor and Sponsor"

/** Fallback when the embed does not emit builder-save-template after save. */
const EMBED_SAVE_TIMEOUT_MS = 4_000
const EMBED_SAVE_TIMEOUT_WHEN_DIRTY_MS = 1_500
/** Soft-flush embed layout (deletes/moves) to SignFlow before API field append. */
const EMBED_SOFT_FLUSH_TIMEOUT_MS = 2_000

type SignFlowEmbedMessage = {
  source?: string
  event?: string
  message?: string
  canSaveTemplate?: boolean
  documentId?: string
  title?: string
}

function requestSignFlowEmbedSave(iframe: HTMLIFrameElement | null): void {
  const target = iframe?.contentWindow
  if (!target) return
  const payload = { source: "signflow-parent", event: "save-template" }
  target.postMessage(payload, "*")
  target.postMessage({ ...payload, event: "request-save-template" }, "*")
}

function buildSignFlowReloadSrc(url: string, nonce: number): string {
  if (nonce <= 0) return url
  return `${url}${url.includes("?") ? "&" : "?"}sfReload=${nonce}`
}

export function SignFlowEmbeddedEditor({
  editUrl,
  documentId,
  templateTitle,
  sessionLoading = false,
  dealId,
  fileId,
  onTemplateSaved,
  onCancel,
  onError,
}: SignFlowEmbeddedEditorProps) {
  const savedRef = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const saveWaiterRef = useRef<{
    resolve: () => void
    timer: number
  } | null>(null)
  /** Resolves when embed soft-flushes layout; must not complete the SynX template. */
  const softFlushWaiterRef = useRef<{
    resolve: () => void
    timer: number
  } | null>(null)
  /** Ignore late builder-save-template events after a soft flush (race with embed). */
  const softFlushIgnoreUntilRef = useRef(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [builderReady, setBuilderReady] = useState(false)
  const [canSaveTemplate, setCanSaveTemplate] = useState(false)
  /** True after any sponsor edit (Choose field, place/move/delete in embed). */
  const [hasLocalFieldEdits, setHasLocalFieldEdits] = useState(false)
  const hasLocalFieldEditsRef = useRef(false)
  const [saving, setSaving] = useState(false)
  /** Visible embed generation. */
  const [viewNonce, setViewNonce] = useState(0)
  /** Background embed generation loading behind the visible one. */
  const [preloadNonce, setPreloadNonce] = useState<number | null>(null)
  const [selectedFieldKey, setSelectedFieldKey] = useState("")
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false)
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(() => [
    ...ESIGN_ENTITY_PROFILE_IDS,
  ])
  const [addingField, setAddingField] = useState(false)
  const fieldSelectId = useId()
  const profileGroupId = useId()
  const fieldPickerRef = useRef<HTMLDivElement | null>(null)
  const fieldGroups = groupEsignInvestorDataFields()
  const selectedFieldLabel = useMemo(() => {
    if (!selectedFieldKey) return ""
    return (
      ESIGN_INVESTOR_DATA_FIELDS.find((f) => f.key === selectedFieldKey)?.label ??
      ""
    )
  }, [selectedFieldKey])

  useEffect(() => {
    if (!fieldPickerOpen) return
    function onDocPointerDown(e: PointerEvent) {
      const root = fieldPickerRef.current
      if (!root) return
      if (e.target instanceof Node && !root.contains(e.target)) {
        setFieldPickerOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFieldPickerOpen(false)
    }
    document.addEventListener("pointerdown", onDocPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [fieldPickerOpen])

  const url = editUrl?.trim()
  const docId = documentId?.trim()
  const displayTitle = templateTitle?.trim() || "eSign template"
  const canAddInvestorData = Boolean(dealId?.trim() && fileId?.trim() && docId)
  /** Unlock save after SynX field adds or when SignFlow reports the template is ready. */
  const allowSave = canSaveTemplate || hasLocalFieldEdits || hasLocalFieldEditsRef.current
  const embedBusy = addingField || preloadNonce != null

  const markTemplateDirty = useCallback(() => {
    hasLocalFieldEditsRef.current = true
    setHasLocalFieldEdits(true)
  }, [])

  useEffect(() => {
    savedRef.current = false
    setIframeLoaded(false)
    setBuilderReady(false)
    setCanSaveTemplate(false)
    setSaving(false)
    setViewNonce(0)
    setPreloadNonce(null)
  }, [url, docId])

  useEffect(() => {
    hasLocalFieldEditsRef.current = false
    setHasLocalFieldEdits(false)
  }, [url, docId])

  const clearSaveWaiter = useCallback(() => {
    const waiter = saveWaiterRef.current
    if (!waiter) return
    window.clearTimeout(waiter.timer)
    saveWaiterRef.current = null
  }, [])

  const clearSoftFlushWaiter = useCallback(() => {
    const waiter = softFlushWaiterRef.current
    if (!waiter) return
    window.clearTimeout(waiter.timer)
    softFlushWaiterRef.current = null
  }, [])

  const completeTemplateSave = useCallback(
    (payload?: { documentId?: string; title?: string }) => {
      const templateId = payload?.documentId?.trim() || docId
      if (!templateId || savedRef.current) return
      savedRef.current = true
      clearSaveWaiter()
      setSaving(true)
      const title = payload?.title?.trim() || displayTitle
      onTemplateSaved({
        templateId,
        templateInfo: title ? { title } : undefined,
      })
    },
    [clearSaveWaiter, displayTitle, docId, onTemplateSaved],
  )

  const flushEmbedLayout = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      clearSoftFlushWaiter()
      softFlushIgnoreUntilRef.current = Date.now() + EMBED_SOFT_FLUSH_TIMEOUT_MS + 1_000
      const finish = () => {
        softFlushWaiterRef.current = null
        resolve()
      }
      const timer = window.setTimeout(finish, EMBED_SOFT_FLUSH_TIMEOUT_MS)
      softFlushWaiterRef.current = {
        resolve: () => {
          window.clearTimeout(timer)
          finish()
        },
        timer,
      }
      requestSignFlowEmbedSave(iframeRef.current)
    })
  }, [clearSoftFlushWaiter])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as SignFlowEmbedMessage | undefined
      if (!data || data.source !== "signflow-embed") return
      if (data.event === "builder-ready" || data.event === "builder-document-loaded") {
        setBuilderReady(true)
        // Keep Save unlocked across background iframe refreshes after edits.
        if (hasLocalFieldEditsRef.current) {
          setHasLocalFieldEdits(true)
        }
      }
      if (data.event === "builder-template-state") {
        // Any template-state update means the sponsor changed the draft — enable Save.
        markTemplateDirty()
        if (data.canSaveTemplate) {
          setCanSaveTemplate(true)
        }
      }
      if (data.event === "builder-save-template") {
        if (
          softFlushWaiterRef.current ||
          Date.now() < softFlushIgnoreUntilRef.current
        ) {
          softFlushWaiterRef.current?.resolve()
          return
        }
        saveWaiterRef.current?.resolve()
        clearSaveWaiter()
        completeTemplateSave({
          documentId: data.documentId,
          title: data.title,
        })
      }
      if (data.event === "builder-error") {
        onError?.(data.message ?? "Could not load the SignFlow template editor")
      }
    }
    window.addEventListener("message", onMessage)
    return () => {
      window.removeEventListener("message", onMessage)
      clearSaveWaiter()
      clearSoftFlushWaiter()
    }
  }, [
    clearSaveWaiter,
    clearSoftFlushWaiter,
    completeTemplateSave,
    markTemplateDirty,
    onError,
  ])

  useEffect(() => {
    if (!url || sessionLoading) return
    const timer = window.setTimeout(() => {
      setBuilderReady(true)
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [url, sessionLoading, viewNonce])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !embedBusy) onCancel?.()
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [embedBusy, onCancel, saving])

  const promotePreloadedEmbed = useCallback((nonce: number) => {
    setViewNonce(nonce)
    setPreloadNonce(null)
    setIframeLoaded(true)
    setBuilderReady(true)
  }, [])

  const handleSave = useCallback(() => {
    if (!allowSave || saving || !iframeLoaded || !builderReady || addingField) return

    setSaving(true)
    requestSignFlowEmbedSave(iframeRef.current)

    const timeoutMs = hasLocalFieldEdits || hasLocalFieldEditsRef.current
      ? EMBED_SAVE_TIMEOUT_WHEN_DIRTY_MS
      : EMBED_SAVE_TIMEOUT_MS

    const timer = window.setTimeout(() => {
      saveWaiterRef.current = null
      // Fields added via API are already on the SignFlow document — complete even if
      // the embed never emits builder-save-template (e.g. canSave stayed false).
      completeTemplateSave({ documentId: docId, title: displayTitle })
    }, timeoutMs)

    saveWaiterRef.current = {
      resolve: () => {
        window.clearTimeout(timer)
        saveWaiterRef.current = null
      },
      timer,
    }
  }, [
    addingField,
    allowSave,
    builderReady,
    completeTemplateSave,
    displayTitle,
    docId,
    hasLocalFieldEdits,
    iframeLoaded,
    saving,
  ])

  const handleToggleProfile = useCallback((profileId: string) => {
    setSelectedProfileIds((prev) => {
      if (prev.includes(profileId)) {
        return prev.filter((id) => id !== profileId)
      }
      return [...prev, profileId]
    })
  }, [])

  const handleAddInvestorDataField = useCallback(async () => {
    const key = selectedFieldKey.trim()
    const dId = dealId?.trim()
    const fId = fileId?.trim()
    if (!key || !dId || !fId || embedBusy) return
    if (selectedProfileIds.length === 0) {
      toast.error(
        "Choose at least one profile",
        "Select which investor profiles should see this field.",
      )
      return
    }

    setAddingField(true)
    try {
      // Persist embed deletes/moves to SignFlow before we read+append via API,
      // otherwise the patch rewrites the previous field set and removed fields return.
      await flushEmbedLayout()

      const result = await postDealEsignAddInvestorDataField(
        dId,
        fId,
        key,
        selectedProfileIds,
      )
      if (!result.ok) {
        toast.error("Could not add field", result.message)
        return
      }
      toast.success(
        "Investor data field added",
        `“${result.label}” was placed as “${result.esignLabel}”. Drag it on the PDF as needed, then save.`,
      )
      markTemplateDirty()
      setCanSaveTemplate(true)
      // Swap in a fresh embed in the background — keep the current PDF visible.
      setPreloadNonce(viewNonce + 1)
    } finally {
      setAddingField(false)
    }
  }, [
    dealId,
    embedBusy,
    fileId,
    flushEmbedLayout,
    markTemplateDirty,
    selectedFieldKey,
    selectedProfileIds,
    viewNonce,
  ])

  const saveDisabled =
    saving ||
    sessionLoading ||
    !url ||
    !docId ||
    !iframeLoaded ||
    !builderReady ||
    !allowSave ||
    addingField

  const handleBackdropMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (saving || embedBusy) return
      if (event.target === event.currentTarget) onCancel?.()
    },
    [embedBusy, onCancel, saving],
  )

  if (!sessionLoading && (!url || !docId)) return null

  const showWorkspaceLoading = sessionLoading || !url || (!iframeLoaded && preloadNonce == null)
  const activeSrc = url ? buildSignFlowReloadSrc(url, viewNonce) : ""
  const preloadSrc =
    url && preloadNonce != null ? buildSignFlowReloadSrc(url, preloadNonce) : ""

  const modal = (
    <div
      className="signflow_editor_overlay"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="signflow_editor_dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signflow-template-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="signflow_editor_header">
          <div className="signflow_editor_header_main">
            <div className="signflow_editor_icon" aria-hidden>
              <FileText size={22} strokeWidth={1.75} />
            </div>
            <div className="signflow_editor_titles">
              <p className="signflow_editor_eyebrow">
                <Sparkles size={12} strokeWidth={2} aria-hidden />
                SignFlow template setup
              </p>
              <h2 id="signflow-template-editor-title" className="signflow_editor_title">
                {displayTitle}
              </h2>
              <p className="signflow_editor_subtitle">
                Choose investor data from the dropdown to auto-fill, place signature
                fields on the PDF, then save.
              </p>
            </div>
          </div>
          <div className="signflow_editor_header_actions">
            <span className="signflow_editor_badge">Draft</span>
            <button
              type="button"
              className="um_modal_close"
              onClick={() => onCancel?.()}
              aria-label="Close template editor"
              disabled={saving || embedBusy}
            >
              <X size={20} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>

        <div className="signflow_editor_body">
          {canAddInvestorData ? (
            <aside className="signflow_editor_data_panel" aria-label="Investor data fields">
              <div className="signflow_editor_data_panel_head">
                <Link2 size={16} strokeWidth={2} aria-hidden />
                <h3 className="signflow_editor_data_panel_title">
                  Investor data field
                </h3>
              </div>
              <p className="signflow_editor_data_panel_desc">
                Select which investor profile value should auto-populate, choose
                which profiles see it, then add it to the PDF.
              </p>
              <label
                htmlFor={fieldSelectId}
                className="signflow_editor_data_panel_label"
              >
                Choose field
              </label>
              <div
                className="signflow_editor_field_picker"
                ref={fieldPickerRef}
              >
                <button
                  type="button"
                  id={fieldSelectId}
                  className="signflow_editor_field_picker_trigger"
                  aria-haspopup="listbox"
                  aria-expanded={fieldPickerOpen}
                  disabled={embedBusy || sessionLoading || !builderReady}
                  onClick={() => setFieldPickerOpen((open) => !open)}
                >
                  <span
                    className={
                      selectedFieldLabel
                        ? undefined
                        : "signflow_editor_field_picker_placeholder"
                    }
                  >
                    {selectedFieldLabel || "Select investor data…"}
                  </span>
                  <ChevronDown size={16} strokeWidth={2} aria-hidden />
                </button>
                {fieldPickerOpen ? (
                  <div
                    className="signflow_editor_field_picker_menu"
                    role="listbox"
                    aria-label="Investor data fields"
                  >
                    {fieldGroups.map((group) => (
                      <div
                        key={group.section}
                        className="signflow_editor_field_picker_group"
                        role="group"
                        aria-label={group.section}
                      >
                        <div className="signflow_editor_field_picker_group_label">
                          {group.section}
                        </div>
                        {group.fields.map((field: EsignInvestorDataField) => {
                          const selected = field.key === selectedFieldKey
                          return (
                            <button
                              key={field.key}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`signflow_editor_field_picker_option${
                                selected ? " is-selected" : ""
                              }`}
                              onClick={() => {
                                setSelectedFieldKey(field.key)
                                setFieldPickerOpen(false)
                              }}
                            >
                              {field.label}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <fieldset
                className="signflow_editor_data_panel_profiles"
                disabled={embedBusy || sessionLoading || !builderReady}
              >
                <legend
                  id={profileGroupId}
                  className="signflow_editor_data_panel_label"
                >
                  Profiles
                </legend>
                <p className="signflow_editor_data_panel_profiles_hint">
                  Investors only see this field when signing with a selected
                  profile.
                </p>
                <ul
                  className="signflow_editor_data_panel_profile_list"
                  aria-labelledby={profileGroupId}
                >
                  {ESIGN_ENTITY_CATEGORIES.map((profile) => {
                    const checked = selectedProfileIds.includes(profile.id)
                    const inputId = `${profileGroupId}-${profile.id}`
                    return (
                      <li key={profile.id}>
                        <label
                          htmlFor={inputId}
                          className="signflow_editor_data_panel_profile_option"
                          title={profile.label}
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleProfile(profile.id)}
                          />
                          <span>
                            {ESIGN_ENTITY_CATEGORY_COLUMN_LABELS[profile.id] ??
                              profile.label}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
              <button
                type="button"
                className="signflow_editor_btn signflow_editor_btn--primary signflow_editor_data_panel_add"
                disabled={
                  !selectedFieldKey ||
                  selectedProfileIds.length === 0 ||
                  embedBusy ||
                  sessionLoading ||
                  !builderReady
                }
                onClick={() => void handleAddInvestorDataField()}
              >
                {embedBusy ? (
                  <Loader2
                    className="signflow_editor_spin"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <Plus size={16} strokeWidth={2} aria-hidden />
                )}
                {embedBusy ? "Adding…" : "Add field to PDF"}
              </button>
              <p className="signflow_editor_data_panel_hint">
                The same investor data can be added more than once. The PDF
                updates in the background — then drag the new field into place
                and save.
              </p>
            </aside>
          ) : null}

          <div className="signflow_editor_workspace">
            {showWorkspaceLoading ? (
              <div className="signflow_editor_loading" role="status" aria-live="polite">
                <div className="signflow_editor_loading_card">
                  <Loader2
                    className="signflow_editor_spin"
                    size={28}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <p className="signflow_editor_loading_title">
                    Opening document editor
                  </p>
                  <p className="signflow_editor_loading_text">
                    {showWorkspaceLoading && !iframeLoaded && !sessionLoading
                      ? "Loading your PDF…"
                      : "Preparing your template…"}
                  </p>
                </div>
              </div>
            ) : null}

            {activeSrc ? (
              <div className="signflow_editor_iframe_stack">
                <iframe
                  ref={iframeRef}
                  key={viewNonce}
                  src={activeSrc}
                  title={`SignFlow template editor — ${displayTitle}`}
                  className="signflow_editor_iframe"
                  onLoad={() => setIframeLoaded(true)}
                  onError={() => {
                    onError?.("Could not load the SignFlow template editor")
                  }}
                />
                {preloadSrc && preloadNonce != null ? (
                  <iframe
                    key={preloadNonce}
                    src={preloadSrc}
                    title={`SignFlow template editor refresh — ${displayTitle}`}
                    className="signflow_editor_iframe signflow_editor_iframe--preload"
                    aria-hidden
                    tabIndex={-1}
                    onLoad={() => promotePreloadedEmbed(preloadNonce)}
                    onError={() => {
                      setPreloadNonce(null)
                      onError?.(
                        "Could not refresh the SignFlow template editor after adding a field",
                      )
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="signflow_editor_footer">
          <div className="signflow_editor_footer_hint">
            <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
            <span>
              Add investor data from the left panel · click the PDF for signatures ·
              save when ready
            </span>
          </div>
          <div className="signflow_editor_footer_actions">
            <button
              type="button"
              className="signflow_editor_btn signflow_editor_btn--secondary"
              onClick={() => onCancel?.()}
              disabled={saving || embedBusy}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Cancel
            </button>
            <button
              type="button"
              className="signflow_editor_btn signflow_editor_btn--primary"
              onClick={handleSave}
              disabled={saveDisabled}
              title={
                !allowSave
                  ? EMBED_SAVE_DISABLED_HINT
                  : "Save your field changes to this template"
              }
            >
              {saving ? (
                <Loader2
                  className="signflow_editor_spin"
                  size={17}
                  strokeWidth={2}
                  aria-hidden
                />
              ) : (
                <Save size={17} strokeWidth={2} aria-hidden />
              )}
              Save template
            </button>
          </div>
        </footer>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
