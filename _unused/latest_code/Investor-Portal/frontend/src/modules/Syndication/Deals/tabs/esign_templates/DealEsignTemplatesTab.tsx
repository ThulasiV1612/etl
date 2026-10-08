import { ClipboardList, Upload, Users } from "lucide-react"

import {

  useCallback,

  useEffect,

  useMemo,

  useState,

} from "react"

import { DropboxSignEmbeddedEditor } from "@/common/components/dropbox-sign-embedded"
import { SignFlowEmbeddedEditor } from "@/common/components/signflow-embedded"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import { TableHScrollShell } from "@/common/components/data-table/TableHScrollShell"

import { toast } from "@/common/components/Toast"

import {

  deleteDealEsignTemplateFile,

  fetchDealEsignDropboxSignConfig,

  notifyDealEsignTemplatesChanged,

  patchDealEsignTemplateName,

  postDealEsignCompleteEmbeddedTemplate,

  postDealEsignEmbeddedDraft,

  postDealEsignTemplateUploads,

  type DealEsignTemplateFileRecord,

  fetchDealEsignTemplates,

} from "@/modules/Syndication/Deals/api/dealsApi"

import { EsignTemplateDeleteConfirmModal } from "./EsignTemplateDeleteConfirmModal"
import {
  EsignCreateTemplateModal,
  type EsignCreateTemplateSubmit,
} from "./EsignCreateTemplateModal"
import { EsignProfileTemplateRow } from "./EsignProfileTemplateRow"
import { EsignTemplateRenameModal } from "./EsignTemplateRenameModal"
import { esignTemplateDisplayName, toastTemplateEditorOpenError } from "../../utils/esignTemplateDisplay"
import { DealEsignTemplatesQuestionnaireTab } from "./DealEsignTemplatesQuestionnaireTab"
import { EsignTemplateStageNotice } from "./EsignTemplateStageNotice"
import {
  ESIGN_ENTITY_CATEGORIES,
  type EsignEntityCategory,
} from "./esignEntityCategories"
import {
  dealUsesLegacyProfileTemplates,
  dealUsesUnifiedEsignTemplate,
  ESIGN_UNIFIED_CATEGORY,
  ESIGN_UNIFIED_CATEGORY_ID,
} from "../../utils/esignUnifiedTemplate"
import { resolveEsignTemplateStageNoticeVariant } from "../../utils/esignTemplateStageNotice"
import "@/common/components/data-table/data-table.css"
import "./deal-esign-templates.css"

export type { EsignEntityCategory }
export { ESIGN_ENTITY_CATEGORIES }

type EsignTemplatesSubTab = "profiles" | "questionnaire"

/** Logical folder label for e-signed templates (display + future API paths). */

export const ESIGN_FOLDER_SLUG = "e-signed"



interface DealEsignTemplatesTabProps {

  dealId: string

  offeringInvestorPreviewJson?: string | null

  dealStage?: string | null

  offeringStatus?: string | null

  /** When false, upload UI is hidden (lead or admin sponsor only). */

  canUploadDocuments?: boolean

}



type EmbeddedEditorSession = {
  fileId: string
  categoryId: string
  provider?: "signflow" | "dropbox"
  editUrl: string
  clientId: string
  testMode: boolean
  templateId: string
  templateTitle?: string
  embedApiKey?: string | null
  appBaseUrl?: string | null
  sessionLoading?: boolean
}

function hasAnyEsignTemplateFiles(
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
): boolean {
  return Object.values(filesByCategory).some((files) => files.length > 0)
}

