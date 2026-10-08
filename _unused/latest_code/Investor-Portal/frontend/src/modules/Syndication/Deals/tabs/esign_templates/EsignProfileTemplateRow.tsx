import { FileCheck, FilePen } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "@/common/components/Toast"
import {
  dealAssetRelativePathToUploadsUrl,
  normalizeDealGallerySrc,
} from "@/common/utils/apiBaseUrl"
import {
  fetchDealEsignTemplateViewUrl,
  type DealEsignTemplateFileRecord,
} from "@/modules/Syndication/Deals/api/dealsApi"
import type { EsignEntityCategory } from "./esignEntityCategories"
import { EsignProfileTemplateRowActions } from "./EsignProfileTemplateRowActions"
import { EsignSigningWorkflowCell } from "./EsignSigningWorkflowCell"
import { esignTemplateDisplayName } from "../../utils/esignTemplateDisplay"

function isPdfFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf")
}

function esignFileViewUrl(relativePath: string): string {
  return normalizeDealGallerySrc(dealAssetRelativePathToUploadsUrl(relativePath))
}

function resolveTemplateStatus(
  file: DealEsignTemplateFileRecord,
): "none" | "draft" | "ready" {
  if (file.signflowStatus && file.signflowStatus !== "none") {
    return file.signflowStatus
  }
  return file.dropboxSignStatus ?? "none"
}

function statusLabel(file: DealEsignTemplateFileRecord): string {
  const status = resolveTemplateStatus(file)
  if (status === "ready") return "Ready"
  if (status === "draft") return "Setup incomplete — click Edit"
  return "Not configured"
}

export function EsignProfileTemplateEmptyRow({
  category,
  showStatusColumn,
}: {
  category: EsignEntityCategory
  showStatusColumn: boolean
}) {
  return (
    <tr className="deal_esign_profiles_row deal_esign_profiles_row_empty">
      <th scope="row" className="deal_esign_profiles_cell_profile">
        {category.label}
      </th>
      <td className="deal_esign_profiles_cell_muted" colSpan={showStatusColumn ? 5 : 4}>
        No template
      </td>
    </tr>
  )
}

