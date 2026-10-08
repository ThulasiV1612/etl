import { Mail, MailCheck, Search, Send, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BulkDeleteReasonModal } from "../../../../../common/components/bulk-delete-reason-modal/BulkDeleteReasonModal"
import "../../../../../common/components/bulk-delete-reason-modal/bulk-delete-reason-modal.css"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import { toast } from "../../../../../common/components/Toast"
import { useDataTableRowSelection } from "../../../../../common/hooks/useDataTableRowSelection"
import { getSessionUserId } from "../../../../../common/auth/sessionUserId"
import { formatDateDdMmmYyyy } from "../../../../../common/utils/formatDateDisplay"
import { isDisplayableEmail } from "../../../../../common/utils/displayEmail"
import { DealSendMailModal } from "./DealSendMailModal"
import { MailRecipientsModal } from "./MailRecipientsModal"
import {
  deleteDealInvestorCommunicationMail,
  fetchDealInvestorCommunicationMails,
} from "./investorCommunicationApi"
import { InvestorCommunicationRowActions } from "./InvestorCommunicationRowActions"
import type {
  InvestorCommunicationMailRow,
  InvestorCommunicationMailStatus,
} from "./investor-communication.types"
import { fetchDealMembers } from "../../api/dealsApi"
import { parseViewerDealMemberRoleFromApi } from "../../utils/dealDetailTabVisibility"
import "../../../contacts/contacts.css"
import "../../../usermanagement/user_management.css"
import "../../deals-list.css"
import "../../deal-investors-tab.css"
import "./investor_communication.css"

const DEFAULT_PAGE_SIZE = 10

function sentToCountForRow(row: InvestorCommunicationMailRow): number {
  const emails = new Set<string>()
  let hiddenDelivered = 0
  for (const r of row.recipientUsers) {
    if (r.requiresCosponsorRelease) continue
    const email = r.email.trim().toLowerCase()
    if (isDisplayableEmail(email)) {
      emails.add(email)
      continue
    }
    if (r.classKind === "gp") continue
    hiddenDelivered += 1
  }
  return emails.size + hiddenDelivered
}

function formatMailDateTime(raw: string): string {
  const t = String(raw ?? "").trim()
  if (!t || t === "—") return "—"
  const d = new Date(t)
  if (!Number.isFinite(d.getTime())) return formatDateDdMmmYyyy(t)
  const date = formatDateDdMmmYyyy(d)
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  return `${date} · ${time}`
}

function mailStatusForViewer(
  row: InvestorCommunicationMailRow,
  opts: {
    viewerIsCosponsor: boolean
    interceptNo: boolean
    sessionUserId: string
  },
): InvestorCommunicationMailStatus {
  if (!opts.viewerIsCosponsor) return row.status
  if (row.heldForCosponsorRelease) return "not_sent"
  const sender = String(row.senderId ?? "").trim().toLowerCase()
  const me = opts.sessionUserId.trim().toLowerCase()
  const sentByMe = Boolean(me && sender && sender === me)
  if (opts.interceptNo && !sentByMe) return "not_sent"
  if (!sentByMe && sentToCountForRow(row) === 0 && row.status === "sent") {
    return "not_sent"
  }
  return row.status
}

function MailStatusBadge({ status }: { status: InvestorCommunicationMailStatus }) {
  if (status === "sent") {
    return (
      <span className="deal_inv_comm_status_badge deal_inv_comm_status_badge--sent">
        <MailCheck size={14} strokeWidth={2} aria-hidden />
        Sent
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="deal_inv_comm_status_badge deal_inv_comm_status_badge--failed">
        <Mail size={14} strokeWidth={2} aria-hidden />
        Failed
      </span>
    )
  }
  return (
    <span className="deal_inv_comm_status_badge deal_inv_comm_status_badge--not_sent">
      <Mail size={14} strokeWidth={2} aria-hidden />
      Not sent
    </span>
  )
}

export interface InvestorCommunicationTabProps {
  dealId: string
}