function EsignProfilesTableLoader({
  canUploadDocuments,
}: {
  canUploadDocuments: boolean
}) {
  return (
    <div className="deal_esign_profiles_table_wrap deal_esign_profiles_table_wrap_loading">
      <TableHScrollShell active={false} ariaLabel="eSign template columns">
      <table
        className="deal_esign_profiles_table deal_esign_profiles_table_skeleton"
        aria-hidden
      >
        <thead>
          <tr>
            <th scope="col" className="deal_esign_profiles_th_profile">
              Profile
            </th>
            <th scope="col" className="deal_esign_profiles_th_name">
              Template name
            </th>
            <th scope="col" className="deal_esign_profiles_th_includes">
              Includes
            </th>
            <th scope="col" className="deal_esign_profiles_th_workflow">
              Signing order
            </th>
            {canUploadDocuments ? (
              <th scope="col" className="deal_esign_profiles_th_status">
                Status
              </th>
            ) : null}
            <th scope="col" className="deal_esign_profiles_th_actions">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {ESIGN_ENTITY_CATEGORIES.map((cat) => (
            <tr key={cat.id} className="deal_esign_profiles_skeleton_row">
              <th scope="row" className="deal_esign_profiles_cell_profile">
                <span className="deal_esign_profiles_skeleton deal_esign_profiles_skeleton_profile" />
              </th>
              <td className="deal_esign_profiles_cell_name">
                <span className="deal_esign_profiles_skeleton deal_esign_profiles_skeleton_name" />
              </td>
              <td className="deal_esign_profiles_cell_includes">
                <span className="deal_esign_profiles_skeleton deal_esign_profiles_skeleton_includes" />
              </td>
              <td className="deal_esign_profiles_cell_workflow">
                <span className="deal_esign_profiles_skeleton deal_esign_profiles_skeleton_workflow" />
              </td>
              {canUploadDocuments ? (
                <td className="deal_esign_profiles_cell_status">
                  <span className="deal_esign_profiles_skeleton deal_esign_profiles_skeleton_status" />
                </td>
              ) : null}
              <td className="deal_esign_profiles_cell_actions">
                <span className="deal_esign_profiles_skeleton deal_esign_profiles_skeleton_actions" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </TableHScrollShell>
      <div
        className="deal_esign_profiles_table_loading"
        role="status"
        aria-live="polite"
        aria-label="Loading eSign templates"
      >
        <div className="data_table_loader_spinner" aria-hidden />
        <span className="deal_esign_profiles_table_loading_text">
          Loading eSign templates…
        </span>
      </div>
    </div>
  )
}

function EsignTemplatesEmptyState({
  canUpload,
  onCreateTemplate,
  uploading,
}: {
  canUpload: boolean
  onCreateTemplate: () => void
  uploading?: boolean
}) {
  return (
    <div className="deal_esign_empty" role="status">
      {canUpload ? (
        <button
          type="button"
          className="deal_esign_empty_dropzone"
          onClick={onCreateTemplate}
          disabled={uploading}
          aria-label="Create first eSign template"
        >
          <Upload size={22} strokeWidth={2} aria-hidden />
          <span className="deal_esign_empty_dropzone_title">Click to create template</span>
        </button>
      ) : (
        <p className="deal_esign_empty_readonly">
          No eSign templates have been uploaded for this deal yet.
        </p>
      )}
    </div>
  )
}

function DealEsignTemplatesProfilesTab({

  dealId,

  offeringInvestorPreviewJson,

  canUploadDocuments = true,

}: DealEsignTemplatesTabProps) {

  const [filesByCategory, setFilesByCategory] = useState<

    Record<string, DealEsignTemplateFileRecord[]>

  >({})

  const [loading, setLoading] = useState(true)

  const [uploading, setUploading] = useState(false)

  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null)

  const [esignConfigured, setEsignConfigured] = useState(false)
  const [esignProvider, setEsignProvider] = useState<"signflow" | "dropbox" | null>(
    null,
  )
  const [esignAppBaseUrl, setEsignAppBaseUrl] = useState<string | null>(null)
  const [esignTestMode, setEsignTestMode] = useState(false)

  const [embeddedSession, setEmbeddedSession] = useState<EmbeddedEditorSession | null>(

    null,

  )

  const [createModalOpen, setCreateModalOpen] = useState(false)

  const [deletePending, setDeletePending] = useState<{
    fileId: string
    displayName: string
  } | null>(null)

  const [renamePending, setRenamePending] = useState<{
    fileId: string
    templateName: string
  } | null>(null)

  const hasAnyDocuments = useMemo(
    () => hasAnyEsignTemplateFiles(filesByCategory),
    [filesByCategory],
  )

  const usesUnifiedTemplate = useMemo(
    () => dealUsesUnifiedEsignTemplate(filesByCategory),
    [filesByCategory],
  )

  const usesLegacyProfileTemplates = useMemo(
    () => dealUsesLegacyProfileTemplates(filesByCategory),
    [filesByCategory],
  )

  const unifiedTemplateFile = useMemo(
    () => (filesByCategory[ESIGN_UNIFIED_CATEGORY_ID] ?? [])[0] ?? null,
    [filesByCategory],
  )

  const reload = useCallback(async () => {

    const result = await fetchDealEsignTemplates(dealId)

    if (result.ok) {

      setFilesByCategory(result.filesByCategory)

    } else {

      toast.error("Could not load eSign templates", result.message)

    }

    return result

  }, [dealId])



  useEffect(() => {

    let cancelled = false

    void (async () => {

      setLoading(true)

      const cfg = await fetchDealEsignDropboxSignConfig()

      if (!cancelled && cfg.ok) {
        setEsignConfigured(cfg.configured)
        setEsignProvider(cfg.provider ?? null)
        setEsignAppBaseUrl(cfg.appBaseUrl ?? null)
        setEsignTestMode(Boolean(cfg.testMode))
      }

      await reload()

      if (!cancelled) setLoading(false)

    })()

    return () => {

      cancelled = true

    }

  }, [reload])

  useEffect(() => {
    const base = esignAppBaseUrl?.trim()
    if (!base || typeof document === "undefined") return
    let link = document.querySelector<HTMLLinkElement>(
      'link[data-esign-signflow-preconnect="true"]',
    )
    if (!link) {
      link = document.createElement("link")
      link.rel = "preconnect"
      link.dataset.esignSignflowPreconnect = "true"
      document.head.appendChild(link)
    }
    link.href = base
  }, [esignAppBaseUrl])

  const openEmbeddedTemplateEditor = useCallback(
    (file: Pick<DealEsignTemplateFileRecord, "id" | "categoryId">, displayName: string) => {
      if (!canUploadDocuments) return
      if (!esignConfigured) {
        toast.error(
          "eSign not configured",
          "Set SIGNFLOW_API_BASE_URL and SIGNFLOW_API_KEY in backend .env (see API_INTEGRATION.md), then restart the API.",
        )
        return
      }

      const title = displayName.trim() || "Template"

      setEmbeddedSession({
        fileId: file.id,
        categoryId: file.categoryId,
        provider: esignProvider ?? undefined,
        editUrl: "",
        clientId: "",
        testMode: esignTestMode,
        templateId: "",
        templateTitle: title,
        sessionLoading: true,
      })

      void (async () => {
        setSavingTemplateId(file.id)
        try {
          const draft = await postDealEsignEmbeddedDraft(dealId, file.id, {
            title,
          })

          if (!draft.ok) {
            setEmbeddedSession(null)
            toastTemplateEditorOpenError(draft.message)
            return
          }

          setFilesByCategory(draft.filesByCategory)

          setEmbeddedSession({
            fileId: file.id,
            categoryId: file.categoryId,
            provider: draft.provider ?? esignProvider ?? undefined,
            editUrl: draft.editUrl,
            clientId: draft.clientId,
            testMode: draft.testMode,
            templateId: draft.templateId,
            templateTitle: title,
            embedApiKey: draft.embedApiKey,
            appBaseUrl: draft.appBaseUrl,
            sessionLoading: false,
          })
        } finally {
          setSavingTemplateId(null)
        }
      })()
    },
    [
      canUploadDocuments,
      dealId,
      esignConfigured,
      esignProvider,
      esignTestMode,
    ],
  )

  const onCreateTemplate = useCallback(() => {
    if (!canUploadDocuments) return
    if (usesUnifiedTemplate || usesLegacyProfileTemplates) {
      toast.error(
        "Template already exists",
        "Remove the existing template before uploading another.",
      )
      return
    }
    setCreateModalOpen(true)
  }, [canUploadDocuments, usesLegacyProfileTemplates, usesUnifiedTemplate])

  const closeCreateModal = useCallback(() => {
    if (uploading) return
    setCreateModalOpen(false)
  }, [uploading])

  const onConfirmCreateTemplate = useCallback(
    async (data: EsignCreateTemplateSubmit) => {
      const categoryId = data.categoryId.trim() || ESIGN_UNIFIED_CATEGORY_ID
      const existing = filesByCategory[categoryId] ?? []
      if (existing.length > 0) {
        toast.error(
          "Upload not allowed",
          "This deal already has a template. Remove it to upload a new one.",
        )
        return
      }

      setUploading(true)
      try {
        const result = await postDealEsignTemplateUploads(dealId, categoryId, [
          {
            file: data.file,
            meta: {
              templateName: data.templateName,
              includeQuestionnaire: data.includeQuestionnaire,
              signflowWorkflowType: data.signflowWorkflowType,
              signflowSigningOrder: data.signflowSigningOrder,
            },
          },
        ])
        if (result.ok) {
          setFilesByCategory(result.filesByCategory)
          notifyDealEsignTemplatesChanged(dealId)
          setCreateModalOpen(false)
          const uploaded = result.filesByCategory[categoryId]?.[0]
          if (uploaded) {
            openEmbeddedTemplateEditor(uploaded, data.templateName.trim())
          } else {
            toast.success("Template created")
          }
        } else {
          toast.error(result.message || "Upload failed", "Could not create the eSign template.")
        }
      } finally {
        setUploading(false)
      }
    },
    [dealId, filesByCategory, openEmbeddedTemplateEditor],
  )



  const onRequestRemoveFile = useCallback(
    (_categoryId: string, fileId: string) => {
      if (!canUploadDocuments) return
      const file = Object.values(filesByCategory)
        .flat()
        .find((f) => f.id === fileId)
      if (!file) return
      setDeletePending({
        fileId,
        displayName: esignTemplateDisplayName(file),
      })
    },
    [canUploadDocuments, filesByCategory],
  )

  const onConfirmRemoveFile = useCallback(() => {
    if (!deletePending) return
    void (async () => {
      setUploading(true)
      try {
        const result = await deleteDealEsignTemplateFile(
          dealId,
          deletePending.fileId,
        )
        if (result.ok) {
          setFilesByCategory(result.filesByCategory)
          notifyDealEsignTemplatesChanged(dealId)
          setDeletePending(null)
          toast.success("Template removed")
        } else {
          toast.error("Could not remove file", result.message)
        }
      } finally {
        setUploading(false)
      }
    })()
  }, [dealId, deletePending])



  const onRenameTemplate = useCallback(
    (_categoryId: string, file: DealEsignTemplateFileRecord) => {
      if (!canUploadDocuments) return
      if (file.signflowStatus !== "ready" && file.dropboxSignStatus !== "ready") return
      setRenamePending({
        fileId: file.id,
        templateName: esignTemplateDisplayName(file),
      })
    },
    [canUploadDocuments],
  )

  const onEditTemplate = useCallback(

    (_categoryId: string, file: DealEsignTemplateFileRecord) => {

      openEmbeddedTemplateEditor(file, esignTemplateDisplayName(file))

    },

    [openEmbeddedTemplateEditor],

  )

  const onConfirmRenameTemplate = useCallback(
    (templateName: string) => {
      if (!renamePending) return
      void (async () => {
        setSavingTemplateId(renamePending.fileId)
        try {
          const result = await patchDealEsignTemplateName(
            dealId,
            renamePending.fileId,
            templateName,
          )
          if (result.ok) {
            setFilesByCategory(result.filesByCategory)
            notifyDealEsignTemplatesChanged(dealId)
            setRenamePending(null)
            toast.success("Template name updated")
          } else {
            toast.error("Could not update template name", result.message)
          }
        } finally {
          setSavingTemplateId(null)
        }
      })()
    },
    [dealId, renamePending],
  )



  const handleEmbeddedTemplateSaved = useCallback(

    (data: { templateId: string; templateInfo?: { title?: string } }) => {

      if (!embeddedSession) return

      void (async () => {

        const result = await postDealEsignCompleteEmbeddedTemplate(

          dealId,

          embeddedSession.fileId,

          {

            templateId: data.templateId,

            title: data.templateInfo?.title,

          },

        )

        setEmbeddedSession(null)

        if (result.ok) {

          setFilesByCategory(result.filesByCategory)

          notifyDealEsignTemplatesChanged(dealId)

          const providerLabel =
            embeddedSession.provider === "signflow" ? "SignFlow" : "Dropbox Sign"

          toast.success("Template saved", `${providerLabel} template is ready for this deal.`)

        } else {

          toast.error("Could not save template", result.message)

        }

      })()

    },

    [dealId, embeddedSession],

  )



  return (

    <div

      className={`deal_esign_root${loading ? " deal_esign_root_loading" : ""}`}

      aria-busy={loading || uploading}

    >

      {!canUploadDocuments ? (

        <p className="deal_esign_readonly_banner" role="note">

          You can view eSign templates on this deal. Upload, edit, and delete are
          restricted to the lead or admin sponsor.

        </p>

      ) : null}

      {/* Dropbox Sign intro — hidden per product request
      ) : (
        <p className="deal_esign_intro" role="note">
          Upload a PDF, then click <strong>Save template</strong> to open the Dropbox Sign
          editor, place signature fields, and save the template for this deal.
        </p>
      )}
      */}



      {loading ? (
        <EsignProfilesTableLoader canUploadDocuments={canUploadDocuments} />
      ) : !hasAnyDocuments ? (
        <EsignTemplatesEmptyState
          canUpload={canUploadDocuments}
          uploading={uploading}
          onCreateTemplate={onCreateTemplate}
        />
      ) : (
        <>
          {usesUnifiedTemplate && unifiedTemplateFile ? (
            <>
              <p className="deal_esign_unified_hint" role="note">
                Place fields for every investor profile in one editor session. Use{" "}
                <strong>Preview Profile Type</strong> in the editor to check field visibility
                per profile — investors only see fields scoped to their profile when signing.
              </p>
              <div className="deal_esign_profiles_table_wrap">
                <TableHScrollShell ariaLabel="eSign template columns">
                <table className="deal_esign_profiles_table">
                  <thead>
                    <tr>
                      <th scope="col" className="deal_esign_profiles_th_profile">
                        Scope
                      </th>
                      <th scope="col" className="deal_esign_profiles_th_name">
                        Template name
                      </th>
                      <th scope="col" className="deal_esign_profiles_th_includes">
                        Includes
                      </th>
                      <th scope="col" className="deal_esign_profiles_th_workflow">
                        Signing order
                      </th>
                      {canUploadDocuments ? (
                        <th scope="col" className="deal_esign_profiles_th_status">
                          Status
                        </th>
                      ) : null}
                      <th scope="col" className="deal_esign_profiles_th_actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <EsignProfileTemplateRow
                      category={ESIGN_UNIFIED_CATEGORY}
                      dealId={dealId}
                      file={unifiedTemplateFile}
                      canManageDocuments={canUploadDocuments}
                      uploading={uploading}
                      savingTemplate={savingTemplateId === unifiedTemplateFile.id}
                      dropboxSignConfigured={esignConfigured}
                      esignProvider={esignProvider}
                      onRemove={() => {
                        onRequestRemoveFile(ESIGN_UNIFIED_CATEGORY_ID, unifiedTemplateFile.id)
                      }}
                      onEditTemplate={() => {
                        onEditTemplate(ESIGN_UNIFIED_CATEGORY_ID, unifiedTemplateFile)
                      }}
                      onRenameTemplate={() => {
                        onRenameTemplate(ESIGN_UNIFIED_CATEGORY_ID, unifiedTemplateFile)
                      }}
                    />
                  </tbody>
                </table>
                </TableHScrollShell>
              </div>
            </>
          ) : usesLegacyProfileTemplates ? (
            <>
              <p className="deal_esign_unified_hint deal_esign_unified_hint--legacy" role="note">
                This deal uses legacy per-profile templates. Create a new unified template
                after removing these, or continue editing profile-specific documents below.
              </p>
              <div className="deal_esign_profiles_table_wrap">
                <TableHScrollShell ariaLabel="eSign template columns">
                <table className="deal_esign_profiles_table">
                  <thead>
                    <tr>
                      <th scope="col" className="deal_esign_profiles_th_profile">
                        Profile
                      </th>
                      <th scope="col" className="deal_esign_profiles_th_name">
                        Template name
                      </th>
                      <th scope="col" className="deal_esign_profiles_th_includes">
                        Includes
                      </th>
                      <th scope="col" className="deal_esign_profiles_th_workflow">
                        Signing order
                      </th>
                      {canUploadDocuments ? (
                        <th scope="col" className="deal_esign_profiles_th_status">
                          Status
                        </th>
                      ) : null}
                      <th scope="col" className="deal_esign_profiles_th_actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ESIGN_ENTITY_CATEGORIES.map((cat) => {
                      const file = (filesByCategory[cat.id] ?? [])[0] ?? null
                      return (
                        <EsignProfileTemplateRow
                          key={cat.id}
                          category={cat}
                          dealId={dealId}
                          file={file}
                          canManageDocuments={canUploadDocuments}
                          uploading={uploading}
                          savingTemplate={file != null && savingTemplateId === file.id}
                          dropboxSignConfigured={esignConfigured}
                          esignProvider={esignProvider}
                          onRemove={() => {
                            if (file) onRequestRemoveFile(cat.id, file.id)
                          }}
                          onEditTemplate={() => {
                            if (file) onEditTemplate(cat.id, file)
                          }}
                          onRenameTemplate={() => {
                            if (file) onRenameTemplate(cat.id, file)
                          }}
                        />
                      )
                    })}
                  </tbody>
                </table>
                </TableHScrollShell>
              </div>
            </>
          ) : null}
        </>
      )}

      <EsignCreateTemplateModal
        open={createModalOpen}
        dealId={dealId}
        offeringInvestorPreviewJson={offeringInvestorPreviewJson}
        unifiedWorkflow
        uploading={uploading}
        onClose={closeCreateModal}
        onConfirm={onConfirmCreateTemplate}
      />

      <EsignTemplateDeleteConfirmModal
        open={deletePending != null}
        displayName={deletePending?.displayName ?? ""}
        busy={uploading}
        onCancel={() => {
          if (!uploading) setDeletePending(null)
        }}
        onConfirm={onConfirmRemoveFile}
      />

      <EsignTemplateRenameModal
        open={renamePending != null}
        initialName={renamePending?.templateName ?? ""}
        busy={Boolean(renamePending && savingTemplateId === renamePending.fileId)}
        onClose={() => {
          if (!savingTemplateId) setRenamePending(null)
        }}
        onSave={onConfirmRenameTemplate}
      />

      {embeddedSession ? (
        embeddedSession.provider !== "dropbox" ? (
          <SignFlowEmbeddedEditor
            key={`${embeddedSession.fileId}-${embeddedSession.editUrl || "loading"}`}
            editUrl={embeddedSession.editUrl}
            documentId={embeddedSession.templateId}
            templateTitle={embeddedSession.templateTitle}
            sessionLoading={embeddedSession.sessionLoading}
            dealId={dealId}
            fileId={embeddedSession.fileId}
            onTemplateSaved={handleEmbeddedTemplateSaved}
            onCancel={() => setEmbeddedSession(null)}
            onError={(message) => {
              setEmbeddedSession(null)
              toast.error("SignFlow", message)
            }}
          />
        ) : (
          <DropboxSignEmbeddedEditor
            key={`${embeddedSession.fileId}-${embeddedSession.editUrl}`}
            editUrl={embeddedSession.editUrl}
            clientId={embeddedSession.clientId}
            testMode={embeddedSession.testMode}
            onTemplateSaved={handleEmbeddedTemplateSaved}
            onCancel={() => setEmbeddedSession(null)}
            onError={(message) => {
              setEmbeddedSession(null)
              toast.error("Dropbox Sign", message)
            }}
          />
        )
      ) : null}

    </div>

  )

}