function EsignProfileTemplateFileRow({
  category,
  dealId,
  file,
  canManageDocuments,
  uploading,
  savingTemplate,
  dropboxSignConfigured,
  esignProvider,
  onRemove,
  onEditTemplate,
  onRenameTemplate,
}: {
  category: EsignEntityCategory
  dealId: string
  file: DealEsignTemplateFileRecord
  canManageDocuments: boolean
  uploading: boolean
  savingTemplate: boolean
  dropboxSignConfigured: boolean
  esignProvider: "signflow" | "dropbox" | null
  onRemove: () => void
  onEditTemplate: () => void
  onRenameTemplate: () => void
}) {
  const isPdf = isPdfFileName(file.originalName)
  const templateStatus = resolveTemplateStatus(file)
  const ready = templateStatus === "ready"
  const notConfigured = templateStatus === "none"
  const actionLabel = notConfigured ? "Configure" : "Edit"
  const staticViewUrl = esignFileViewUrl(file.relativePath)
  const displayName = esignTemplateDisplayName(file)
  const showFileName =
    file.originalName.trim() &&
    displayName.toLowerCase() !== file.originalName.trim().toLowerCase()
  const hasIncludes = file.includesW9Appendix || file.includeQuestionnaire

  const [openingView, setOpeningView] = useState(false)

  const handleView = useCallback(async () => {
    setOpeningView(true)
    try {
      const result = await fetchDealEsignTemplateViewUrl(dealId, file.id)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      const url = normalizeDealGallerySrc(result.viewUrl) || staticViewUrl
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer")
      } else {
        toast.error("Preview URL is not available")
      }
    } finally {
      setOpeningView(false)
    }
  }, [dealId, file.id, staticViewUrl])

  const canView = Boolean(staticViewUrl) || isPdf

  return (
    <tr className="deal_esign_profiles_row">
      <th scope="row" className="deal_esign_profiles_cell_profile" title={category.label}>
        {category.label}
      </th>
      <td className="deal_esign_profiles_cell_name">
        <span className="deal_esign_file_name" title={displayName}>
          {displayName}
        </span>
        {showFileName ? (
          <span className="deal_esign_file_original" title={file.originalName}>
            {file.originalName}
          </span>
        ) : null}
      </td>
      <td className="deal_esign_profiles_cell_includes">
        {hasIncludes ? (
          <div className="deal_esign_doc_badges">
            {file.includesW9Appendix ? (
              <span className="deal_esign_file_badge deal_esign_file_badge_w9">+ W-9</span>
            ) : null}
            {file.includeQuestionnaire ? (
              <span className="deal_esign_file_badge">Questionnaire</span>
            ) : null}
          </div>
        ) : (
          <span className="deal_esign_doc_muted">—</span>
        )}
      </td>
      <td className="deal_esign_profiles_cell_workflow">
        <EsignSigningWorkflowCell file={file} esignProvider={esignProvider} />
      </td>
      {canManageDocuments ? (
        <td className="deal_esign_profiles_cell_status">
          {!ready && dropboxSignConfigured && isPdf && !uploading && !savingTemplate ? (
            <button
              type="button"
              className={`deal_esign_file_status deal_esign_file_status_${templateStatus} deal_esign_file_status_action`}
              title={
                notConfigured
                  ? "Open SignFlow editor to configure this template"
                  : "Open SignFlow editor to edit signature fields"
              }
              disabled={uploading || savingTemplate}
              onClick={onEditTemplate}
            >
              {ready ? (
                <FileCheck size={12} strokeWidth={2} aria-hidden />
              ) : (
                <FilePen size={12} strokeWidth={2} aria-hidden />
              )}
              {statusLabel(file)}
            </button>
          ) : (
            <span
              className={`deal_esign_file_status deal_esign_file_status_${templateStatus}`}
            >
              {ready ? (
                <FileCheck size={12} strokeWidth={2} aria-hidden />
              ) : (
                <FilePen size={12} strokeWidth={2} aria-hidden />
              )}
              {statusLabel(file)}
            </span>
          )}
        </td>
      ) : null}
      <td className="deal_esign_profiles_cell_actions">
        <EsignProfileTemplateRowActions
          templateLabel={displayName}
          disabled={uploading || savingTemplate}
          viewDisabled={openingView}
          viewLabel={openingView ? "Opening…" : "View"}
          canView={canView}
          canManage={canManageDocuments}
          canEditInDropbox={dropboxSignConfigured && isPdf}
          editLabel={actionLabel}
          editTitle={
            notConfigured
              ? "Open Dropbox Sign editor to configure this template"
              : "Open Dropbox Sign editor to edit signature fields"
          }
          canRename={dropboxSignConfigured && isPdf && ready}
          showDropboxNotConfigured={!dropboxSignConfigured && isPdf}
          onView={handleView}
          onEditTemplate={onEditTemplate}
          onRenameTemplate={onRenameTemplate}
          onRemove={onRemove}
        />
      </td>
    </tr>
  )
}

export function EsignProfileTemplateRow({
  category,
  dealId,
  file,
  canManageDocuments,
  uploading,
  savingTemplate,
  dropboxSignConfigured,
  esignProvider,
  onRemove,
  onEditTemplate,
  onRenameTemplate,
}: {
  category: EsignEntityCategory
  dealId: string
  file: DealEsignTemplateFileRecord | null
  canManageDocuments: boolean
  uploading: boolean
  savingTemplate: boolean
  dropboxSignConfigured: boolean
  esignProvider: "signflow" | "dropbox" | null
  onRemove: () => void
  onEditTemplate: () => void
  onRenameTemplate: () => void
}) {
  if (!file) {
    return (
      <EsignProfileTemplateEmptyRow
        category={category}
        showStatusColumn={canManageDocuments}
      />
    )
  }

  return (
    <EsignProfileTemplateFileRow
      category={category}
      dealId={dealId}
      file={file}
      canManageDocuments={canManageDocuments}
      uploading={uploading}
      savingTemplate={savingTemplate}
      dropboxSignConfigured={dropboxSignConfigured}
      esignProvider={esignProvider}
      onRemove={onRemove}
      onEditTemplate={onEditTemplate}
      onRenameTemplate={onRenameTemplate}
    />
  )
}
