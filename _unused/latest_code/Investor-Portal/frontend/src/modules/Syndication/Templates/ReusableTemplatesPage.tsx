import { FileSignature, LayoutTemplate, Plus, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "@/common/components/Toast"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import { formatDateDdMmmYyyy } from "@/common/utils/formatDateDisplay"
import "@/common/components/work_in_progress_page.css"
import "../usermanagement/user_management.css"
import "../Deals/deals-list.css"
import "./reusable-templates.css"
import {
  fetchReusableTemplates,
  type ReusableEsignTemplateRow,
} from "./api/templatesApi"

function statusLabel(row: ReusableEsignTemplateRow): string {
  if (row.dropboxSignStatus === "ready") return "Ready"
  if (row.dropboxSignStatus === "draft") return "Draft"
  return "Not configured"
}

export default function ReusableTemplatesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ReusableEsignTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const reload = useCallback(async () => {
    const result = await fetchReusableTemplates()
    if (result.ok) {
      setRows(result.templates.filter((t) => !t.archived))
    } else {
      toast.error("Could not load templates", result.message)
    }
    return result
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      await reload()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const name = (r.name ?? "").toLowerCase()
      const file = (r.originalName ?? "").toLowerCase()
      const tid = (r.template_id ?? r.dropboxSignTemplateId ?? "").toLowerCase()
      return name.includes(q) || file.includes(q) || tid.includes(q)
    })
  }, [rows, searchQuery])

  const columns: DataTableColumn<ReusableEsignTemplateRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Template name",
        cell: (row) => (
          <span className="deals_list_name_cell" title={row.name}>
            {row.name}
          </span>
        ),
      },
      {
        id: "file",
        header: "Document",
        cell: (row) => row.originalName ?? "—",
      },
      {
        id: "roles",
        header: "Signer roles",
        cell: (row) =>
          row.roles?.length
            ? row.roles.map((r) => r.name).join(", ")
            : "—",
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <span
            className={
              row.dropboxSignStatus === "ready"
                ? "reusable_templates_status_ready"
                : row.dropboxSignStatus === "draft"
                  ? "reusable_templates_status_draft"
                  : "reusable_templates_status"
            }
          >
            {statusLabel(row)}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        cell: (row) => formatDateDdMmmYyyy(row.updatedAt),
      },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (row) =>
          row.dropboxSignStatus !== "ready" ? (
            <button
              type="button"
              className="deals_list_link_btn"
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/templates/new?resume=${encodeURIComponent(row.id)}`)
              }}
            >
              <FileSignature size={14} aria-hidden />
              Continue setup
            </button>
          ) : null,
      },
    ],
    [navigate],
  )

  return (
    <div className="work_in_progress_page reusable_templates_root">
      <div className="reusable_templates_head">
        <div className="work_in_progress_page_title_row">
          <LayoutTemplate size={22} strokeWidth={1.75} aria-hidden />
          <h1 className="work_in_progress_page_title">E-Sign Templates</h1>
        </div>
        <button
          type="button"
          className="deals_list_primary_btn"
          onClick={() => navigate("/templates/new")}
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
          Create Template
        </button>
      </div>

      <p className="work_in_progress_page_desc">
        Reusable document templates with signature fields. Upload a PDF, configure
        fields in the Dropbox Sign editor, then reuse templates when sending documents
        to signers.
      </p>

      <div className="deals_list_toolbar">
        <div className="deals_list_search_wrap">
          <Search size={16} className="deals_list_search_icon" aria-hidden />
          <input
            type="search"
            className="deals_list_search_input"
            placeholder="Search templates…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            aria-label="Search templates"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        getRowKey={(r) => r.id}
        isLoading={loading}
        emptyLabel="No reusable templates yet. Click Create Template to add one."
        pagination={{
          page,
          pageSize,
          totalItems: filteredRows.length,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      />
    </div>
  )
}