export function DealEsignTemplatesTab({
  dealId,
  offeringInvestorPreviewJson,
  dealStage,
  offeringStatus,
  canUploadDocuments = true,
}: DealEsignTemplatesTabProps) {
  const [activeSubTab, setActiveSubTab] =
    useState<EsignTemplatesSubTab>("profiles")

  const stageNoticeVariant = useMemo(
    () => resolveEsignTemplateStageNoticeVariant(dealStage, offeringStatus),
    [dealStage, offeringStatus],
  )

  return (
    <div className="deal_esign_tab_shell">
      <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer deal_esign_subtabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row deal_esign_subtabs_row"
            role="tablist"
            aria-label="eSign template sections"
          >
            <button
              type="button"
              id="deal-esign-subtab-profiles"
              role="tab"
              aria-selected={activeSubTab === "profiles"}
              aria-controls="deal-esign-panel-profiles"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "profiles" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveSubTab("profiles")}
            >
              <Users
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Profiles
              </span>
            </button>
            <button
              type="button"
              id="deal-esign-subtab-questionnaire"
              role="tab"
              aria-selected={activeSubTab === "questionnaire"}
              aria-controls="deal-esign-panel-questionnaire"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "questionnaire" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveSubTab("questionnaire")}
            >
              <ClipboardList
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Questionnaire
              </span>
            </button>
          </div>
        </TabsScrollStrip>
      </div>

      {stageNoticeVariant ? (
        <EsignTemplateStageNotice variant={stageNoticeVariant} />
      ) : null}

      <div
        id="deal-esign-panel-profiles"
        role="tabpanel"
        aria-labelledby="deal-esign-subtab-profiles"
        hidden={activeSubTab !== "profiles"}
        className="deal_esign_subtab_panel"
      >
        {activeSubTab === "profiles" ? (
          <DealEsignTemplatesProfilesTab
            dealId={dealId}
            offeringInvestorPreviewJson={offeringInvestorPreviewJson}
            canUploadDocuments={canUploadDocuments}
          />
        ) : null}
      </div>

      <div
        id="deal-esign-panel-questionnaire"
        role="tabpanel"
        aria-labelledby="deal-esign-subtab-questionnaire"
        hidden={activeSubTab !== "questionnaire"}
        className="deal_esign_subtab_panel"
      >
        {activeSubTab === "questionnaire" ? (
          <DealEsignTemplatesQuestionnaireTab
            dealId={dealId}
            canEdit={canUploadDocuments}
          />
        ) : null}
      </div>
    </div>
  )
}


