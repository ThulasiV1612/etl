import {
  Ban,
  ContactRound,
  // FilePenLine,
  LayoutTemplate,
  Mail,
  Paperclip,
  Plus,
  Search,
  // Send,
  Trash2,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { BulkDeleteReasonModal } from "../../../common/components/bulk-delete-reason-modal/BulkDeleteReasonModal"
import "../../../common/components/bulk-delete-reason-modal/bulk-delete-reason-modal.css"
import { ConfirmDeleteModal } from "../../../common/components/ConfirmDeleteModal"
import { toast } from "../../../common/components/Toast"
import { useDataTableRowSelection } from "../../../common/hooks/useDataTableRowSelection"
import { useNavigate } from "react-router-dom"
import DOMPurify from "dompurify"
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable"
import { ActiveArchivedTabs } from "../../../common/components/active-archived-tabs/ActiveArchivedTabs"
import { formatDateDdMmmYyyy } from "../../../common/utils/formatDateDisplay"
import "../../../common/components/work_in_progress_page.css"
import "../usermanagement/user_management.css"
import "../Deals/deals-list.css"
import "../Deals/deal-investors-tab.css"
import "./contacts.css"
import { EmailTemplateRowActions } from "./components/EmailTemplateRowActions"

/** Wide enough for the “Actions” header on one line (see contacts.css). */
const EMAIL_TEMPLATES_ACTIONS_COL_WIDTH = "7rem" as const
import {
  attachmentToObjectUrl,
  deleteEmailTemplate,
  formatEmailAttachmentSize,
  loadEmailTemplates,
  updateEmailTemplate,
  type EmailTemplateRow,
} from "./emailTemplatesStorage"

/** Match search against HTML body without treating markup as searchable words. */
function emailTemplateBodyPlainSearch(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export type { EmailTemplateRow }

// type EmailTemplatesTab = "templates" | "sent" | "draft"

type TemplatesListTab = "active" | "archived"

// function parseEmailTemplatesTab(_raw: string | null): EmailTemplatesTab {
//   if (raw === "sent" || raw === "draft") return raw
//   return "templates"
// }

function EmailTemplatesTemplatesTabContent() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<EmailTemplateRow[]>([])
  const [templatesListTab, setTemplatesListTab] =
    useState<TemplatesListTab>("active")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewRow, setViewRow] = useState<EmailTemplateRow | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false)
  const [suspendAllOpen, setSuspendAllOpen] = useState(false)
  const [suspendAllBusy, setSuspendAllBusy] = useState(false)

  const getRowId = useCallback((row: EmailTemplateRow) => row.id, [])

  const goNewTemplate = useCallback(() => {
    navigate("/contacts/email-templates/new")
  }, [navigate])

  const goEditTemplate = useCallback(
    (id: string) => {
      navigate(
        `/contacts/email-templates/edit/${encodeURIComponent(id)}`,
      )
    },
    [navigate],
  )

  const activeCount = useMemo(
    () => rows.filter((r) => !r.archived).length,
    [rows],
  )
  const archivedCount = useMemo(
    () => rows.filter((r) => r.archived).length,
    [rows],
  )

  const rowsForStatusTab = useMemo(
    () =>
      rows.filter((r) =>
        templatesListTab === "active" ? !r.archived : r.archived,
      ),
    [rows, templatesListTab],
  )

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rowsForStatusTab
    return rowsForStatusTab.filter((r) => {
      const name = (r.name ?? "").toLowerCase()
      const by = (r.createdBy ?? "").toLowerCase()
      const subject = (r.subject ?? "").toLowerCase()
      const bodyPlain = emailTemplateBodyPlainSearch(r.body ?? "")
      return (
        name.includes(q) ||
        by.includes(q) ||
        subject.includes(q) ||
        bodyPlain.includes(q)
      )
    })
  }, [rowsForStatusTab, searchQuery])

  const templatesEmptyLabel = useMemo(() => {
    if (rows.length === 0)
      return "No templates yet. Click New Template to create one."
    if (filteredRows.length === 0) {
      if (rowsForStatusTab.length === 0) {
        return templatesListTab === "archived"
          ? "No archived templates."
          : "No active templates."
      }
      return "No templates match your search."
    }
    return "No templates match your search."
  }, [
    filteredRows.length,
    rows.length,
    rowsForStatusTab.length,
    templatesListTab,
  ])

  const {
    selectedIds,
    selectedRows,
    selectAllRef,
    allSelected,
    toggleSelect,
    toggleSelectAllFiltered,
    clearSelection,
  } = useDataTableRowSelection({
    filteredRows,
    getRowId,
  })

  useEffect(() => {
    setPage(1)
  }, [searchQuery, templatesListTab])

  useEffect(() => {
    clearSelection()
  }, [templatesListTab, clearSelection])

  useEffect(() => {
    void (async () => {
      setRows(await loadEmailTemplates())
    })()
  }, [])

  const confirmBulkDelete = useCallback(
    async (_reason: string) => {
      const ids = [...selectedIds]
      if (ids.length === 0) return
      setBulkDeleteBusy(true)
      try {
        const results = await Promise.all(ids.map((id) => deleteEmailTemplate(id)))
        const failed = results.filter((ok) => !ok).length
        const succeeded = ids.length - failed
        if (succeeded > 0) {
          setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)))
          clearSelection()
        }
        if (failed > 0 && succeeded > 0) {
          toast.error(
            "Some templates could not be deleted",
            `${succeeded} deleted, ${failed} failed.`,
          )
        } else if (failed > 0) {
          toast.error("Could not delete templates", "Try again later.")
        } else {
          toast.success(
            ids.length === 1 ? "Template deleted" : "Templates deleted",
            ids.length === 1
              ? selectedRows[0]?.name ?? ""
              : `${ids.length} templates removed.`,
          )
        }
        setBulkDeleteOpen(false)
      } finally {
        setBulkDeleteBusy(false)
      }
    },
    [clearSelection, selectedIds, selectedRows],
  )

  const toggleTemplateArchive = useCallback(async (row: EmailTemplateRow) => {
    const nextArchived = !row.archived
    const ok = await updateEmailTemplate({
      ...row,
      archived: nextArchived,
    })
    if (!ok) {
      toast.error("Could not update template", "Template was not found.")
      return
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, archived: nextArchived } : r)))
    toast.success(
      nextArchived ? "Template archived" : "Template restored",
      row.name,
    )
  }, [])

  const confirmSuspendAll = useCallback(async () => {
    const toArchive = rows.filter((r) => !r.archived)
    if (toArchive.length === 0) {
      setSuspendAllOpen(false)
      return
    }
    setSuspendAllBusy(true)
    try {
      const results = await Promise.all(
        toArchive.map((row) =>
          updateEmailTemplate({ ...row, archived: true }),
        ),
      )
      const succeededIds = new Set(
        toArchive.filter((_, i) => results[i]).map((r) => r.id),
      )
      const failed = toArchive.length - succeededIds.size
      const succeeded = succeededIds.size
      if (succeeded > 0) {
        setRows((prev) =>
          prev.map((r) =>
            succeededIds.has(r.id) ? { ...r, archived: true } : r,
          ),
        )
        clearSelection()
      }
      if (failed > 0 && succeeded > 0) {
        toast.error(
          "Some templates could not be suspended",
          `${succeeded} archived, ${failed} failed.`,
        )
      } else if (failed > 0) {
        toast.error("Could not suspend templates", "Try again later.")
      } else {
        toast.success(
          toArchive.length === 1 ? "Template suspended" : "Templates suspended",
          toArchive.length === 1
            ? toArchive[0]?.name ?? ""
            : `${toArchive.length} templates moved to Archived.`,
        )
      }
      setSuspendAllOpen(false)
    } finally {
      setSuspendAllBusy(false)
    }
  }, [clearSelection, rows])

  const columns = useMemo((): DataTableColumn<EmailTemplateRow>[] => {
    return [
      {
        id: "select",
        header: (
          <input
            ref={selectAllRef}
            type="checkbox"
            className="um_table_header_select_cb"
            checked={allSelected}
            onChange={toggleSelectAllFiltered}
            disabled={filteredRows.length === 0}
            aria-label="Select all templates in this list"
          />
        ),
        align: "center",
        thClassName: "um_th_checkbox",
        tdClassName: "um_td_checkbox",
        cell: (row) => (
          <input
            type="checkbox"
            className="um_table_row_select_cb"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleSelect(row.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select template ${row.name}`}
          />
        ),
      },
      {
        id: "name",
        header: "Template name",
        sortValue: (row) => row.name.toLowerCase(),
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => (
          <span className="email_templates_name_cell" title={row.name}>
            {row.name}
          </span>
        ),
      },
      {
        id: "createdBy",
        header: "Added by",
        sortValue: (row) => row.createdBy.toLowerCase(),
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => {
          const s = row.createdBy?.trim() || "—"
          return (
            <span className="email_templates_meta_cell" title={s}>
              {s}
            </span>
          )
        },
      },
      {
        id: "createdAt",
        header: "Created at",
        sortValue: (row) => {
          const t = Date.parse(row.createdAt)
          return Number.isFinite(t) ? t : 0
        },
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => {
          const label = formatDateDdMmmYyyy(row.createdAt)
          const title =
            row.createdAt && label !== "—"
              ? String(row.createdAt)
              : undefined
          return (
            <span className="email_templates_meta_cell" title={title}>
              {label}
            </span>
          )
        },
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: EMAIL_TEMPLATES_ACTIONS_COL_WIDTH,
        thClassName: "um_th_actions contacts_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions contacts_td_actions",
        cell: (row) => (
          <EmailTemplateRowActions
            templateName={row.name}
            archived={Boolean(row.archived)}
            onView={() => setViewRow(row)}
            onEdit={() => goEditTemplate(row.id)}
            onArchiveToggle={() => toggleTemplateArchive(row)}
          />
        ),
      },
    ]
  }, [
    allSelected,
    filteredRows.length,
    goEditTemplate,
    selectAllRef,
    selectedIds,
    toggleSelect,
    toggleSelectAllFiltered,
    toggleTemplateArchive,
  ])

  return (
    <>
      <BulkDeleteReasonModal
        open={bulkDeleteOpen}
        title={
          selectedIds.size === 1
            ? "Delete email template?"
            : `Delete ${selectedIds.size} email templates?`
        }
        description={
          selectedIds.size === 1
            ? `Remove "${selectedRows[0]?.name ?? "this template"}" permanently? This cannot be undone.`
            : `Remove ${selectedIds.size} selected templates permanently? This cannot be undone.`
        }
        reasonLabel="Reason for deletion"
        reasonPlaceholder="e.g. Outdated content, created in error…"
        busy={bulkDeleteBusy}
        onClose={() => !bulkDeleteBusy && setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />
      <ConfirmDeleteModal
        open={suspendAllOpen}
        title="Suspend all templates?"
        message={
          activeCount === 1
            ? "Archive the only active template? It will move to the Archived tab."
            : `Archive all ${activeCount} active templates? They will move to the Archived tab.`
        }
        confirmLabel="Suspend all"
        busy={suspendAllBusy}
        onCancel={() => !suspendAllBusy && setSuspendAllOpen(false)}
        onConfirm={() => void confirmSuspendAll()}
      />
      <div className="um_members_header_block contacts_inner_header">
        <div className="contacts_toolbar_filters_row">
          <ActiveArchivedTabs
            value={templatesListTab}
            onChange={setTemplatesListTab}
            activeCount={activeCount}
            archivedCount={archivedCount}
            idPrefix="email-templates-filter"
            ariaLabel="Filter templates by status"
            activeIcon={ContactRound}
          />
          <button
            type="button"
            className="um_btn_primary contacts_toolbar_add_btn"
            onClick={goNewTemplate}
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            New Template
          </button>
        </div>
      </div>

      <div className="contacts_main_tab_panel_wrap">
        <div className="um_members_tab_content contacts_main_tab_content_flush">
          <div
            className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel"
            role="region"
            aria-label={
              templatesListTab === "archived"
                ? "Archived email templates"
                : "Active email templates"
            }
          >
            <div className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
              <div className="um_search_wrap">
                <Search className="um_search_icon" size={18} aria-hidden />
                <input
                  type="search"
                  className="um_search_input"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search templates"
                />
              </div>
              <div className="um_toolbar_actions deal_inv_table_toolbar_actions">
                <button
                  type="button"
                  className="um_btn_toolbar"
                  onClick={() => setSuspendAllOpen(true)}
                  disabled={
                    templatesListTab === "archived" || activeCount === 0
                  }
                >
                  <Ban size={18} strokeWidth={2} aria-hidden />
                  Suspend All
                </button>
                {selectedIds.size > 0 ? (
                  <button
                    type="button"
                    className="contacts_table_icon_action_btn um_toolbar_delete_btn"
                    onClick={() => setBulkDeleteOpen(true)}
                    title={`Delete ${selectedIds.size} selected`}
                    aria-label={`Delete ${selectedIds.size} selected template${selectedIds.size === 1 ? "" : "s"}`}
                  >
                    <Trash2 size={18} strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
            <DataTable<EmailTemplateRow>
              columns={columns}
              rows={filteredRows}
              getRowKey={(r) => r.id}
              emptyLabel={templatesEmptyLabel}
              visualVariant="members"
              stickyFirstColumn
              initialSort={{ columnId: "name", direction: "asc" }}
              pagination={
                filteredRows.length > 0
                  ? {
                      page,
                      pageSize,
                      totalItems: filteredRows.length,
                      onPageChange: setPage,
                      onPageSizeChange: setPageSize,
                      ariaLabel: "Email templates pagination",
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {viewRow ? (
        <div
          className="um_modal_overlay contacts_view_modal_overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewRow(null)
          }}
        >
          <div
            className="um_modal contacts_view_modal um_modal_view email_templates_email_preview_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-template-view-title"
          >
            <div className="um_modal_head">
              <h3
                id="email-template-view-title"
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
                onClick={() => setViewRow(null)}
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
                  Template: <strong>{viewRow.name}</strong>
                </span>
              </p>
              <div className="email_preview_sheet" role="document">
                <h2 className="email_preview_subject_line">
                  {viewRow.subject?.trim() || "(No subject)"}
                </h2>
                <dl className="email_preview_header_lines">
                  <div className="email_preview_dl_row">
                    <dt>From</dt>
                    <dd>{viewRow.createdBy?.trim() || "—"}</dd>
                  </div>
                  <div className="email_preview_dl_row">
                    <dt>Date</dt>
                    <dd>{formatDateDdMmmYyyy(viewRow.createdAt)}</dd>
                  </div>
                </dl>
                <div className="email_preview_message_card">
                  {viewRow.body?.trim() ? (
                    <div
                      className="email_preview_message_body"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(viewRow.body),
                      }}
                    />
                  ) : (
                    <p className="email_preview_empty_body">(No message body)</p>
                  )}
                </div>
                {viewRow.attachment ? (
                  <div className="email_preview_attachments">
                    <div className="email_preview_attachments_label">Attachment</div>
                    <button
                      type="button"
                      className="email_preview_attachment_chip"
                      onClick={() => {
                        const att = viewRow.attachment
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
                          {viewRow.attachment.fileName}
                        </span>
                        {formatEmailAttachmentSize(viewRow.attachment.size) ? (
                          <span className="email_preview_attachment_size">
                            {formatEmailAttachmentSize(viewRow.attachment.size)}
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
            <div className="um_modal_actions contacts_view_modal_footer">
              <button
                type="button"
                className="um_btn_primary contacts_view_modal_close_btn"
                onClick={() => setViewRow(null)}
              >
                <X size={18} strokeWidth={2} aria-hidden />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function EmailTemplatesPage() {
  return (
    <section className="um_page contacts_page email_templates_page">
      <div className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <ContactRound
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            Email Templates
          </h2>
        </div>
      </div>

      {/* Templates / Sent / Draft tabs — restore when sub-views are ready
      <div className="um_members_tabs_outer deals_tabs_outer contacts_main_tabs_outer um_segmented_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Email templates"
          >
            <button
              type="button"
              id="email-templates-tab-templates"
              role="tab"
              aria-selected={tab === "templates"}
              aria-controls="email-templates-panel"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                tab === "templates" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setTab("templates")}
            >
              <LayoutTemplate
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Templates
              </span>
            </button>
            <button ... Sent ... />
            <button ... Draft ... />
          </div>
        </TabsScrollStrip>
      </div>
      */}

      <div
        id="email-templates-panel"
        className="email_templates_tab_panel email_templates_tab_panel_templates"
      >
        <EmailTemplatesTemplatesTabContent />
      </div>
    </section>
  )
}
