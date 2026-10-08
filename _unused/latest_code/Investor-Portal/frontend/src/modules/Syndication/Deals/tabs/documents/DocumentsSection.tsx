import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileSignature,
  Link2,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal, flushSync } from "react-dom"
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail"
import { getSessionUserId } from "@/common/auth/sessionUserId"
import { isPlatformAdmin } from "@/common/auth/roleUtils"
import { ConfirmDeleteModal } from "@/common/components/ConfirmDeleteModal"
import { FormHeadingWithInfo } from "@/common/components/form-heading/FormHeadingWithInfo"
import {
  FormTooltip,
  type FormTooltipPanelAlign,
} from "../../../../../common/components/form-tooltip/FormTooltip"
import { dealAssetRelativePathToUploadsUrl } from "../../../../../common/utils/apiBaseUrl"
import { formatDateDdMmmYyyy } from "../../../../../common/utils/formatDateDisplay"
import "../../deals-list.css"
import {
  fetchDealById,
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealMembers,
  DEAL_OFFERING_DOCUMENT_ACCEPT,
  DEAL_OFFERING_DOCUMENT_LIMITS_HINT,
  DEAL_OFFERING_DOCUMENT_TYPES_LABEL,
  dealOfferingDocumentRejectMessage,
  dealOfferingDocumentTooLargeMessage,
  isDealOfferingDocumentFile,
  MAX_DEAL_OFFERING_DOCUMENT_FILE_BYTES,
  MAX_DEAL_OFFERING_DOCUMENT_FILES,
  postDealOfferingDocumentUploads,
  syncCompletedEsignDocumentsToDocumentsTab,
  type DealDetailApi,
} from "../../api/dealsApi"
import {
  buildSponsorUserPickerOptions,
  collectCoSponsorViewerUserIds,
  collectLeadAdminViewerShareIds,
  filterDocumentSectionsForCoSponsor,
  filterDocumentSectionsForLeadOrAdminSponsor,
  filterLpInvestorsForDocumentSharedWith,
  nestedDocumentIdsFromPreviewJson,
  nestedDocumentVisibleToCoSponsor,
  sponsorAudienceSearchBlob,
} from "../../utils/offeringPreviewDocumentAudience"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  DocumentSharedWithPicker,
  sharedAudienceSearchBlob,
  toggleIdInList,
} from "./DocumentSharedWithPicker"
import { DocumentsTableScroll } from "./DocumentsTableScroll"
import { SponsorEsignSignModal } from "./SponsorEsignSignModal"
import {
  parseViewerDealMemberRoleFromApi,
  resolveViewerDealMemberRole,
  viewerIsDealSponsorRole,
  type ViewerDealMemberRole,
} from "../../utils/dealDetailTabVisibility"
import {
  buildDocumentDownloadFilename,
  downloadDocumentFromUrl,
} from "../../utils/documentDownloadFilename"
import {
  DEFAULT_DOCUMENT_SECTION_ID,
  effectiveDocumentSharedWithScope,
  ensureDefaultDocumentSectionInList,
  isBuiltInDocumentSection,
  isBuiltInDocumentSectionLabelEditable,
  isAutoManagedDocumentsSection,
  isEsignTemplateDocumentsSection,
  mergeAutoManagedDocumentSections,
  OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT,
  orderDocumentSections,
  orderDocumentSectionsWithDefaultFirst,
  parseDocumentSectionsFromPreviewJson,
  documentSectionsEqual,
  documentSectionsSnapshot,
  readDealDocumentSectionsForWorkspace,
  sectionDisplayLabel,
  sectionSharedWithDisplay,
  writeOfferingPreviewSections,
  parseOfferingPreviewSectionsJson,
  nestedDocumentHasSharedAudience,
  type NestedPreviewDocument,
  type OfferingPreviewSection,
  type SectionSharedWithScope,
} from "../../utils/offeringPreviewDocSections"
import {
  applyOfferingInvestorPreviewJsonFromServer,
  persistOfferingInvestorPreviewToServer,
  scheduleOfferingInvestorPreviewServerSync,
} from "../../utils/offeringPreviewServerState"
import { isOfferingPreviewHydrated } from "../../utils/offeringPreviewRuntimeStore"

/** After Shared With changes: first audience on a Hidden file → LP portal. */
function patchDocAfterAudienceChange(
  doc: NestedPreviewDocument,
): NestedPreviewDocument {
  const hasAudience = nestedDocumentHasSharedAudience(doc)
  if (!hasAudience) return doc
  if (doc.sharedWithScope === "not_visible" || doc.sharedWithScope == null) {
    return { ...doc, sharedWithScope: "lp_investor" }
  }
  return doc
}

interface DocumentsSectionProps {
  dealId?: string
  dealName?: string | null
  offeringInvestorPreviewJson?: string | null
  investorsListRefreshKey?: number
  viewerDealMemberRole?: ViewerDealMemberRole
  onOfferingPreviewSynced?: (deal: DealDetailApi) => void
}

type DocumentMoveItem = {
  sectionId: string
  docId: string
}

function nestedDocumentNeedsSponsorSign(doc: NestedPreviewDocument): boolean {
  if (!doc.esignSignatureRequestId?.trim()) return false
  if (doc.esignSponsorSigned) return false
  return doc.esignAwaitingSponsorSignature === true || !doc.esignSponsorSigned
}

function DocumentsTableDocName({
  name,
  href,
}: {
  name: string
  href?: string
}) {
  const display = name.trim() || "—"
  if (display === "—")
    return <span className="deal_docs_ui_doc_name_text">{display}</span>

  const text = <span className="deal_docs_ui_doc_name_text">{display}</span>

  if (href) {
    return (
      <div className="deal_docs_ui_doc_name_wrap">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="deal_docs_ui_doc_name_link"
          title={display}
          aria-label={`View ${display}`}
        >
          {text}
        </a>
      </div>
    )
  }

  return (
    <div className="deal_docs_ui_doc_name_wrap">
      <FormTooltip
        className="deal_docs_ui_doc_name_tooltip"
        label={display}
        content={<p className="deal_docs_ui_doc_name_tooltip_p">{display}</p>}
        placement="top"
        panelAlign="start"
        triggerMode="inline"
      >
        {text}
      </FormTooltip>
    </div>
  )
}

function DocumentsTableColumnHeader({
  label,
  hint,
  headerAlign = "left",
  tooltipPlacement = "bottom",
  tooltipPanelAlign,
}: {
  label: string
  hint: ReactNode
  headerAlign?: "left" | "center" | "right"
  tooltipPlacement?: "top" | "bottom"
  tooltipPanelAlign?: FormTooltipPanelAlign
}) {
  const headerAlignClass =
    headerAlign === "right"
      ? " deals_table_col_header_end"
      : headerAlign === "center"
        ? " deals_table_col_header_center"
        : ""
  const panelAlign: FormTooltipPanelAlign =
    tooltipPanelAlign ??
    (headerAlign === "right"
      ? "end"
      : headerAlign === "center"
        ? "center"
        : "start")
  return (
    <span className={`deals_table_col_header${headerAlignClass}`}>
      <span>{label}</span>
      <span
        className="deals_table_header_tooltip_anchor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FormTooltip
          label={`More information: ${label}`}
          content={
            typeof hint === "string" ? (
              <p className="deals_table_header_tooltip_p">{hint}</p>
            ) : (
              <div className="deals_table_header_tooltip_stack">{hint}</div>
            )
          }
          placement={tooltipPlacement}
          panelAlign={panelAlign}
          nativeButtonTrigger={false}
        />
      </span>
    </span>
  )
}

function formatDateAdded(): string {
  return formatDateDdMmmYyyy(new Date())
}

function sectionMatchesLabel(s: OfferingPreviewSection, label: string): boolean {
  const t = label.trim().toLowerCase()
  return (
    s.sectionLabel.trim().toLowerCase() === t ||
    s.documentLabel.trim().toLowerCase() === t
  )
}

function appendOfferingDocumentFilesFromPicker(
  prev: File[],
  input: FileList | File[] | null | undefined,
): { next: File[]; rejectedNames: string[]; error: string | null } {
  const picked = input
    ? Array.isArray(input)
      ? input
      : Array.from(input)
    : []
  if (picked.length === 0) return { next: prev, rejectedNames: [], error: null }
  const rejectedNames: string[] = []
  const oversizedNames: string[] = []
  const accepted: File[] = []
  for (const file of picked) {
    if (!isDealOfferingDocumentFile(file)) {
      rejectedNames.push(file.name)
      continue
    }
    if (
      typeof file.size === "number" &&
      file.size > MAX_DEAL_OFFERING_DOCUMENT_FILE_BYTES
    ) {
      oversizedNames.push(file.name)
      continue
    }
    accepted.push(file)
  }
  const remaining = Math.max(
    0,
    MAX_DEAL_OFFERING_DOCUMENT_FILES - prev.length,
  )
  const kept = accepted.slice(0, remaining)
  const overCount = accepted.length > remaining
  const error =
    rejectedNames.length > 0
      ? dealOfferingDocumentRejectMessage(rejectedNames)
      : oversizedNames.length > 0
        ? dealOfferingDocumentTooLargeMessage(oversizedNames[0]!)
        : overCount
          ? "Too many documents (max 50 per upload)."
          : null
  return { next: [...prev, ...kept], rejectedNames, error }
}

function formatPdfFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function nativeFilePickerCancelProps(onCancel: () => void) {
  return { onCancel } as InputHTMLAttributes<HTMLInputElement>
}

function useNativeFilePickerOpening() {
  const [isOpening, setIsOpening] = useState(false)
  const isOpeningRef = useRef(false)

  const setOpening = useCallback((next: boolean) => {
    isOpeningRef.current = next
    setIsOpening(next)
  }, [])

  const beginOpening = useCallback(() => {
    if (isOpeningRef.current) return false
    flushSync(() => setOpening(true))
    return true
  }, [setOpening])

  const endOpening = useCallback(() => {
    if (isOpeningRef.current) setOpening(false)
  }, [setOpening])

  useEffect(() => {
    if (!isOpening) return
    function onWindowFocus() {
      window.setTimeout(() => {
        if (isOpeningRef.current) setOpening(false)
      }, 400)
    }
    window.addEventListener("focus", onWindowFocus)
    return () => window.removeEventListener("focus", onWindowFocus)
  }, [isOpening, setOpening])

  return { isOpening, beginOpening, endOpening }
}