export function InvestorCommunicationTab({ dealId }: InvestorCommunicationTabProps) {
  const [rows, setRows] = useState<InvestorCommunicationMailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sendMailOpen, setSendMailOpen] = useState(false)
  const [resendMail, setResendMail] =
    useState<InvestorCommunicationMailRow | null>(null)
  const [releaseToOwnInvestors, setReleaseToOwnInvestors] = useState(false)
  const [viewerIsCosponsor, setViewerIsCosponsor] = useState(false)
  const [viewerInterceptNo, setViewerInterceptNo] = useState(false)
  const [recipientsMail, setRecipientsMail] =
    useState<InvestorCommunicationMailRow | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false)

  const getRowId = useCallback((row: InvestorCommunicationMailRow) => row.id, [])

  const loadMails = useCallback(async () => {
    if (!dealId.trim()) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ mails, viewerCoSponsorEmailIntercept }, membersPayload] =
      await Promise.all([
        fetchDealInvestorCommunicationMails(dealId),
        fetchDealMembers(dealId),
      ])
    const isCo =
      parseViewerDealMemberRoleFromApi(membersPayload.viewerDealMemberRole) ===
      "co_sponsor"
    setViewerIsCosponsor(isCo)
    setViewerInterceptNo(isCo && viewerCoSponsorEmailIntercept === "no")
    setRows(mails)
    setLoading(false)
  }, [dealId])

  useEffect(() => {
    void loadMails()
  }, [loadMails])

  const sessionUserId = getSessionUserId()
  const displayRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        status: mailStatusForViewer(row, {
          viewerIsCosponsor,
          interceptNo: viewerInterceptNo,
          sessionUserId,
        }),
        heldForCosponsorRelease:
          row.heldForCosponsorRelease ||
          (viewerIsCosponsor &&
            viewerInterceptNo &&
            String(row.senderId ?? "").trim().toLowerCase() !==
              sessionUserId.trim().toLowerCase()),
      })),
    [rows, sessionUserId, viewerInterceptNo, viewerIsCosponsor],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return displayRows
    return displayRows.filter((row) => {
      const hay = [
        row.subject,
        row.sendFrom,
        row.sentTo,
        formatMailDateTime(row.sentAt),
        row.status,
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [displayRows, query])

  const {
    selectedIds,
    selectedRows,
    selectAllRef,
    allSelected,
    toggleSelect,
    toggleSelectAllFiltered,
    clearSelection,
  } = useDataTableRowSelection({
    filteredRows: filtered,
    getRowId,
  })

  const confirmBulkDelete = useCallback(
    async (_reason: string) => {
      const ids = [...selectedIds]
      if (ids.length === 0) return
      setBulkDeleteBusy(true)
      try {
        const results = await Promise.all(
          ids.map((id) => deleteDealInvestorCommunicationMail(dealId, id)),
        )
        const failed = results.filter((ok) => !ok).length
        const succeeded = ids.length - failed
        if (succeeded > 0) {
          setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)))
          clearSelection()
        }
        if (failed > 0 && succeeded > 0) {
          toast.error(
            "Some entries could not be deleted",
            `${succeeded} deleted, ${failed} failed.`,
          )
        } else if (failed > 0) {
          toast.error("Could not delete email log entries", "Try again later.")
        } else {
          toast.success(
            ids.length === 1 ? "Email log entry deleted" : "Email log entries deleted",
            ids.length === 1
              ? selectedRows[0]?.subject ?? ""
              : `${ids.length} entries removed.`,
          )
        }
        setBulkDeleteOpen(false)
      } finally {
        setBulkDeleteBusy(false)
      }
    },
    [clearSelection, dealId, selectedIds, selectedRows],
  )

  const handleMailSent = useCallback((mail: InvestorCommunicationMailRow) => {
    setRows((prev) => {
      if (prev.some((r) => r.id === mail.id)) return prev
      return [mail, ...prev]
    })
  }, [])

  const handleView = useCallback((row: InvestorCommunicationMailRow) => {
    if (row.recipientUsers.length > 0) setRecipientsMail(row)
  }, [])

  const handleResend = useCallback((row: InvestorCommunicationMailRow) => {
    setReleaseToOwnInvestors(false)
    setResendMail(row)
    setSendMailOpen(true)
  }, [])

  const handleSendToInvestors = useCallback(
    (row: InvestorCommunicationMailRow) => {
      setReleaseToOwnInvestors(true)
      setResendMail(row)
      setSendMailOpen(true)
    },
    [],
  )

  const closeSendMail = useCallback(() => {
    setSendMailOpen(false)
    setResendMail(null)
    setReleaseToOwnInvestors(false)
  }, [])

  const handleDelete = useCallback(
    async (row: InvestorCommunicationMailRow) => {
      const ok = await deleteDealInvestorCommunicationMail(dealId, row.id)
      if (!ok) return
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    },
    [dealId],
  )

  const columns: DataTableColumn<InvestorCommunicationMailRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: (
          <input
            ref={selectAllRef}
            type="checkbox"
            className="um_table_header_select_cb"
            checked={allSelected}
            onChange={toggleSelectAllFiltered}
            disabled={loading || filtered.length === 0}
            aria-label="Select all email log entries in this list"
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
            disabled={loading}
            aria-label={`Select email log ${row.subject?.trim() || row.id}`}
          />
        ),
      },
      {
        id: "subject",
        header: "Subject",
        sortValue: (row) => (row.subject ?? "").toLowerCase(),
        cell: (row) => (
          <span className="deal_inv_ellipsis_text" title={row.subject}>
            {row.subject?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "sendFrom",
        header: "Sender",
        sortValue: (row) => (row.sendFrom ?? "").toLowerCase(),
        cell: (row) => (
          <span className="deal_inv_ellipsis_text" title={row.sendFrom}>
            {row.sendFrom?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "sentTo",
        header: "Sent to",
        align: "center",
        thClassName: "deal_inv_comm_th_sent_to",
        tdClassName: "deal_inv_comm_td_sent_to",
        sortValue: (row) => sentToCountForRow(row),
        cell: (row) => {
          const count = sentToCountForRow(row)
          const sentRecipients = row.recipientUsers.filter(
            (r) => !r.requiresCosponsorRelease,
          )
          const canOpen = sentRecipients.length > 0
          if (!canOpen) {
            return count > 0 ? String(count) : "—"
          }
          return (
            <button
              type="button"
              className="deal_inv_comm_sent_to_btn"
              title="View recipient list"
              onClick={() =>
                setRecipientsMail({ ...row, recipientUsers: sentRecipients })
              }
            >
              <span className="deal_inv_comm_sent_to">
                <span className="deal_inv_comm_sent_to_count">{count}</span>
                <span className="deal_inv_comm_sent_to_label">
                  {count === 1 ? "recipient" : "recipients"}
                </span>
              </span>
            </button>
          )
        },
      },
      {
        id: "sentAt",
        header: "Date & time",
        thClassName: "deal_inv_comm_th_sent_at",
        tdClassName: "deal_inv_comm_td_sent_at",
        sortValue: (row) => {
          const t = new Date(row.sentAt).getTime()
          return Number.isFinite(t) ? t : 0
        },
        cell: (row) => (
          <span className="deal_inv_ellipsis_text" title={formatMailDateTime(row.sentAt)}>
            {formatMailDateTime(row.sentAt)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        align: "center",
        thClassName: "deals_th_align_center",
        sortValue: (row) => row.status,
        cell: (row) => <MailStatusBadge status={row.status} />,
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions",
        cell: (row) => (
          <InvestorCommunicationRowActions
            row={row}
            viewerIsCosponsor={viewerIsCosponsor}
            onView={handleView}
            onResend={handleResend}
            onSendToInvestors={
              viewerIsCosponsor ? handleSendToInvestors : undefined
            }
            onDelete={handleDelete}
          />
        ),
      },
    ],
    [
      allSelected,
      filtered.length,
      handleDelete,
      handleResend,
      handleSendToInvestors,
      handleView,
      loading,
      selectAllRef,
      selectedIds,
      toggleSelect,
      toggleSelectAllFiltered,
      viewerIsCosponsor,
    ],
  )

  const emptyLabel = loading
    ? "Loading email log…"
    : query.trim()
      ? "No email entries match your search."
      : "No investor email has been sent for this deal yet. Use Send email to compose a message."

  return (
    <div className="deal_inv_populated deal_inv_comm">
      <BulkDeleteReasonModal
        open={bulkDeleteOpen}
        title={
          selectedIds.size === 1
            ? "Delete email log entry?"
            : `Delete ${selectedIds.size} email log entries?`
        }
        description={
          selectedIds.size === 1
            ? `Remove "${selectedRows[0]?.subject?.trim() || "this entry"}" from the email log? This cannot be undone.`
            : `Remove ${selectedIds.size} selected email log entries? This cannot be undone.`
        }
        reasonLabel="Reason for deletion"
        reasonPlaceholder="e.g. Logged in error, duplicate send…"
        busy={bulkDeleteBusy}
        onClose={() => !bulkDeleteBusy && setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />
      <DealSendMailModal
        dealId={dealId}
        open={sendMailOpen}
        onClose={closeSendMail}
        onSent={handleMailSent}
        initialRecipientEmails={
          releaseToOwnInvestors
            ? undefined
            : resendMail?.recipientUsers.map((r) => r.email)
        }
        initialTemplateId={resendMail?.templateId ?? null}
        releaseToOwnInvestors={releaseToOwnInvestors}
      />

      <MailRecipientsModal
        open={recipientsMail != null}
        subject={recipientsMail?.subject ?? ""}
        recipients={recipientsMail?.recipientUsers ?? []}
        viewerIsCosponsor={viewerIsCosponsor}
        onClose={() => setRecipientsMail(null)}
      />

      <div
        className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel"
        role="region"
        aria-label="Investor communication email log"
      >
        <div
          className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search"
          role="toolbar"
          aria-label="Investor communication actions"
        >
          <div className="um_search_wrap">
            <Search className="um_search_icon" size={18} aria-hidden />
            <input
              type="search"
              className="um_search_input"
              placeholder="Search…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              aria-label="Search investor communication email log"
              disabled={loading}
            />
          </div>
          <div className="um_toolbar_actions deal_inv_table_toolbar_actions">
            {selectedIds.size > 0 ? (
              <button
                type="button"
                className="contacts_table_icon_action_btn um_toolbar_delete_btn"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={loading}
                title={`Delete ${selectedIds.size} selected`}
                aria-label={`Delete ${selectedIds.size} selected email log entr${selectedIds.size === 1 ? "y" : "ies"}`}
              >
                <Trash2 size={18} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="um_btn_toolbar"
              onClick={() => {
                setResendMail(null)
                setReleaseToOwnInvestors(false)
                setSendMailOpen(true)
              }}
            >
              <Send size={18} strokeWidth={2} aria-hidden />
              Send email
            </button>
          </div>
        </div>

        <DataTable
          visualVariant="members"
          stickyFirstColumn
          columns={columns}
          rows={loading ? [] : filtered}
          getRowKey={(row) => row.id}
          isLoading={loading}
          emptyLabel={emptyLabel}
          emptyStateRole={loading ? "status" : undefined}
          initialSort={{ columnId: "sentAt", direction: "desc" }}
          pagination={
            !loading && filtered.length > 0
              ? {
                  page,
                  pageSize,
                  totalItems: filtered.length,
                  onPageChange: setPage,
                  onPageSizeChange: (size) => {
                    setPageSize(size)
                    setPage(1)
                  },
                  ariaLabel: "Investor communication email log pagination",
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