function DocumentsPdfUploadDropzone({
  id,
  disabled,
  inputRef,
  onPickClick,
  onInputChange,
  onFilesDropped,
}: {
  id: string
  disabled?: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onPickClick: () => void
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void
  onFilesDropped: (files: FileList | File[]) => void
}) {
  const [dropFocus, setDropFocus] = useState(false)
  const { isOpening, beginOpening, endOpening } = useNativeFilePickerOpening()
  const pickerBusy = Boolean(disabled) || isOpening

  function onDragOver(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    if (pickerBusy) return
    setDropFocus(true)
  }

  function onDragLeave(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDropFocus(false)
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDropFocus(false)
    endOpening()
    if (disabled) return
    const files = e.dataTransfer.files
    if (files?.length) onFilesDropped(files)
  }

  function openFilePicker() {
    if (disabled || !beginOpening()) return
    onPickClick()
  }

  function onPickerInputChange(e: ChangeEvent<HTMLInputElement>) {
    endOpening()
    onInputChange(e)
  }

  return (
    <div className="deal_docs_section_modal_upload">
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="visually_hidden"
        multiple
        accept={DEAL_OFFERING_DOCUMENT_ACCEPT}
        disabled={disabled}
        onChange={onPickerInputChange}
        {...nativeFilePickerCancelProps(endOpening)}
      />
      <button
        type="button"
        className={[
          "deal_docs_section_modal_upload_zone",
          dropFocus ? "deal_docs_section_modal_upload_zone--focus" : "",
          isOpening ? "deal_docs_section_modal_upload_zone--busy" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={pickerBusy}
        aria-busy={isOpening}
        aria-labelledby={`${id}-label`}
        onClick={openFilePicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <span className="deal_docs_section_modal_upload_empty">
          <span
            className="deal_docs_section_modal_upload_icon_ring"
            aria-hidden
          >
            {isOpening ? (
              <Loader2
                size={22}
                strokeWidth={1.75}
                className="deals_deal_view_spinner"
              />
            ) : (
              <Plus size={22} strokeWidth={1.75} />
            )}
          </span>
          <span id={`${id}-label`} className="deal_docs_section_modal_upload_title">
            {isOpening ? "Opening the file browser to select a file" : "Add documents"}
          </span>
          <span className="deal_docs_section_modal_upload_sub">
            {isOpening
              ? "Your file manager is opening"
              : `Click to browse or drop files here. ${DEAL_OFFERING_DOCUMENT_LIMITS_HINT}.`}
          </span>
          {isOpening ? null : (
            <span className="deal_docs_section_modal_upload_formats" aria-hidden>
              <span className="deal_docs_section_modal_format_chip">PDF</span>
              <span className="deal_docs_section_modal_format_chip">Word</span>
              <span className="deal_docs_section_modal_format_chip">PPT</span>
              <span className="deal_docs_section_modal_format_chip">Excel</span>
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

function ModalPendingDocumentFilesList({
  files,
  disabled,
  onRemove,
}: {
  files: File[]
  disabled?: boolean
  onRemove: (index: number) => void
}) {
  const previewUrlsRef = useRef(new Map<string, string>())

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current.values()) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* ignore */
        }
      }
      previewUrlsRef.current.clear()
    }
  }, [])

  function filePreviewKey(file: File, index: number): string {
    return `${index}::${file.name}::${file.size}::${file.lastModified}`
  }

  function revokePreviewForKey(key: string): void {
    const url = previewUrlsRef.current.get(key)
    if (!url) return
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
    previewUrlsRef.current.delete(key)
  }

  function viewFile(file: File, index: number): void {
    const key = filePreviewKey(file, index)
    let url = previewUrlsRef.current.get(key)
    if (!url) {
      url = URL.createObjectURL(file)
      previewUrlsRef.current.set(key, url)
    }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  function removeFile(index: number): void {
    const file = files[index]
    if (file) revokePreviewForKey(filePreviewKey(file, index))
    onRemove(index)
  }

  if (files.length === 0) return null

  return (
    <ul className="deal_docs_modal_file_list" aria-label="Selected documents">
      {files.map((file, index) => (
        <li
          key={filePreviewKey(file, index)}
          className="deal_docs_modal_file_row"
        >
          <button
            type="button"
            className="deal_docs_modal_file_name deal_docs_modal_file_name_btn"
            title={`View ${file.name}`}
            aria-label={`View ${file.name}`}
            disabled={disabled}
            onClick={() => viewFile(file, index)}
          >
            {file.name}
          </button>
          {formatPdfFileSize(file.size) ? (
            <span className="deal_docs_modal_file_size">
              {formatPdfFileSize(file.size)}
            </span>
          ) : null}
          <div
            className="deal_docs_modal_file_actions"
            role="group"
            aria-label={`${file.name} actions`}
          >
            <button
              type="button"
              className="deal_docs_modal_file_btn"
              disabled={disabled}
              aria-label={`View ${file.name}`}
              onClick={() => viewFile(file, index)}
            >
              <Eye size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className="deal_docs_modal_file_btn deal_docs_modal_file_btn_danger"
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
              onClick={() => removeFile(index)}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function revokeBlobUrlIfOrphaned(
  removedUrl: string | null | undefined,
  sectionsAfter: OfferingPreviewSection[],
): void {
  const u = removedUrl?.trim()
  if (!u || !u.startsWith("blob:")) return
  const stillUsed = sectionsAfter.some((s) =>
    s.nestedDocuments.some((d) => d.url === u),
  )
  if (stillUsed) return
  try {
    URL.revokeObjectURL(u)
  } catch {
    /* ignore */
  }
}

export function DocumentsSection({
  dealId,
  dealName,
  offeringInvestorPreviewJson,
  investorsListRefreshKey = 0,
  viewerDealMemberRole: viewerDealMemberRoleProp = null,
  onOfferingPreviewSynced,
}: DocumentsSectionProps) {
  const dealIdTrim = dealId?.trim() ?? ""
  const dealNameTrim = dealName?.trim() || "Deal"
  const addSectionTitleId = useId()
  const sectionNameFieldId = useId()
  const sectionUploadFieldId = useId()
  const sectionFileInputRef = useRef<HTMLInputElement>(null)
  const uploadDocsTitleId = useId()
  const uploadDocsUploadFieldId = useId()
  const uploadFileInputRef = useRef<HTMLInputElement>(null)
  const visibilityConfirmTitleId = useId()
  const moveDocumentTitleId = useId()
  const moveSelectRequiredTitleId = useId()
  const quickUploadInputRef = useRef<HTMLInputElement>(null)
  const [previewHydrated, setPreviewHydrated] = useState(false)
  const [sections, setSections] = useState<OfferingPreviewSection[]>([])
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    {},
  )
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionDraft, setEditingSectionDraft] = useState("")
  const [sectionRenameBusy, setSectionRenameBusy] = useState(false)
  const [documentDownloadBusy, setDocumentDownloadBusy] = useState(false)
  const [checkedDocsBySection, setCheckedDocsBySection] = useState<
    Record<string, Record<string, boolean>>
  >({})
  const [query, setQuery] = useState("")
  const [showAddSectionModal, setShowAddSectionModal] = useState(false)
  const [sectionName, setSectionName] = useState("")
  const [sectionFiles, setSectionFiles] = useState<File[]>([])
  const [addSectionError, setAddSectionError] = useState<string | null>(null)
  const [showUploadDocsModal, setShowUploadDocsModal] = useState(false)
  const [uploadTargetLabel, setUploadTargetLabel] = useState("")
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadDocsError, setUploadDocsError] = useState<string | null>(null)
  const [quickUploadError, setQuickUploadError] = useState<string | null>(null)
  const [quickUploadDropFocus, setQuickUploadDropFocus] = useState(false)
  const [documentUploadBusy, setDocumentUploadBusy] = useState(false)
  const {
    isOpening: quickUploadPickerOpening,
    beginOpening: beginQuickUploadPicker,
    endOpening: endQuickUploadPicker,
  } = useNativeFilePickerOpening()
  const [deletePending, setDeletePending] = useState<
    | { kind: "document"; sectionId: string; docId: string; label: string }
    | { kind: "section"; sectionId: string; label: string }
    | null
  >(null)
  const [visibilityChangePending, setVisibilityChangePending] = useState<{
    sectionId: string
    docId: string
    docName: string
    previousScope: SectionSharedWithScope
    nextScope: SectionSharedWithScope
  } | null>(null)
  const [visibilitySaveBusy, setVisibilitySaveBusy] = useState(false)
  const [moveDocumentPending, setMoveDocumentPending] = useState<{
    items: DocumentMoveItem[]
  } | null>(null)
  const [moveTargetSectionId, setMoveTargetSectionId] = useState("")
  const [moveSelectRequiredOpen, setMoveSelectRequiredOpen] = useState(false)
  const [dealClasses, setDealClasses] = useState<DealInvestorClass[]>([])
  const [investorRows, setInvestorRows] = useState<DealInvestorRow[]>([])
  const [sponsorRosterRows, setSponsorRosterRows] = useState<DealInvestorRow[]>([])
  const [viewerDealMemberRole, setViewerDealMemberRole] =
    useState<ViewerDealMemberRole>(viewerDealMemberRoleProp)
  const [sponsorSignTarget, setSponsorSignTarget] = useState<{
    documentName: string
    signatureRequestId: string
  } | null>(null)
  const onSyncedRef = useRef(onOfferingPreviewSynced)
  onSyncedRef.current = onOfferingPreviewSynced
  const lastPersistedSectionsSnapshotRef = useRef("")

  function previewJsonLooksCanonical(json: string | null | undefined): boolean {
    if (!json?.trim()) return false
    try {
      const parsed = JSON.parse(json) as unknown
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return false
      }
      const rec = parsed as Record<string, unknown>
      return (
        rec.v != null ||
        rec.visibility != null ||
        Array.isArray(rec.sections)
      )
    } catch {
      return false
    }
  }

  function resolveWorkspaceSections(): OfferingPreviewSection[] {
    const fromServer = parseDocumentSectionsFromPreviewJson(
      offeringInvestorPreviewJson,
    )
    const viewerRoleForHydrate =
      viewerDealMemberRoleProp === "co_sponsor" ||
      viewerDealMemberRole === "co_sponsor" ||
      viewerDealMemberRoleProp === "lead_sponsor" ||
      viewerDealMemberRole === "lead_sponsor" ||
      viewerDealMemberRoleProp === "admin_sponsor" ||
      viewerDealMemberRole === "admin_sponsor"
    const rolePrefersServer =
      viewerRoleForHydrate &&
      previewJsonLooksCanonical(offeringInvestorPreviewJson)
    const nextSections =
      fromServer.length > 0 || rolePrefersServer
        ? orderDocumentSections(fromServer)
        : readDealDocumentSectionsForWorkspace(dealIdTrim)
    return mergeAutoManagedDocumentSections(
      nextSections,
      dealIdTrim,
      offeringInvestorPreviewJson,
      rolePrefersServer ? { preferPreviewJson: true } : undefined,
    )
  }

  function setSectionsIfChanged(next: OfferingPreviewSection[]) {
    setSections((prev) => (documentSectionsEqual(prev, next) ? prev : next))
  }

  function countNestedDocumentsInPreviewJson(
    json: string | null | undefined,
  ): number {
    if (!json?.trim()) return 0
    try {
      const parsed = JSON.parse(json) as { sections?: unknown }
      return parseOfferingPreviewSectionsJson(parsed.sections).reduce(
        (n, s) => n + s.nestedDocuments.length,
        0,
      )
    } catch {
      return 0
    }
  }

  useEffect(() => {
    const id = dealIdTrim
    if (!id) {
      setPreviewHydrated(false)
      setSections([])
      lastPersistedSectionsSnapshotRef.current = ""
      setExpandedSections({})
      setCheckedDocsBySection({})
      return
    }
    applyOfferingInvestorPreviewJsonFromServer(id, offeringInvestorPreviewJson, {
      notify: false,
    })
    const next = resolveWorkspaceSections()
    setSectionsIfChanged(next)
    setPreviewHydrated(isOfferingPreviewHydrated(id))
    lastPersistedSectionsSnapshotRef.current = documentSectionsSnapshot(
      mergeAutoManagedDocumentSections(
        next,
        id,
        offeringInvestorPreviewJson,
        viewerDealMemberRoleProp === "co_sponsor" ||
          viewerDealMemberRole === "co_sponsor"
          ? { preferPreviewJson: true }
          : undefined,
      ),
    )
  }, [dealIdTrim, offeringInvestorPreviewJson])

  /** Only collapse sections when switching deals — not after Shared With / visibility sync. */
  useEffect(() => {
    setExpandedSections({})
    setCheckedDocsBySection({})
  }, [dealIdTrim])

  useEffect(() => {
    const id = dealIdTrim
    if (!id) return
    const onSectionsChanged = (e: Event) => {
      const d = (e as CustomEvent<{ dealId?: string }>).detail
      if (d?.dealId !== id) return
      setSectionsIfChanged(resolveWorkspaceSections())
      setPreviewHydrated(isOfferingPreviewHydrated(id))
    }
    window.addEventListener(OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT, onSectionsChanged)
    return () => {
      window.removeEventListener(
        OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT,
        onSectionsChanged,
      )
    }
  }, [dealIdTrim, offeringInvestorPreviewJson])

  useEffect(() => {
    const id = dealIdTrim
    if (!id) {
      setDealClasses([])
      setInvestorRows([])
      setSponsorRosterRows([])
      return
    }
    let cancelled = false
    void (async () => {
      const [classes, payload, membersResult] = await Promise.all([
        fetchDealInvestorClasses(id),
        fetchDealInvestors(id, { lpInvestorsOnly: true }),
        fetchDealMembers(id),
      ])
      if (cancelled) return
      setDealClasses(classes)
      setInvestorRows(payload.investors)
      setSponsorRosterRows(membersResult.members)
      const fromApi = parseViewerDealMemberRoleFromApi(
        membersResult.viewerDealMemberRole,
      )
      setViewerDealMemberRole(fromApi ?? viewerDealMemberRoleProp)
    })()
    return () => {
      cancelled = true
    }
  }, [dealIdTrim, investorsListRefreshKey, viewerDealMemberRoleProp])

  useEffect(() => {
    if (viewerDealMemberRoleProp != null) {
      setViewerDealMemberRole(viewerDealMemberRoleProp)
    }
  }, [viewerDealMemberRoleProp])

  useEffect(() => {
    const id = dealIdTrim
    if (!id) return
    let cancelled = false
    void (async () => {
      const sync = await syncCompletedEsignDocumentsToDocumentsTab(id)
      if (cancelled || !sync.ok) return
      if (sync.offeringInvestorPreviewJson != null) {
        applyOfferingInvestorPreviewJsonFromServer(
          id,
          sync.offeringInvestorPreviewJson,
        )
        setSectionsIfChanged(readDealDocumentSectionsForWorkspace(id))
        setPreviewHydrated(isOfferingPreviewHydrated(id))
      }
      const deal = await fetchDealById(id)
      if (!cancelled && deal) onSyncedRef.current?.(deal)
    })()
    return () => {
      cancelled = true
    }
  }, [dealIdTrim, investorsListRefreshKey])

  const sessionEmail = getSessionUserEmail()
  const sessionUserId = getSessionUserId()
  const effectiveViewerDealMemberRole = useMemo((): ViewerDealMemberRole => {
    if (viewerDealMemberRoleProp != null) return viewerDealMemberRoleProp
    if (viewerDealMemberRole != null) return viewerDealMemberRole
    return resolveViewerDealMemberRole(
      sponsorRosterRows,
      sessionEmail,
      sessionUserId,
    )
  }, [
    viewerDealMemberRoleProp,
    viewerDealMemberRole,
    sponsorRosterRows,
    sessionEmail,
    sessionUserId,
  ])

  const viewerCanSponsorSign = viewerIsDealSponsorRole(
    effectiveViewerDealMemberRole,
  )

  const viewerCanRenameDocumentSections =
    isPlatformAdmin() || viewerCanSponsorSign

  const lpInvestorRows = useMemo(
    () => filterLpInvestorsForDocumentSharedWith(investorRows),
    [investorRows],
  )

  const sponsorUserOptions = useMemo(
    () => buildSponsorUserPickerOptions(sponsorRosterRows, lpInvestorRows),
    [sponsorRosterRows, lpInvestorRows],
  )

  const expandOnlySection = useCallback((sectionId: string) => {
    setExpandedSections({ [sectionId]: true })
  }, [])

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !(prev[sectionId] ?? false),
    }))
  }, [])

  const cancelSectionRename = useCallback(() => {
    if (sectionRenameBusy) return
    setEditingSectionId(null)
    setEditingSectionDraft("")
  }, [sectionRenameBusy])

  const startSectionRename = useCallback((section: OfferingPreviewSection) => {
    if (!isBuiltInDocumentSectionLabelEditable(section)) return
    setEditingSectionId(section.id)
    setEditingSectionDraft(section.sectionLabel.trim())
  }, [])

  const saveSectionRename = useCallback(() => {
    const idTrim = dealIdTrim
    const sectionId = editingSectionId
    const nextLabel = editingSectionDraft.trim()
    if (!idTrim || !sectionId || !nextLabel || sectionRenameBusy) return
    const target = sections.find((s) => s.id === sectionId)
    if (!target || !isBuiltInDocumentSectionLabelEditable(target)) {
      cancelSectionRename()
      return
    }
    if (nextLabel === target.sectionLabel.trim()) {
      cancelSectionRename()
      return
    }
    setSectionRenameBusy(true)
    const nextSections = orderDocumentSections(
      sections.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              sectionLabel: nextLabel,
              documentLabel: nextLabel,
            },
      ),
    )
    setSections(nextSections)
    writeOfferingPreviewSections(idTrim, nextSections, { notify: false })
    void persistOfferingInvestorPreviewToServer(idTrim, {
      sections: nextSections,
      onSuccess: (d) => onSyncedRef.current?.(d),
    }).finally(() => {
      setSectionRenameBusy(false)
      cancelSectionRename()
    })
  }, [
    cancelSectionRename,
    dealIdTrim,
    editingSectionDraft,
    editingSectionId,
    sectionRenameBusy,
    sections,
  ])

  const refreshEsignDocumentsAfterSponsorSign = useCallback(() => {
    const id = dealIdTrim
    if (!id) return
    void (async () => {
      const sync = await syncCompletedEsignDocumentsToDocumentsTab(id)
      if (sync.ok && sync.offeringInvestorPreviewJson != null) {
        applyOfferingInvestorPreviewJsonFromServer(
          id,
          sync.offeringInvestorPreviewJson,
        )
        setSectionsIfChanged(readDealDocumentSectionsForWorkspace(id))
        setPreviewHydrated(isOfferingPreviewHydrated(id))
      }
      const deal = await fetchDealById(id)
      if (deal) onSyncedRef.current?.(deal)
    })()
  }, [dealIdTrim])

  const checkAllInSection = useCallback((sectionId: string, docIds: string[]) => {
    setCheckedDocsBySection((prev) => ({
      ...prev,
      [sectionId]: Object.fromEntries(docIds.map((id) => [id, true] as const)),
    }))
  }, [])

  const clearChecksInSection = useCallback((sectionId: string) => {
    setCheckedDocsBySection((prev) => {
      if (!prev[sectionId]) return prev
      const next = { ...prev }
      delete next[sectionId]
      return next
    })
  }, [])

  const collectCheckedDownloadItems = useCallback((): Array<{
    sectionId: string
    sectionName: string
    doc: NestedPreviewDocument
  }> => {
    const items: Array<{
      sectionId: string
      sectionName: string
      doc: NestedPreviewDocument
    }> = []
    for (const section of sections) {
      const checks = checkedDocsBySection[section.id]
      if (!checks) continue
      const sectionName = sectionDisplayLabel(section)
      for (const doc of section.nestedDocuments) {
        if (checks[doc.id] && doc.url?.trim()) {
          items.push({ sectionId: section.id, sectionName, doc })
        }
      }
    }
    return items
  }, [sections, checkedDocsBySection])

  const selectedDownloadableCount = useMemo(
    () => collectCheckedDownloadItems().length,
    [collectCheckedDownloadItems],
  )

  const downloadDocuments = useCallback(
    async (
      items: Array<{
        sectionName: string
        doc: NestedPreviewDocument
      }>,
    ) => {
      if (items.length === 0 || documentDownloadBusy) return
      const bySection = new Map<string, typeof items>()
      for (const item of items) {
        const key = item.sectionName
        const list = bySection.get(key) ?? []
        list.push(item)
        bySection.set(key, list)
      }
      setDocumentDownloadBusy(true)
      try {
        for (const [, group] of bySection) {
          const disambiguate = group.length > 1
          for (const { sectionName, doc } of group) {
            const url = doc.url?.trim()
            if (!url) continue
            const filename = buildDocumentDownloadFilename({
              dealName: dealNameTrim,
              sectionName,
              originalName: doc.name,
              disambiguate,
            })
            await downloadDocumentFromUrl(url, filename)
          }
        }
      } finally {
        setDocumentDownloadBusy(false)
      }
    },
    [dealNameTrim, documentDownloadBusy],
  )

  const downloadCheckedDocuments = useCallback(() => {
    void downloadDocuments(collectCheckedDownloadItems())
  }, [collectCheckedDownloadItems, downloadDocuments])

  const downloadSingleDocument = useCallback(
    (sectionName: string, doc: NestedPreviewDocument) => {
      const url = doc.url?.trim()
      if (!url) return
      void downloadDocuments([{ sectionName, doc }])
    },
    [downloadDocuments],
  )

  const copyDocLink = useCallback((url: string) => {
    if (!url.trim()) return
    void (async () => {
      try {
        await navigator.clipboard.writeText(url.trim())
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const sectionsForPersist = useMemo(
    () =>
      mergeAutoManagedDocumentSections(
        sections,
        dealIdTrim,
        offeringInvestorPreviewJson,
        effectiveViewerDealMemberRole === "co_sponsor" ||
        effectiveViewerDealMemberRole === "lead_sponsor" ||
        effectiveViewerDealMemberRole === "admin_sponsor"
          ? { preferPreviewJson: true }
          : undefined,
      ),
    [
      sections,
      dealIdTrim,
      offeringInvestorPreviewJson,
      effectiveViewerDealMemberRole,
    ],
  )

  useEffect(() => {
    if (!previewHydrated || !dealIdTrim) return
    const snap = documentSectionsSnapshot(sectionsForPersist)
    if (snap === lastPersistedSectionsSnapshotRef.current) return
    lastPersistedSectionsSnapshotRef.current = snap
    writeOfferingPreviewSections(dealIdTrim, sectionsForPersist, {
      notify: false,
    })
    scheduleOfferingInvestorPreviewServerSync(dealIdTrim, {
      sections: sectionsForPersist,
      onSuccess: (d) => {
        applyOfferingInvestorPreviewJsonFromServer(
          d.id,
          d.offeringInvestorPreviewJson,
          { notify: false },
        )
        onSyncedRef.current?.(d)
      },
    })
  }, [dealIdTrim, sectionsForPersist, previewHydrated])

  /** If the tab has more documents than the last server snapshot, push to DB. */
  useEffect(() => {
    if (!previewHydrated || !dealIdTrim) return
    const localCount = sectionsForPersist.reduce(
      (n, s) => n + s.nestedDocuments.length,
      0,
    )
    if (
      effectiveViewerDealMemberRole === "co_sponsor" ||
      effectiveViewerDealMemberRole === "lead_sponsor" ||
      effectiveViewerDealMemberRole === "admin_sponsor"
    )
      return
    if (localCount === 0) return
    const serverCount = countNestedDocumentsInPreviewJson(
      offeringInvestorPreviewJson,
    )
    if (localCount <= serverCount) return
    void persistOfferingInvestorPreviewToServer(dealIdTrim, {
      sections: sectionsForPersist,
      onSuccess: (d) => onSyncedRef.current?.(d),
    })
  }, [
    dealIdTrim,
    offeringInvestorPreviewJson,
    previewHydrated,
    sectionsForPersist,
    effectiveViewerDealMemberRole,
  ])

  const onAddSection = useCallback(() => {
    setSectionName("")
    setSectionFiles([])
    setAddSectionError(null)
    setShowAddSectionModal(true)
  }, [])

  const closeAddSectionModal = useCallback(() => {
    if (documentUploadBusy) return
    setShowAddSectionModal(false)
    setAddSectionError(null)
  }, [documentUploadBusy])

  const appendSectionFiles = useCallback(
    (incoming: FileList | File[] | null | undefined) => {
      const { next, error } = appendOfferingDocumentFilesFromPicker(
        sectionFiles,
        incoming,
      )
      setSectionFiles(next)
      setAddSectionError(error)
    },
    [sectionFiles],
  )

  const onSectionFilesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      appendSectionFiles(e.currentTarget.files)
      e.currentTarget.value = ""
    },
    [appendSectionFiles],
  )

  const removeSectionFileAt = useCallback((index: number) => {
    setSectionFiles((prev) => prev.filter((_, i) => i !== index))
    setAddSectionError(null)
  }, [])

  const onSubmitAddSection = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      void (async () => {
        const name = sectionName.trim()
        if (!name) {
          setAddSectionError("Section name is required.")
          return
        }

        const createdAt = Date.now()
        const newSectionId = `section-${createdAt}`
        let nestedDocuments: NestedPreviewDocument[] = []

        if (sectionFiles.length > 0) {
          const idTrim = dealIdTrim
          if (!idTrim) {
            setAddSectionError("Save the deal before uploading documents.")
            return
          }
          setDocumentUploadBusy(true)
          setAddSectionError(null)
          try {
            const up = await postDealOfferingDocumentUploads(
              idTrim,
              sectionFiles,
            )
            if (!up.ok) {
              setAddSectionError(up.message)
              return
            }
            if (up.newPaths.length !== sectionFiles.length) {
              setAddSectionError(
                "Upload did not return a path for each selected file.",
              )
              return
            }
            const uploaderIsCoSponsor =
              effectiveViewerDealMemberRole === "co_sponsor" &&
              Boolean(sessionUserId.trim())
            const uploaderSponsorIds = uploaderIsCoSponsor
              ? [sessionUserId.trim()]
              : []
            nestedDocuments = sectionFiles.map((file, i) => {
              const stored = dealAssetRelativePathToUploadsUrl(up.newPaths[i]!)
              return {
                id: `${newSectionId}-nest-${i}`,
                name: file.name,
                url: stored || null,
                dateAdded: formatDateAdded(),
                lpDisplaySectionId: newSectionId,
                sharedDealClassIds: [],
                sharedInvestorIds: [],
                sharedWithAllInvestors: false,
                sharedSponsorUserIds: uploaderSponsorIds,
                sharedWithScope: "not_visible" as const,
                ...(uploaderIsCoSponsor
                  ? {
                      uploadedByIsCoSponsor: true as const,
                      uploadedByUserId: sessionUserId.trim(),
                    }
                  : {}),
              }
            })
          } catch (err) {
            setAddSectionError(
              err instanceof Error ? err.message : "Document upload failed.",
            )
            return
          } finally {
            setDocumentUploadBusy(false)
          }
        }

        const idTrim = dealIdTrim
        setSections((prev) => {
          const next = orderDocumentSectionsWithDefaultFirst([
            ...prev,
            {
              id: newSectionId,
              sectionLabel: name,
              documentLabel: name,
              visibility: sectionSharedWithDisplay("offering_page"),
              sharedWithScope: "offering_page" as const,
              requireLpReview: false,
              dateAdded: formatDateAdded(),
              nestedDocuments,
            },
          ])
          if (idTrim) {
            writeOfferingPreviewSections(idTrim, next, { notify: false })
            void persistOfferingInvestorPreviewToServer(idTrim, {
              sections: next,
              onSuccess: (d) => onSyncedRef.current?.(d),
            })
          }
          return next
        })
        setShowAddSectionModal(false)
        setSectionName("")
        setSectionFiles([])
        setAddSectionError(null)
      })()
    },
    [
      dealIdTrim,
      sectionFiles,
      sectionName,
      effectiveViewerDealMemberRole,
      sessionUserId,
    ],
  )

  const appendUploadedFilesToSection = useCallback(
    async (
      targetSectionId: string,
      files: File[],
    ): Promise<string | null> => {
      if (files.length === 0) return "Select at least one document to upload."
      const nonAllowed = files.filter((f) => !isDealOfferingDocumentFile(f))
      if (nonAllowed.length > 0) {
        return dealOfferingDocumentRejectMessage(nonAllowed.map((f) => f.name))
      }

      const idTrim = dealIdTrim
      if (!idTrim) return "Save the deal before uploading documents."

      const createdAt = Date.now()
      setDocumentUploadBusy(true)
      try {
        const up = await postDealOfferingDocumentUploads(idTrim, files)
        if (!up.ok) return up.message
        if (up.newPaths.length !== files.length) {
          return "Upload did not return a path for each selected file."
        }

        const uploaderIsCoSponsor =
          effectiveViewerDealMemberRole === "co_sponsor" &&
          Boolean(sessionUserId.trim())
        const uploaderSponsorIds = uploaderIsCoSponsor
          ? [sessionUserId.trim()]
          : []
        const newNestedBase = files.map((file, i) => {
          const stored = dealAssetRelativePathToUploadsUrl(up.newPaths[i]!)
          return {
            id: `upload-${createdAt}-${i}`,
            name: file.name,
            url: stored || null,
            dateAdded: formatDateAdded(),
            lpDisplaySectionId: targetSectionId,
            sharedDealClassIds: [] as string[],
            sharedInvestorIds: [] as string[],
            sharedWithAllInvestors: false,
            sharedSponsorUserIds: uploaderSponsorIds,
            sharedWithScope: "not_visible" as const,
            ...(uploaderIsCoSponsor
              ? {
                  uploadedByIsCoSponsor: true as const,
                  uploadedByUserId: sessionUserId.trim(),
                }
              : {}),
          }
        })

        let resolvedSectionId = targetSectionId
        setSections((prev) => {
          let list = prev
          if (targetSectionId === DEFAULT_DOCUMENT_SECTION_ID) {
            const ensured = ensureDefaultDocumentSectionInList(list)
            list = ensured.sections
            resolvedSectionId = ensured.defaultSection.id
          } else if (!list.some((s) => s.id === targetSectionId)) {
            return prev
          }
          const newNested = newNestedBase.map((row) => ({
            ...row,
            lpDisplaySectionId: resolvedSectionId,
          }))
          const next = orderDocumentSectionsWithDefaultFirst(
            list.map((s) =>
              s.id !== resolvedSectionId
                ? s
                : {
                    ...s,
                    nestedDocuments: [...s.nestedDocuments, ...newNested],
                    dateAdded: formatDateAdded(),
                  },
            ),
          )
          writeOfferingPreviewSections(idTrim, next, { notify: false })
          void persistOfferingInvestorPreviewToServer(idTrim, {
            sections: next,
            onSuccess: (d) => onSyncedRef.current?.(d),
          })
          return next
        })

        expandOnlySection(resolvedSectionId)
        return null
      } catch (err) {
        return err instanceof Error ? err.message : "Document upload failed."
      } finally {
        setDocumentUploadBusy(false)
      }
    },
    [dealIdTrim, expandOnlySection, effectiveViewerDealMemberRole, sessionUserId],
  )

  const uploadFilesToDefaultSection = useCallback(
    async (files: File[]) => {
      setQuickUploadError(null)
      const err = await appendUploadedFilesToSection(
        DEFAULT_DOCUMENT_SECTION_ID,
        files,
      )
      if (err) setQuickUploadError(err)
    },
    [appendUploadedFilesToSection],
  )

  const onQuickUploadInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      endQuickUploadPicker()
      const picked = e.currentTarget.files
        ? Array.from(e.currentTarget.files)
        : []
      e.currentTarget.value = ""
      if (picked.length > 0) void uploadFilesToDefaultSection(picked)
    },
    [endQuickUploadPicker, uploadFilesToDefaultSection],
  )

  const onQuickUploadDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setQuickUploadDropFocus(false)
      endQuickUploadPicker()
      const dropped = e.dataTransfer.files
        ? Array.from(e.dataTransfer.files)
        : []
      if (dropped.length > 0) void uploadFilesToDefaultSection(dropped)
    },
    [endQuickUploadPicker, uploadFilesToDefaultSection],
  )

  const openQuickUploadPicker = useCallback(() => {
    if (documentUploadBusy || !beginQuickUploadPicker()) return
    quickUploadInputRef.current?.click()
  }, [beginQuickUploadPicker, documentUploadBusy])

  const onQuickUploadKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return
      e.preventDefault()
      openQuickUploadPicker()
    },
    [openQuickUploadPicker],
  )

  const openUploadDocumentsModal = useCallback((row: OfferingPreviewSection) => {
    const label =
      row.documentLabel?.trim() && row.documentLabel.trim() !== "—"
        ? row.documentLabel.trim()
        : row.sectionLabel.trim() || "Section"
    setUploadTargetLabel(label)
    setUploadFiles([])
    setUploadDocsError(null)
    setShowUploadDocsModal(true)
  }, [])

  const closeUploadDocsModal = useCallback(() => {
    if (documentUploadBusy) return
    setShowUploadDocsModal(false)
    setUploadDocsError(null)
  }, [documentUploadBusy])

  const appendUploadFiles = useCallback(
    (incoming: FileList | File[] | null | undefined) => {
      const { next, error } = appendOfferingDocumentFilesFromPicker(
        uploadFiles,
        incoming,
      )
      setUploadFiles(next)
      setUploadDocsError(error)
    },
    [uploadFiles],
  )

  const onUploadFilesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      appendUploadFiles(e.currentTarget.files)
      e.currentTarget.value = ""
    },
    [appendUploadFiles],
  )

  const removeUploadFileAt = useCallback((index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index))
    setUploadDocsError(null)
  }, [])

  const onSubmitUploadDocuments = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      void (async () => {
        if (uploadFiles.length === 0) {
          setUploadDocsError("Upload at least one document.")
          return
        }
        const label = uploadTargetLabel.trim() || "Section"
        const target = sections.find((s) => sectionMatchesLabel(s, label))
        if (!target) {
          setUploadDocsError("Section not found.")
          return
        }
        setUploadDocsError(null)
        const err = await appendUploadedFilesToSection(target.id, uploadFiles)
        if (err) {
          setUploadDocsError(err)
          return
        }
        setShowUploadDocsModal(false)
        setUploadFiles([])
        setUploadDocsError(null)
      })()
    },
    [appendUploadedFilesToSection, sections, uploadFiles, uploadTargetLabel],
  )

  const removeNestedDocument = useCallback((sectionId: string, docId: string) => {
    setSections((prev) => {
      let removedUrl: string | null | undefined
      const next = prev.map((s) => {
        if (s.id !== sectionId) return s
        const target = s.nestedDocuments.find((d) => d.id === docId)
        if (target) removedUrl = target.url
        return {
          ...s,
          nestedDocuments: s.nestedDocuments.filter((d) => d.id !== docId),
        }
      })
      revokeBlobUrlIfOrphaned(removedUrl, next)
      return next
    })
    setCheckedDocsBySection((prev) => {
      const sec = prev[sectionId]
      if (!sec || !(docId in sec)) return prev
      const nextSec = { ...sec }
      delete nextSec[docId]
      const next = { ...prev }
      if (Object.keys(nextSec).length === 0) delete next[sectionId]
      else next[sectionId] = nextSec
      return next
    })
  }, [])

  const removeSectionById = useCallback((sectionId: string) => {
    setSections((prev) => {
      const victim = prev.find((s) => s.id === sectionId)
      if (
        victim &&
        effectiveViewerDealMemberRole === "co_sponsor"
      ) {
        const ctx = {
          viewerUserIds: collectCoSponsorViewerUserIds(
            sessionUserId,
            lpInvestorRows,
          ),
          lpInvestors: lpInvestorRows,
          dealClasses,
        }
        const kept = victim.nestedDocuments.filter(
          (d) => !nestedDocumentVisibleToCoSponsor(d, ctx),
        )
        const next = orderDocumentSectionsWithDefaultFirst(
          kept.length === 0
            ? prev.filter((s) => s.id !== sectionId)
            : prev.map((s) =>
                s.id !== sectionId ? s : { ...s, nestedDocuments: kept },
              ),
        )
        for (const d of victim.nestedDocuments) {
          if (kept.some((k) => k.id === d.id)) continue
          revokeBlobUrlIfOrphaned(d.url, next)
        }
        return next
      }
      const next = orderDocumentSectionsWithDefaultFirst(
        prev.filter((s) => s.id !== sectionId),
      )
      if (victim) {
        for (const d of victim.nestedDocuments) {
          revokeBlobUrlIfOrphaned(d.url, next)
        }
      }
      return next
    })
    setCheckedDocsBySection((c) => {
      if (!c[sectionId]) return c
      const next = { ...c }
      delete next[sectionId]
      return next
    })
  }, [
    dealClasses,
    effectiveViewerDealMemberRole,
    lpInvestorRows,
    sessionUserId,
  ])

  const onConfirmDeletePending = useCallback(() => {
    if (!deletePending) return
    if (deletePending.kind === "document") {
      removeNestedDocument(deletePending.sectionId, deletePending.docId)
      expandOnlySection(deletePending.sectionId)
    } else {
      removeSectionById(deletePending.sectionId)
    }
    setDeletePending(null)
  }, [
    deletePending,
    expandOnlySection,
    removeNestedDocument,
    removeSectionById,
  ])

  const promptDeleteDocument = useCallback(
    (sectionId: string, doc: NestedPreviewDocument) => {
      setDeletePending({
        kind: "document",
        sectionId,
        docId: doc.id,
        label: doc.name,
      })
    },
    [],
  )

  const requestDocumentVisibilityChange = useCallback(
    (
      sectionId: string,
      doc: NestedPreviewDocument,
      section: OfferingPreviewSection,
      nextScope: SectionSharedWithScope,
    ) => {
      const currentScope = effectiveDocumentSharedWithScope(doc, section)
      if (nextScope === currentScope) return
      setVisibilityChangePending({
        sectionId,
        docId: doc.id,
        docName: doc.name.trim() || "Document",
        previousScope: currentScope,
        nextScope,
      })
    },
    [],
  )

  const cancelVisibilityChange = useCallback(() => {
    if (visibilitySaveBusy) return
    setVisibilityChangePending(null)
  }, [visibilitySaveBusy])

  const confirmVisibilityChange = useCallback(() => {
    const pending = visibilityChangePending
    const idTrim = dealIdTrim
    if (!pending || !idTrim || visibilitySaveBusy) return

    setVisibilitySaveBusy(true)
    const nextSections = sections.map((s) =>
      s.id !== pending.sectionId
        ? s
        : {
            ...s,
            nestedDocuments: s.nestedDocuments.map((n) =>
              n.id !== pending.docId
                ? n
                : { ...n, sharedWithScope: pending.nextScope },
            ),
          },
    )
    const nextForPersist = mergeAutoManagedDocumentSections(
      nextSections,
      idTrim,
      offeringInvestorPreviewJson,
    )
    lastPersistedSectionsSnapshotRef.current =
      documentSectionsSnapshot(nextForPersist)
    setSections(nextSections)
    writeOfferingPreviewSections(idTrim, nextForPersist, { notify: false })
    void persistOfferingInvestorPreviewToServer(idTrim, {
      sections: nextForPersist,
      onSuccess: (d) => onSyncedRef.current?.(d),
    })
      .finally(() => {
        setVisibilitySaveBusy(false)
        setVisibilityChangePending(null)
      })
  }, [
    dealIdTrim,
    offeringInvestorPreviewJson,
    sections,
    visibilityChangePending,
    visibilitySaveBusy,
  ])

  useEffect(() => {
    if (!editingSectionId || sectionRenameBusy) return
    function onKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") cancelSectionRename()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cancelSectionRename, editingSectionId, sectionRenameBusy])

  useEffect(() => {
    if (!visibilityChangePending || visibilitySaveBusy) return
    function onKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") cancelVisibilityChange()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visibilityChangePending, visibilitySaveBusy, cancelVisibilityChange])

  const collectMovableCheckedItems = useCallback(
    (scopeSectionId?: string): DocumentMoveItem[] => {
      const items: DocumentMoveItem[] = []
      for (const section of sections) {
        if (scopeSectionId && section.id !== scopeSectionId) continue
        if (isAutoManagedDocumentsSection(section)) continue
        const checks = checkedDocsBySection[section.id]
        if (!checks) continue
        for (const doc of section.nestedDocuments) {
          if (checks[doc.id]) {
            items.push({ sectionId: section.id, docId: doc.id })
          }
        }
      }
      return items
    },
    [sections, checkedDocsBySection],
  )

  const selectedMovableDocumentCount = useMemo(
    () => collectMovableCheckedItems().length,
    [collectMovableCheckedItems],
  )

  const moveTargetSectionOptions = useMemo(() => {
    if (!moveDocumentPending?.items.length) return []
    const fromIds = new Set(
      moveDocumentPending.items.map((item) => item.sectionId),
    )
    if (fromIds.size === 1) {
      const onlyFrom = [...fromIds][0]!
      return sections.filter((s) => s.id !== onlyFrom)
    }
    return sections
  }, [moveDocumentPending, sections])

  const movableItemsForTarget = useMemo(() => {
    if (!moveDocumentPending || !moveTargetSectionId.trim()) return []
    const targetId = moveTargetSectionId.trim()
    return moveDocumentPending.items.filter((item) => item.sectionId !== targetId)
  }, [moveDocumentPending, moveTargetSectionId])

  const cancelMoveDocument = useCallback(() => {
    setMoveDocumentPending(null)
    setMoveTargetSectionId("")
  }, [])

  const openMoveForItems = useCallback(
    (items: DocumentMoveItem[]) => {
      if (items.length === 0) {
        setMoveSelectRequiredOpen(true)
        return
      }
      const fromIds = new Set(items.map((item) => item.sectionId))
      const targets =
        fromIds.size === 1
          ? sections.filter((s) => s.id !== [...fromIds][0])
          : sections
      if (targets.length === 0) return
      setMoveTargetSectionId(targets[0]!.id)
      setMoveDocumentPending({ items })
    },
    [sections],
  )

  const openMoveDocumentModal = useCallback(
    (sectionId: string, doc: NestedPreviewDocument) => {
      openMoveForItems([{ sectionId, docId: doc.id }])
    },
    [openMoveForItems],
  )

  const openMoveSelectedDocumentsModal = useCallback(
    (scopeSectionId?: string) => {
      openMoveForItems(collectMovableCheckedItems(scopeSectionId))
    },
    [collectMovableCheckedItems, openMoveForItems],
  )

  const moveNestedDocumentsToSection = useCallback(
    (items: DocumentMoveItem[], toSectionId: string) => {
      const pairs = items.filter(
        (item) =>
          item.sectionId &&
          item.docId &&
          item.sectionId !== toSectionId,
      )
      if (!pairs.length || !toSectionId) return

      const keys = new Set(
        pairs.map((item) => `${item.sectionId}:${item.docId}`),
      )

      setSections((prev) => {
        const extracted: NestedPreviewDocument[] = []
        const stripped = prev.map((section) => {
          const keep: NestedPreviewDocument[] = []
          for (const doc of section.nestedDocuments) {
            if (keys.has(`${section.id}:${doc.id}`)) {
              extracted.push({
                ...doc,
                lpDisplaySectionId: toSectionId,
              })
            } else {
              keep.push(doc)
            }
          }
          return { ...section, nestedDocuments: keep }
        })
        if (extracted.length === 0) return prev
        return stripped.map((section) =>
          section.id !== toSectionId
            ? section
            : {
                ...section,
                nestedDocuments: [...section.nestedDocuments, ...extracted],
              },
        )
      })

      setCheckedDocsBySection((prev) => {
        let next = { ...prev }
        for (const { sectionId, docId } of pairs) {
          const sec = next[sectionId]
          if (!sec || !(docId in sec)) continue
          const nextSec = { ...sec }
          delete nextSec[docId]
          if (Object.keys(nextSec).length === 0) delete next[sectionId]
          else next[sectionId] = nextSec
        }
        return next
      })
    },
    [],
  )

  const confirmMoveDocument = useCallback(() => {
    const pending = moveDocumentPending
    const targetId = moveTargetSectionId.trim()
    if (!pending?.items.length || !targetId) return
    const toMove = pending.items.filter((item) => item.sectionId !== targetId)
    if (toMove.length === 0) return
    moveNestedDocumentsToSection(toMove, targetId)
    cancelMoveDocument()
  }, [
    moveDocumentPending,
    moveTargetSectionId,
    moveNestedDocumentsToSection,
    cancelMoveDocument,
  ])

  useEffect(() => {
    if (!moveDocumentPending) return
    function onKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") cancelMoveDocument()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [moveDocumentPending, cancelMoveDocument])

  useEffect(() => {
    if (!moveSelectRequiredOpen) return
    function onKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") setMoveSelectRequiredOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [moveSelectRequiredOpen])

  const duplicateNestedDocument = useCallback(
    (sectionId: string, doc: NestedPreviewDocument) => {
      const nid = `dup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const copy: NestedPreviewDocument = {
        ...doc,
        id: nid,
        name: `${doc.name.replace(/\s*\(copy\)\s*$/i, "")} (copy)`,
        sharedDealClassIds: [...doc.sharedDealClassIds],
        sharedInvestorIds: [...doc.sharedInvestorIds],
        sharedWithAllInvestors: doc.sharedWithAllInvestors,
        sharedSponsorUserIds: [...(doc.sharedSponsorUserIds ?? [])],
        ...(doc.sharedWithScope ? { sharedWithScope: doc.sharedWithScope } : {}),
      }
      setSections((prev) =>
        prev.map((s) =>
          s.id !== sectionId
            ? s
            : { ...s, nestedDocuments: [...s.nestedDocuments, copy] },
        ),
      )
    },
    [],
  )

  const roleScopedSections = useMemo(() => {
    if (effectiveViewerDealMemberRole === "co_sponsor") {
      return orderDocumentSections(
        filterDocumentSectionsForCoSponsor(
          sections,
          {
            viewerUserIds: collectCoSponsorViewerUserIds(
              sessionUserId,
              lpInvestorRows,
            ),
            lpInvestors: lpInvestorRows,
            dealClasses,
          },
          {
            alwaysVisibleDocumentIds: nestedDocumentIdsFromPreviewJson(
              offeringInvestorPreviewJson,
            ),
          },
        ),
      )
    }
    if (
      effectiveViewerDealMemberRole === "lead_sponsor" ||
      effectiveViewerDealMemberRole === "admin_sponsor"
    ) {
      return orderDocumentSections(
        filterDocumentSectionsForLeadOrAdminSponsor(sections, {
          viewerUserIds: collectLeadAdminViewerShareIds(
            sessionUserId,
            sessionEmail,
            sponsorRosterRows,
            lpInvestorRows,
          ),
        }),
      )
    }
    return sections
  }, [
    sections,
    effectiveViewerDealMemberRole,
    sessionUserId,
    sessionEmail,
    sponsorRosterRows,
    lpInvestorRows,
    dealClasses,
    offeringInvestorPreviewJson,
  ])

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return roleScopedSections
    return roleScopedSections.filter((s) => {
      const blob = [
        s.sectionLabel,
        s.documentLabel,
        s.visibility,
        sectionSharedWithDisplay(s.sharedWithScope),
        s.dateAdded,
        ...s.nestedDocuments.flatMap((d) => {
          const ref =
            sections.find((sec) => sec.id === d.lpDisplaySectionId) ?? s
          return [
            d.name,
            sectionDisplayLabel(ref),
            sectionSharedWithDisplay(effectiveDocumentSharedWithScope(d, s)),
            [
              sharedAudienceSearchBlob(
                d.sharedDealClassIds,
                d.sharedInvestorIds,
                d.sharedWithAllInvestors,
                dealClasses,
                lpInvestorRows,
              ),
              sponsorAudienceSearchBlob(
                d.sharedSponsorUserIds ?? [],
                sponsorUserOptions,
              ),
            ].join(" "),
          ]
        }),
      ]
        .join(" ")
        .toLowerCase()
      return blob.includes(q)
    })
  }, [roleScopedSections, query, dealClasses, lpInvestorRows, sponsorUserOptions])

  const emptySearchLabel = query.trim() ? "No sections match your search." : null

  if (!dealIdTrim) {
    return (
      <div className="deal_docs">
        <p className="deal_docs_ui_empty" role="status">
          Save the deal before managing documents.
        </p>
      </div>
    )
  }

  const quickUploadBusy = documentUploadBusy || quickUploadPickerOpening

  const renderQuickUploadDropzone = (variant: "toolbar" | "panel") => (
    <div
      className={[
        variant === "panel" ? "deal_docs_empty_dropzone" : "",
        variant === "panel" && quickUploadDropFocus
          ? "deal_docs_empty_dropzone--focus"
          : "",
        variant === "panel" && quickUploadBusy
          ? "deal_docs_empty_dropzone--busy"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={quickUploadBusy ? -1 : 0}
      aria-label={`Upload ${DEAL_OFFERING_DOCUMENT_TYPES_LABEL} documents to the General section`}
      aria-busy={quickUploadBusy}
      onClick={() => {
        if (!quickUploadBusy) openQuickUploadPicker()
      }}
      onKeyDown={onQuickUploadKeyDown}
      onDragEnter={(e) => {
        e.preventDefault()
        if (!quickUploadBusy) setQuickUploadDropFocus(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!quickUploadBusy) setQuickUploadDropFocus(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setQuickUploadDropFocus(false)
        }
      }}
      onDrop={onQuickUploadDrop}
    >
      {quickUploadBusy ? (
        <Loader2
          size={variant === "panel" ? 22 : 16}
          strokeWidth={2}
          className="deals_deal_view_spinner"
          aria-hidden
        />
      ) : (
        <Upload
          size={variant === "panel" ? 22 : 16}
          strokeWidth={2}
          aria-hidden
        />
      )}
      {variant === "panel" ? (
        <>
          <span className="deal_docs_empty_dropzone_title">
            {quickUploadPickerOpening
              ? "Opening the file browser to select a file"
              : documentUploadBusy
                ? "Uploading…"
                : "Click or drag files"}
          </span>
          {quickUploadPickerOpening || documentUploadBusy ? null : (
            <span className="deal_docs_empty_dropzone_hint">
              {DEAL_OFFERING_DOCUMENT_LIMITS_HINT}
            </span>
          )}
        </>
      ) : null}
    </div>
  )

  return (
    <div className="deal_docs">
      <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_assets_datatable_panel">
        <div
          className="um_toolbar deal_docs_toolbar um_toolbar_export_then_search deal_docs_toolbar_documents"
          role="toolbar"
          aria-label="Document actions"
        >
          <div className="um_toolbar_actions deal_docs_toolbar_actions deal_docs_toolbar_actions_leading">
            <input
              ref={quickUploadInputRef}
              type="file"
              className="deal_docs_file_input"
              multiple
              accept={DEAL_OFFERING_DOCUMENT_ACCEPT}
              onChange={onQuickUploadInputChange}
              {...nativeFilePickerCancelProps(endQuickUploadPicker)}
              aria-hidden
              tabIndex={-1}
            />
            <button
              type="button"
              className="deal_docs_toolbar_btn"
              disabled={selectedDownloadableCount === 0 || documentDownloadBusy}
              onClick={downloadCheckedDocuments}
            >
              <Download size={16} strokeWidth={2} aria-hidden />
              Download selected
              {selectedDownloadableCount > 0
                ? ` (${selectedDownloadableCount})`
                : ""}
            </button>
            <button
              type="button"
              className="deal_docs_toolbar_btn"
              disabled={sections.length < 2}
              onClick={() => openMoveSelectedDocumentsModal()}
            >
              <ArrowRightLeft size={16} strokeWidth={2} aria-hidden />
              Move selected
              {selectedMovableDocumentCount > 0
                ? ` (${selectedMovableDocumentCount})`
                : ""}
            </button>
          </div>
          <div className="um_toolbar_actions deal_docs_toolbar_actions deal_docs_toolbar_actions_trailing">
            <div className="um_search_wrap">
              <Search className="um_search_icon" size={18} strokeWidth={2} aria-hidden />
              <input
                type="search"
                className="um_search_input"
                placeholder="Search documents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search documents"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className="um_btn_primary deal_docs_add_section_btn"
              onClick={onAddSection}
            >
              <Plus size={18} strokeWidth={2} aria-hidden />
              Add section
            </button>
          </div>
        </div>
        {quickUploadError ? (
          <p className="deals_create_error deal_docs_quick_upload_error" role="alert">
            {quickUploadError}
          </p>
        ) : null}

        <div className="deal_docs_ui_root">
          <div className="deal_docs_ui_empty_zone">
            {renderQuickUploadDropzone("panel")}
          </div>
          {emptySearchLabel ? (
            <p className="deal_docs_ui_empty">{emptySearchLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="deal_offering_stack deal_docs_sections_stack" role="list">
          {filteredSections.map((section) => {
              const isOpen = expandedSections[section.id] ?? false
              const n = section.nestedDocuments.length
              const panelId = `${section.id}-docs-panel`
              const isBuiltInSection = isBuiltInDocumentSection(section)
              const isAutoManagedSection = isAutoManagedDocumentsSection(section)
              const isEsignSection = isEsignTemplateDocumentsSection(section)
              const canRenameSection =
                viewerCanRenameDocumentSections &&
                isBuiltInDocumentSectionLabelEditable(section)
              const isEditingSection = editingSectionId === section.id
              const sectionLabel = sectionDisplayLabel(section)
              const selectedInSection = section.nestedDocuments.filter((d) =>
                Boolean(checkedDocsBySection[section.id]?.[d.id]),
              ).length
              return (
                <div
                  key={section.id}
                  className={`deal_docs_ui_bundle deal_offering_section${isOpen ? " deal_offering_section_expanded" : ""}`}
                  role="listitem"
                >
                  <div
                    className="deal_docs_ui_banner"
                    role="region"
                    aria-label={sectionLabel}
                  >
                    <button
                      type="button"
                      className="deal_docs_ui_banner_toggle"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggleSection(section.id)}
                    >
                      <span className="deal_docs_ui_banner_chevron_slot" aria-hidden>
                        <ChevronDown
                          size={14}
                          strokeWidth={2.75}
                          className={`deal_docs_ui_banner_chevron${isOpen ? " deal_docs_ui_banner_chevron_open" : ""}`}
                        />
                      </span>
                      <span className="deal_docs_ui_banner_heading">
                        {isEditingSection ? (
                          <span className="deal_docs_ui_banner_title_edit_wrap">
                            <input
                              type="text"
                              className="deal_docs_ui_banner_title_input"
                              value={editingSectionDraft}
                              disabled={sectionRenameBusy}
                              aria-label="Section name"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setEditingSectionDraft(e.target.value)
                              }
                              onKeyDown={(e) => {
                                e.stopPropagation()
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  saveSectionRename()
                                } else if (e.key === "Escape") {
                                  e.preventDefault()
                                  cancelSectionRename()
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="deal_docs_ui_banner_icon_btn deal_docs_ui_banner_save_btn"
                              title="Save section name"
                              aria-label="Save section name"
                              disabled={sectionRenameBusy}
                              onClick={(e) => {
                                e.stopPropagation()
                                saveSectionRename()
                              }}
                            >
                              <Check size={15} strokeWidth={2.5} aria-hidden />
                            </button>
                          </span>
                        ) : (
                          <span
                            className={`deal_docs_ui_banner_title${canRenameSection ? " deal_docs_ui_banner_title_editable" : ""}`}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              if (canRenameSection) startSectionRename(section)
                            }}
                            title={
                              canRenameSection
                                ? "Double-click to edit section name"
                                : undefined
                            }
                          >
                            {sectionLabel}
                          </span>
                        )}
                        {n > 0 ? (
                          <span
                            className="deal_docs_ui_banner_inline_actions"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {selectedInSection > 0 ? (
                              <>
                                <button
                                  type="button"
                                  className="deal_docs_ui_banner_link_btn deal_docs_ui_banner_clear_btn"
                                  onClick={() => clearChecksInSection(section.id)}
                                >
                                  <X size={14} strokeWidth={2} aria-hidden />
                                  Clear selection
                                </button>
                                {!isAutoManagedSection && sections.length >= 2 ? (
                                  <button
                                    type="button"
                                    className="deal_docs_ui_banner_link_btn"
                                    onClick={() =>
                                      openMoveSelectedDocumentsModal(section.id)
                                    }
                                  >
                                    <ArrowRightLeft
                                      size={14}
                                      strokeWidth={2}
                                      aria-hidden
                                    />
                                    Move selected ({selectedInSection})
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="deal_docs_ui_banner_link_btn"
                                  disabled={documentDownloadBusy}
                                  onClick={() =>
                                    void downloadDocuments(
                                      section.nestedDocuments
                                        .filter((d) =>
                                          Boolean(
                                            checkedDocsBySection[section.id]?.[d.id],
                                          ),
                                        )
                                        .filter((d) => d.url?.trim())
                                        .map((d) => ({
                                          sectionName: sectionLabel,
                                          doc: d,
                                        })),
                                    )
                                  }
                                >
                                  <Download size={14} strokeWidth={2} aria-hidden />
                                  Download selected ({selectedInSection})
                                </button>
                                <span
                                  className="deal_docs_ui_banner_inline_sep"
                                  aria-hidden
                                >
                                  ·
                                </span>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className="deal_docs_ui_banner_link_btn deal_docs_ui_banner_select_all_btn"
                              onClick={() =>
                                checkAllInSection(
                                  section.id,
                                  section.nestedDocuments.map((d) => d.id),
                                )
                              }
                            >
                              <ListChecks size={14} strokeWidth={2} aria-hidden />
                              Select all
                            </button>
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <div
                      className="deal_docs_ui_banner_right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {canRenameSection &&
                      !isBuiltInSection &&
                      !isEditingSection ? (
                        <button
                          type="button"
                          className="deal_docs_ui_banner_icon_btn"
                          title="Edit section name"
                          aria-label={`Edit section name ${sectionLabel}`}
                          onClick={() => startSectionRename(section)}
                        >
                          <Pencil size={16} strokeWidth={2} aria-hidden />
                        </button>
                      ) : (
                        <span
                          className="deal_docs_ui_banner_icon_slot"
                          aria-hidden
                        />
                      )}
                      {!isAutoManagedSection ? (
                        <button
                          type="button"
                          className="deal_docs_ui_banner_icon_btn"
                          aria-label={`Add documents to ${sectionLabel}`}
                          onClick={() => openUploadDocumentsModal(section)}
                        >
                          <Plus size={18} strokeWidth={2} aria-hidden />
                        </button>
                      ) : (
                        <span
                          className="deal_docs_ui_banner_icon_slot"
                          aria-hidden
                        />
                      )}
                      {!isBuiltInSection && !isAutoManagedSection ? (
                        <button
                          type="button"
                          className="deal_docs_ui_banner_icon_btn deal_docs_ui_banner_icon_btn_danger"
                          aria-label={`Delete section ${sectionLabel}`}
                          onClick={() =>
                            setDeletePending({
                              kind: "section",
                              sectionId: section.id,
                              label: sectionLabel,
                            })
                          }
                        >
                          <Trash2 size={18} strokeWidth={2} aria-hidden />
                        </button>
                      ) : (
                        <span
                          className="deal_docs_ui_banner_icon_slot"
                          aria-hidden
                        />
                      )}
                      <span className="deal_docs_ui_banner_count" aria-live="polite">
                        {n} document{n === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div
                    id={panelId}
                    className="deal_docs_ui_panel"
                    hidden={!isOpen}
                  >
                    {n === 0 ? (
                      <p className="deal_docs_ui_panel_empty">No documents yet.</p>
                    ) : (
                      <DocumentsTableScroll active={isOpen}>
                        <table className="deal_docs_ui_table">
                          <thead>
                            <tr>
                              <th className="deal_docs_ui_th deal_docs_ui_th_check" scope="col">
                                <span className="deal_docs_ui_sr">Select</span>
                              </th>
                              <th className="deal_docs_ui_th deal_docs_ui_th_doc" scope="col">
                                Document
                              </th>
                              <th className="deal_docs_ui_th deal_docs_ui_th_date" scope="col">
                                Date added
                              </th>
                              {!isEsignSection ? (
                              <th
                                className="deal_docs_ui_th deal_docs_ui_th_shared_entities"
                                scope="col"
                              >
                                <DocumentsTableColumnHeader
                                  label="Shared With"
                                  hint={
                                    <p className="deals_table_header_tooltip_p">
                                      Optional. Leave empty so every signed-in investor on
                                      the deal can see the file when Visibility allows it.
                                      Or pick deal classes, <strong>Sponsor user investors</strong>,
                                      individual investors, or <strong>All Investors</strong> to
                                      limit the LP portal. Sharing with a co-sponsor includes
                                      their investors only when that co-sponsor chose{" "}
                                      <strong>No intercept</strong>. With{" "}
                                      <strong>Yes intercept</strong>, the file stays with the
                                      co-sponsor until they share it with their investors.
                                      Use the email icon to notify those recipients.
                                      If any of a co-sponsor’s investors are notified, that
                                      co-sponsor is notified too.
                                    </p>
                                  }
                                />
                              </th>
                              ) : null}
                              <th className="deal_docs_ui_th deal_docs_ui_th_shared" scope="col">
                                <DocumentsTableColumnHeader
                                  label="Visibility"
                                  hint={
                                    <p className="deals_table_header_tooltip_p">
                                      <strong>Hidden by default</strong>: sponsor
                                      workspace only — not on the offering link, preview,
                                      or LP portal. <strong>Offering
                                      link</strong>: file appears on Preview offering, the
                                      no-login shared investor link, and the LP portal for
                                      signed-in investors. <strong>LP portal only</strong>:
                                      signed-in investors in the LP portal — not on the
                                      public offering link or preview.
                                    </p>
                                  }
                                />
                              </th>
                              <th className="deal_docs_ui_th deal_docs_ui_th_label" scope="col">
                                Label (Visible to LPs)
                              </th>
                              <th className="deal_docs_ui_th deal_docs_ui_th_actions" scope="col">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.nestedDocuments.map((d) => {
                              const url = d.url?.trim()
                              const checked = Boolean(
                                checkedDocsBySection[section.id]?.[d.id],
                              )
                              const checkId = `${section.id}-check-${d.id}`
                              return (
                                <tr key={d.id} className="deal_docs_ui_tr">
                                  <td className="deal_docs_ui_td deal_docs_ui_td_check">
                                    <input
                                      id={checkId}
                                      type="checkbox"
                                      className="deal_docs_ui_row_checkbox"
                                      checked={checked}
                                      aria-label={`Select ${d.name}`}
                                      onChange={(e) => {
                                        setCheckedDocsBySection((prev) => ({
                                          ...prev,
                                          [section.id]: {
                                            ...prev[section.id],
                                            [d.id]: e.target.checked,
                                          },
                                        }))
                                      }}
                                    />
                                  </td>
                                  <td className="deal_docs_ui_td deal_docs_ui_td_doc">
                                    <div className="deal_docs_ui_doc_cell">
                                      <DocumentsTableDocName name={d.name} href={url} />
                                      <div className="deal_docs_ui_doc_quick">
                                        <button
                                          type="button"
                                          className="deal_docs_ui_doc_icon_btn"
                                          title="Copy link"
                                          aria-label={`Copy link for ${d.name}`}
                                          disabled={!url}
                                          onClick={() => url && copyDocLink(url)}
                                        >
                                          <Link2 size={16} strokeWidth={2} aria-hidden />
                                        </button>
                                        {url ? (
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_link"
                                            title="View"
                                            aria-label={`View ${d.name}`}
                                          >
                                            <Eye size={16} strokeWidth={2} aria-hidden />
                                          </a>
                                        ) : (
                                          <span
                                            className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_btn_disabled"
                                            aria-hidden
                                          >
                                            <Eye size={16} strokeWidth={2} />
                                          </span>
                                        )}
                                        {url ? (
                                          <button
                                            type="button"
                                            className="deal_docs_ui_doc_icon_btn"
                                            title="Download"
                                            aria-label={`Download ${d.name}`}
                                            disabled={documentDownloadBusy}
                                            onClick={() =>
                                              downloadSingleDocument(sectionLabel, d)
                                            }
                                          >
                                            <Download size={16} strokeWidth={2} aria-hidden />
                                          </button>
                                        ) : (
                                          <span
                                            className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_btn_disabled"
                                            aria-hidden
                                          >
                                            <Download size={16} strokeWidth={2} />
                                          </span>
                                        )}
                                        {viewerCanSponsorSign &&
                                        nestedDocumentNeedsSponsorSign(d) ? (
                                          <button
                                            type="button"
                                            className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_sign_btn"
                                            title="Sponsor sign"
                                            aria-label={`Sponsor sign ${d.name}`}
                                            onClick={() =>
                                              setSponsorSignTarget({
                                                documentName: d.name,
                                                signatureRequestId:
                                                  d.esignSignatureRequestId!,
                                              })
                                            }
                                          >
                                            <FileSignature
                                              size={16}
                                              strokeWidth={2}
                                              aria-hidden
                                            />
                                          </button>
                                        ) : null}
                                        {!isAutoManagedSection ? (
                                          <button
                                            type="button"
                                            className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_btn_danger"
                                            title="Delete document"
                                            aria-label={`Delete ${d.name}`}
                                            onClick={() =>
                                              promptDeleteDocument(section.id, d)
                                            }
                                          >
                                            <Trash2
                                              size={16}
                                              strokeWidth={2}
                                              aria-hidden
                                            />
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="deal_docs_ui_td deal_docs_ui_td_date">
                                    {d.dateAdded}
                                  </td>
                                  {!isEsignSection ? (
                                  <td
                                    className="deal_docs_ui_td deal_docs_ui_td_shared_entities"
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <DocumentSharedWithPicker
                                      dealId={dealIdTrim}
                                      idPrefix={`${section.id}-${d.id}`}
                                      classIds={d.sharedDealClassIds}
                                      investorIds={d.sharedInvestorIds}
                                      sponsorUserIds={d.sharedSponsorUserIds ?? []}
                                      allInvestors={d.sharedWithAllInvestors}
                                      dealClasses={dealClasses}
                                      investors={lpInvestorRows}
                                      sponsorUserOptions={sponsorUserOptions}
                                      docName={d.name}
                                      onClassChange={(classId, checked) => {
                                        setSections((prev) =>
                                          prev.map((s) =>
                                            s.id !== section.id
                                              ? s
                                              : {
                                                  ...s,
                                                  nestedDocuments: s.nestedDocuments.map(
                                                    (n) => {
                                                      if (n.id !== d.id) return n
                                                      return patchDocAfterAudienceChange({
                                                        ...n,
                                                        sharedDealClassIds: toggleIdInList(
                                                          n.sharedDealClassIds,
                                                          classId,
                                                          checked,
                                                        ),
                                                      })
                                                    },
                                                  ),
                                                },
                                          ),
                                        )
                                      }}
                                      onInvestorChange={(investorRowId, checked) => {
                                        setSections((prev) =>
                                          prev.map((s) =>
                                            s.id !== section.id
                                              ? s
                                              : {
                                                  ...s,
                                                  nestedDocuments: s.nestedDocuments.map(
                                                    (n) => {
                                                      if (n.id !== d.id) return n
                                                      return patchDocAfterAudienceChange({
                                                        ...n,
                                                        sharedWithAllInvestors: false,
                                                        sharedInvestorIds: toggleIdInList(
                                                          n.sharedInvestorIds,
                                                          investorRowId,
                                                          checked,
                                                        ),
                                                      })
                                                    },
                                                  ),
                                                },
                                          ),
                                        )
                                      }}
                                      onAllInvestorsChange={(checked) => {
                                        setSections((prev) =>
                                          prev.map((s) =>
                                            s.id !== section.id
                                              ? s
                                              : {
                                                  ...s,
                                                  nestedDocuments: s.nestedDocuments.map(
                                                    (n) => {
                                                      if (n.id !== d.id) return n
                                                      return patchDocAfterAudienceChange({
                                                        ...n,
                                                        sharedWithAllInvestors: checked,
                                                        sharedInvestorIds: checked
                                                          ? []
                                                          : n.sharedInvestorIds,
                                                        sharedSponsorUserIds: checked
                                                          ? []
                                                          : (n.sharedSponsorUserIds ?? []),
                                                      })
                                                    },
                                                  ),
                                                },
                                          ),
                                        )
                                      }}
                                      onSponsorUserChange={(sponsorUserId, checked) => {
                                        setSections((prev) =>
                                          prev.map((s) =>
                                            s.id !== section.id
                                              ? s
                                              : {
                                                  ...s,
                                                  nestedDocuments: s.nestedDocuments.map(
                                                    (n) => {
                                                      if (n.id !== d.id) return n
                                                      return patchDocAfterAudienceChange({
                                                        ...n,
                                                        sharedWithAllInvestors: false,
                                                        sharedSponsorUserIds: toggleIdInList(
                                                          n.sharedSponsorUserIds ?? [],
                                                          sponsorUserId,
                                                          checked,
                                                        ),
                                                      })
                                                    },
                                                  ),
                                                },
                                          ),
                                        )
                                      }}
                                    />
                                  </td>
                                  ) : null}
                                  <td className="deal_docs_ui_td deal_docs_ui_td_shared">
                                    <div className="deal_docs_ui_shared">
                                      <div className="deal_docs_ui_shared_body">
                                        <select
                                          className="deal_docs_ui_pill_select deal_docs_ui_shared_select"
                                          aria-label={`Visibility for ${d.name}`}
                                          value={effectiveDocumentSharedWithScope(
                                            d,
                                            section,
                                          )}
                                          disabled={isAutoManagedSection}
                                          onChange={(e) => {
                                            const v =
                                              e.target.value as SectionSharedWithScope
                                            requestDocumentVisibilityChange(
                                              section.id,
                                              d,
                                              section,
                                              v,
                                            )
                                          }}
                                        >
                                          <option value="not_visible">
                                            Hidden by default
                                          </option>
                                          <option value="offering_page">
                                            Offering link
                                          </option>
                                          <option value="lp_investor">
                                            LP portal only
                                          </option>
                                        </select>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="deal_docs_ui_td deal_docs_ui_td_label">
                                    <select
                                      className="deal_docs_ui_pill_select"
                                      aria-label={`LP-visible section label for ${d.name}`}
                                      value={
                                        sections.some((x) => x.id === d.lpDisplaySectionId)
                                          ? d.lpDisplaySectionId
                                          : section.id
                                      }
                                      onChange={(e) => {
                                        const sectionId = e.target.value
                                        setSections((prev) =>
                                          prev.map((s) =>
                                            s.id !== section.id
                                              ? s
                                              : {
                                                  ...s,
                                                  nestedDocuments: s.nestedDocuments.map(
                                                    (n) =>
                                                      n.id === d.id
                                                        ? {
                                                            ...n,
                                                            lpDisplaySectionId:
                                                              sectionId,
                                                          }
                                                        : n,
                                                  ),
                                                },
                                          ),
                                        )
                                      }}
                                    >
                                      {sections.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {sectionDisplayLabel(opt)}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="deal_docs_ui_td deal_docs_ui_td_actions">
                                    <div className="deal_docs_ui_row_actions">
                                      {isEsignSection &&
                                      viewerCanSponsorSign &&
                                      nestedDocumentNeedsSponsorSign(d) ? (
                                        <button
                                          type="button"
                                          className="deal_docs_ui_row_icon_btn deal_docs_ui_doc_sign_btn"
                                          title="Sponsor counter-sign"
                                          aria-label={`Sponsor sign ${d.name}`}
                                          onClick={() =>
                                            setSponsorSignTarget({
                                              documentName: d.name,
                                              signatureRequestId:
                                                d.esignSignatureRequestId!,
                                            })
                                          }
                                        >
                                          <FileSignature
                                            size={16}
                                            strokeWidth={2}
                                            aria-hidden
                                          />
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="deal_docs_ui_row_icon_btn"
                                        title="Edit (coming soon)"
                                        aria-label={`Edit ${d.name}`}
                                        disabled
                                      >
                                        <Pencil size={16} strokeWidth={2} aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="deal_docs_ui_row_icon_btn"
                                        title="Duplicate"
                                        aria-label={`Duplicate ${d.name}`}
                                        disabled={isAutoManagedSection}
                                        onClick={() =>
                                          duplicateNestedDocument(section.id, d)
                                        }
                                      >
                                        <Copy size={16} strokeWidth={2} aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="deal_docs_ui_row_icon_btn"
                                        title="Move to another section"
                                        aria-label={`Move ${d.name} to another section`}
                                        disabled={
                                          isAutoManagedSection ||
                                          sections.length < 2
                                        }
                                        onClick={() =>
                                          openMoveDocumentModal(section.id, d)
                                        }
                                      >
                                        <ArrowRightLeft
                                          size={16}
                                          strokeWidth={2}
                                          aria-hidden
                                        />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </DocumentsTableScroll>
                    )}
                  </div>
                </div>
              )
            })}
      </div>
      {showAddSectionModal
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_docs_section_modal_overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !documentUploadBusy) {
                  closeAddSectionModal()
                }
              }}
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_docs_section_modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={addSectionTitleId}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <div className="add_contact_modal_head_main">
                    <FormHeadingWithInfo
                      as="h2"
                      id={addSectionTitleId}
                      className="um_modal_title add_contact_modal_title"
                      title="Add section"
                      info={
                        <p>
                          Create a named section for offering documents. You can
                          add files now or upload them later from the section
                          toolbar.
                        </p>
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="um_modal_close"
                    aria-label="Close"
                    disabled={documentUploadBusy}
                    onClick={closeAddSectionModal}
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <form
                  className="deals_add_inv_modal_form deal_docs_section_modal_form"
                  onSubmit={onSubmitAddSection}
                  noValidate
                >
                  <div className="deals_add_inv_modal_scroll deal_docs_section_modal_scroll">
                    <div className="deal_docs_section_modal_fields">
                      <div className="um_field deal_docs_section_modal_field">
                        <label className="um_label" htmlFor={sectionNameFieldId}>
                          Section name
                        </label>
                        <input
                          id={sectionNameFieldId}
                          type="text"
                          className="um_input"
                          value={sectionName}
                          onChange={(e) => {
                            setSectionName(e.target.value)
                            setAddSectionError(null)
                          }}
                          placeholder="e.g. Offering Memorandum"
                          aria-invalid={
                            !sectionName.trim() && addSectionError != null
                          }
                          autoFocus
                          required
                        />
                      </div>
                      <div className="deal_docs_section_modal_upload_block">
                        <span
                          className="deal_docs_section_modal_upload_label"
                          id={`${sectionUploadFieldId}-label`}
                        >
                          Upload documents
                        </span>
                        <DocumentsPdfUploadDropzone
                          id={sectionUploadFieldId}
                          disabled={documentUploadBusy}
                          inputRef={sectionFileInputRef}
                          onPickClick={() => sectionFileInputRef.current?.click()}
                          onInputChange={onSectionFilesChange}
                          onFilesDropped={appendSectionFiles}
                        />
                        <p className="deal_docs_section_modal_upload_hint">
                          Optional. PDF, Word, PowerPoint, or Excel — select
                          multiple files if needed.
                        </p>
                      </div>
                      <ModalPendingDocumentFilesList
                        files={sectionFiles}
                        disabled={documentUploadBusy}
                        onRemove={removeSectionFileAt}
                      />
                      {sectionFiles.length > 0 ? (
                        <p className="deal_docs_section_modal_status" role="status">
                          <strong>{sectionFiles.length}</strong>{" "}
                          {sectionFiles.length === 1 ? "file" : "files"} ready to
                          upload when you save.
                        </p>
                      ) : null}
                      {addSectionError ? (
                        <p
                          className="deal_docs_section_modal_error"
                          role="alert"
                        >
                          {addSectionError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="um_modal_actions add_contact_modal_actions">
                    <button
                      type="button"
                      className="um_btn_secondary"
                      disabled={documentUploadBusy}
                      onClick={closeAddSectionModal}
                    >
                      <X size={16} strokeWidth={2} aria-hidden />
                      Close
                    </button>
                    <button
                      type="submit"
                      className="um_btn_primary"
                      disabled={documentUploadBusy}
                    >
                      {documentUploadBusy ? (
                        <>
                          <Loader2
                            size={16}
                            strokeWidth={2}
                            className="deals_deal_view_spinner"
                            aria-hidden
                          />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Save size={16} strokeWidth={2} aria-hidden />
                          Save
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
      {showUploadDocsModal
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_docs_section_modal_overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !documentUploadBusy) {
                  closeUploadDocsModal()
                }
              }}
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_docs_section_modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={uploadDocsTitleId}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <div className="add_contact_modal_head_main">
                    <FormHeadingWithInfo
                      as="h2"
                      id={uploadDocsTitleId}
                      className="um_modal_title add_contact_modal_title"
                      title="Upload documents"
                      info={
                        <p>
                          Add PDF, Word, PowerPoint, or Excel files to the
                          selected section. You can upload up to 50 files at a
                          time, 100 MB each. They appear in this section&apos;s
                          document list after upload.
                        </p>
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="um_modal_close"
                    aria-label="Close"
                    disabled={documentUploadBusy}
                    onClick={closeUploadDocsModal}
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <form
                  className="deals_add_inv_modal_form deal_docs_section_modal_form"
                  onSubmit={onSubmitUploadDocuments}
                  noValidate
                >
                  <div className="deals_add_inv_modal_scroll deal_docs_section_modal_scroll">
                    <div className="deal_docs_section_modal_fields">
                      <p className="deal_docs_move_modal_summary">
                        Section:{" "}
                        <strong>{uploadTargetLabel || "Section"}</strong>
                      </p>
                      <div className="deal_docs_section_modal_upload_block">
                        <span className="deal_docs_section_modal_upload_label">
                          Documents
                        </span>
                        <DocumentsPdfUploadDropzone
                          id={uploadDocsUploadFieldId}
                          disabled={documentUploadBusy}
                          inputRef={uploadFileInputRef}
                          onPickClick={() => uploadFileInputRef.current?.click()}
                          onInputChange={onUploadFilesChange}
                          onFilesDropped={appendUploadFiles}
                        />
                        <p className="deal_docs_section_modal_upload_hint">
                          PDF, Word, PowerPoint, or Excel — select multiple
                          files if needed.
                        </p>
                      </div>
                      <ModalPendingDocumentFilesList
                        files={uploadFiles}
                        disabled={documentUploadBusy}
                        onRemove={removeUploadFileAt}
                      />
                      {uploadFiles.length > 0 ? (
                        <p
                          className="deal_docs_section_modal_status"
                          role="status"
                        >
                          <strong>{uploadFiles.length}</strong>{" "}
                          {uploadFiles.length === 1 ? "file" : "files"} ready to
                          upload.
                        </p>
                      ) : null}
                      {uploadDocsError ? (
                        <p
                          className="deal_docs_section_modal_error"
                          role="alert"
                        >
                          {uploadDocsError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="um_modal_actions add_contact_modal_actions">
                    <button
                      type="button"
                      className="um_btn_secondary"
                      disabled={documentUploadBusy}
                      onClick={closeUploadDocsModal}
                    >
                      <X size={16} strokeWidth={2} aria-hidden />
                      Close
                    </button>
                    <button
                      type="submit"
                      className="um_btn_primary"
                      disabled={documentUploadBusy}
                    >
                      {documentUploadBusy ? (
                        <>
                          <Loader2
                            size={16}
                            strokeWidth={2}
                            className="deals_deal_view_spinner"
                            aria-hidden
                          />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload size={16} strokeWidth={2} aria-hidden />
                          Upload
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDeleteModal
        open={deletePending != null}
        message="Are you sure you want to delete this file? This action cannot be undone."
        itemLabel={
          deletePending?.kind === "section" ?
            `Section: ${deletePending.label}`
          : deletePending?.label
        }
        onCancel={() => setDeletePending(null)}
        onConfirm={onConfirmDeletePending}
      />

      {visibilityChangePending
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_docs_shared_notify_overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  !visibilitySaveBusy
                ) {
                  cancelVisibilityChange()
                }
              }}
            >
              <div
                className="um_modal deals_add_inv_modal_panel add_contact_panel deal_docs_shared_notify_modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={visibilityConfirmTitleId}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <h3
                    id={visibilityConfirmTitleId}
                    className="um_modal_title add_contact_modal_title"
                  >
                    Save visibility change?
                  </h3>
                  <button
                    type="button"
                    className="um_modal_close"
                    aria-label="Close"
                    disabled={visibilitySaveBusy}
                    onClick={cancelVisibilityChange}
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="deals_add_inv_modal_scroll">
                  <p className="deal_offering_muted">
                    Update visibility for{" "}
                    <strong>{visibilityChangePending.docName}</strong>?
                  </p>
                  <p className="deal_offering_muted">
                    <strong>From:</strong>{" "}
                    {sectionSharedWithDisplay(
                      visibilityChangePending.previousScope,
                    )}
                    <br />
                    <strong>To:</strong>{" "}
                    {sectionSharedWithDisplay(visibilityChangePending.nextScope)}
                  </p>
                  <p className="deal_offering_muted">
                    {visibilityChangePending.nextScope === "not_visible" ?
                      "This file will be Hidden by default — hidden from the public offering link, preview, and LP portal. Only the sponsor workspace will show it."
                    : visibilityChangePending.nextScope === "lp_investor" ?
                      "Signed-in investors will see this file on the Offering Documents tab in the LP portal. It will not appear on the public offering link."
                    : "This file will appear on the public offering link, preview, and the Offering Documents tab for signed-in investors."}
                  </p>
                </div>
                <div className="um_modal_actions add_contact_modal_actions">
                  <button
                    type="button"
                    className="um_btn_secondary"
                    disabled={visibilitySaveBusy}
                    onClick={cancelVisibilityChange}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    Close
                  </button>
                  <button
                    type="button"
                    className="um_btn_primary"
                    disabled={visibilitySaveBusy}
                    onClick={confirmVisibilityChange}
                  >
                    {visibilitySaveBusy ? (
                      <>
                        <Loader2
                          size={16}
                          strokeWidth={2}
                          className="deals_deal_view_spinner"
                          aria-hidden
                        />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save size={16} strokeWidth={2} aria-hidden />
                        Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moveSelectRequiredOpen
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_docs_section_modal_overlay deal_docs_move_hint_overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMoveSelectRequiredOpen(false)
              }}
            >
              <div
                className="deal_docs_move_hint_modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={moveSelectRequiredTitleId}
                aria-describedby={`${moveSelectRequiredTitleId}-desc`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <header className="deal_docs_move_hint_head">
                  <span className="deal_docs_move_hint_icon" aria-hidden>
                    <ListChecks size={20} strokeWidth={2} />
                  </span>
                  <div className="deal_docs_move_hint_head_text">
                    <h2
                      id={moveSelectRequiredTitleId}
                      className="deal_docs_move_hint_title"
                    >
                      No documents selected
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="deal_docs_move_hint_close"
                    aria-label="Close"
                    onClick={() => setMoveSelectRequiredOpen(false)}
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </header>
                <div className="deal_docs_move_hint_body">
                  <p
                    id={`${moveSelectRequiredTitleId}-desc`}
                    className="deal_docs_move_hint_message"
                  >
                    Select one or more documents using the checkboxes in a section,
                    then choose <strong>Move selected</strong> to move them to
                    another section.
                  </p>
                </div>
                <footer className="deal_docs_move_hint_actions">
                  <button
                    type="button"
                    className="um_btn_secondary deal_docs_move_hint_btn"
                    onClick={() => setMoveSelectRequiredOpen(false)}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    Close
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moveDocumentPending
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_docs_section_modal_overlay deal_docs_shared_notify_overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) cancelMoveDocument()
              }}
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_docs_move_modal_shell deal_docs_move_modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={moveDocumentTitleId}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <div className="add_contact_modal_head_main">
                    <FormHeadingWithInfo
                      as="h2"
                      id={moveDocumentTitleId}
                      className="um_modal_title add_contact_modal_title"
                      title={
                        moveDocumentPending.items.length === 1
                          ? "Move document"
                          : `Move ${moveDocumentPending.items.length} documents`
                      }
                      info={
                        <p>
                          Choose a destination section. Documents already in that
                          section are skipped.
                        </p>
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="um_modal_close"
                    aria-label="Close"
                    onClick={cancelMoveDocument}
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="deals_add_inv_modal_scroll deal_docs_move_modal_scroll">
                  <p className="deal_docs_move_modal_summary">
                    {moveDocumentPending.items.length === 1 ? (
                      <>
                        Move{" "}
                        <strong>
                          {(() => {
                            const item = moveDocumentPending.items[0]!
                            const from = sections.find(
                              (s) => s.id === item.sectionId,
                            )
                            const doc = from?.nestedDocuments.find(
                              (d) => d.id === item.docId,
                            )
                            return doc?.name.trim() || "this document"
                          })()}
                        </strong>{" "}
                        from{" "}
                        <strong>
                          {(() => {
                            const item = moveDocumentPending.items[0]!
                            const from = sections.find(
                              (s) => s.id === item.sectionId,
                            )
                            return from
                              ? sectionDisplayLabel(from)
                              : "this section"
                          })()}
                        </strong>{" "}
                        to another section.
                      </>
                    ) : (
                      <>
                        Move <strong>{moveDocumentPending.items.length}</strong>{" "}
                        selected documents to another section. Documents already
                        in the destination section are skipped.
                      </>
                    )}
                  </p>
                  {moveDocumentPending.items.length > 1 &&
                  movableItemsForTarget.length > 0 ? (
                    <p className="deal_docs_move_modal_note" role="status">
                      <strong>{movableItemsForTarget.length}</strong> document
                      {movableItemsForTarget.length === 1 ? "" : "s"} will move to
                      the section you choose below.
                    </p>
                  ) : null}
                  {moveTargetSectionOptions.length === 0 ? (
                    <p className="deal_docs_move_modal_note deal_docs_move_modal_note--warn" role="status">
                      Add another section before moving documents.
                    </p>
                  ) : (
                    <fieldset className="deal_docs_move_section_fieldset">
                      <legend className="deal_docs_move_section_legend">
                        Destination section
                      </legend>
                      <ul className="deal_docs_move_section_list" role="list">
                        {moveTargetSectionOptions.map((target) => (
                          <li key={target.id}>
                            <label className="deal_docs_move_section_option">
                              <input
                                type="radio"
                                name="deal-docs-move-target"
                                className="deal_docs_move_section_radio"
                                value={target.id}
                                checked={moveTargetSectionId === target.id}
                                onChange={() =>
                                  setMoveTargetSectionId(target.id)
                                }
                              />
                              <span className="deal_docs_move_section_option_label">
                                {sectionDisplayLabel(target)}
                              </span>
                              <span className="deal_docs_move_section_option_meta">
                                {target.nestedDocuments.length} document
                                {target.nestedDocuments.length === 1 ? "" : "s"}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  )}
                </div>
                <div className="um_modal_actions add_contact_modal_actions">
                  <button
                    type="button"
                    className="um_btn_secondary"
                    onClick={cancelMoveDocument}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    Close
                  </button>
                  <div className="add_contact_modal_actions_trailing">
                    <button
                      type="button"
                      className="um_btn_primary"
                      disabled={
                        moveTargetSectionOptions.length === 0 ||
                        !moveTargetSectionId ||
                        movableItemsForTarget.length === 0
                      }
                      onClick={confirmMoveDocument}
                    >
                      <ArrowRightLeft size={16} strokeWidth={2} aria-hidden />
                      Move
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <SponsorEsignSignModal
        open={sponsorSignTarget != null}
        dealId={dealIdTrim}
        documentName={sponsorSignTarget?.documentName ?? ""}
        signatureRequestId={sponsorSignTarget?.signatureRequestId ?? ""}
        onClose={() => setSponsorSignTarget(null)}
        onSignedComplete={refreshEsignDocumentsAfterSponsorSign}
      />
    </div>
  )
}
