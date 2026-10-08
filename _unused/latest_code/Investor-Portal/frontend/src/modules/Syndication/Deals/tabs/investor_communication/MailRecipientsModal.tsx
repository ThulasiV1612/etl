import { Search, Users, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../../../common/utils/displayEmail"
import { groupLabelForDealMailRecipient } from "./dealMailRecipients"
import { investorRoleLabel } from "../../constants/investor-profile"
import type { InvestorCommunicationRecipient } from "./investor-communication.types"
import "../../../contacts/contacts.css"
import "../../../usermanagement/user_management.css"
import "../../deal-investors-tab.css"
import "./investor_communication.css"

export interface MailRecipientsModalProps {
  open: boolean
  subject: string
  recipients: InvestorCommunicationRecipient[]
  onClose: () => void
  /** When true, show co-sponsor LP emails (this viewer owns those investors). */
  viewerIsCosponsor?: boolean
}

function initialsFromRecipient(row: InvestorCommunicationRecipient): string {
  const name = row.displayName.trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  if (name.length >= 2) return name.slice(0, 2).toUpperCase()
  const e = row.email.trim()
  if (e.length >= 2) return e.slice(0, 2).toUpperCase()
  return "?"
}

export function MailRecipientsModal({
  open,
  subject,
  recipients,
  onClose,
  viewerIsCosponsor = false,
}: MailRecipientsModalProps) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setPage(1)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter((r) => {
      const typeLabel = groupLabelForDealMailRecipient(r).toLowerCase()
      const roleLabel = investorRoleLabel(r.roleLabel ?? "").toLowerCase()
      const hideCoSponsorLpEmail =
        !viewerIsCosponsor &&
        r.addedByIsCoSponsor === true &&
        r.classKind !== "gp"
      const hay = [
        r.displayName,
        hideCoSponsorLpEmail ? "" : r.email,
        roleLabel,
        typeLabel,
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [recipients, query, viewerIsCosponsor])

  const columns: DataTableColumn<InvestorCommunicationRecipient>[] = useMemo(
    () => [
      {
        id: "user",
        header: "User",
        sortValue: (row) => {
          const hide =
            !viewerIsCosponsor &&
            row.addedByIsCoSponsor === true &&
            row.classKind !== "gp"
          return `${row.displayName} ${hide ? "" : row.email}`.toLowerCase()
        },
        tdClassName: "um_td_user",
        cell: (row) => {
          const primary = row.displayName?.trim() || "—"
          const hideCoSponsorLpEmail =
            !viewerIsCosponsor &&
            row.addedByIsCoSponsor === true &&
            row.classKind !== "gp"
          const rawEmail = hideCoSponsorLpEmail ? "" : row.email.trim()
          const emailShown = displayEmail(rawEmail)
          return (
            <div className="um_user_cell">
              <div className="um_user_avatar_ring" aria-hidden>
                <span className="um_user_initials">
                  {initialsFromRecipient(row)}
                </span>
              </div>
              <div className="um_user_meta">
                <span
                  className={`um_user_meta_username${
                    primary === "—" ? " um_user_meta_username--placeholder" : ""
                  }`}
                >
                  {primary}
                </span>
                {isDisplayableEmail(rawEmail) ? (
                  <a
                    href={`mailto:${encodeURIComponent(rawEmail)}`}
                    className="um_user_meta_email um_user_meta_email_link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {emailShown}
                  </a>
                ) : (
                  <span className="um_user_meta_email um_status_muted">
                    {emailShown}
                  </span>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: "type",
        header: "Type",
        sortValue: (row) => groupLabelForDealMailRecipient(row),
        cell: (row) => {
          const label = groupLabelForDealMailRecipient(row)
          if (!label || label === "—") {
            return <span className="contacts_cell_muted">—</span>
          }
          return (
            <div className="contacts_cell_chips">
              <span className="contacts_cell_chip" title={label}>
                {label}
              </span>
            </div>
          )
        },
      },
      {
        id: "role",
        header: "Role",
        sortValue: (row) => investorRoleLabel(row.roleLabel ?? "").toLowerCase(),
        cell: (row) => {
          const role = investorRoleLabel(row.roleLabel ?? "")
          if (!role || role === "—") {
            return <span className="contacts_cell_muted">—</span>
          }
          return <span title={role}>{role}</span>
        },
      },
    ],
    [viewerIsCosponsor],
  )

  if (!open) return null

  const subjectLabel = subject?.trim() || "Email recipients"

  return (
    <div
      className="um_modal_overlay contacts_suspend_overlay deal_inv_comm_recipients_overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        // className="um_modal contacts_suspend_modal deal_inv_comm_recipients_modal"
        className="um_modal recipeints_modal deal_inv_comm_recipients_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-inv-comm-recipients-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head">
          <h2
            id="deal-inv-comm-recipients-title"
            className="um_modal_title um_title_with_icon"
          >
            <Users size={20} strokeWidth={2} aria-hidden />
            Recipients
          </h2>
          <button
            type="button"
            className="um_modal_close"
            aria-label="Close recipients"
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <p className="deal_inv_comm_recipients_modal_subtitle" title={subjectLabel}>
          {subjectLabel}
          <span className="deal_inv_comm_recipients_modal_count">
            {recipients.length}{" "}
            {recipients.length === 1 ? "recipient" : "recipients"}
          </span>
        </p>

        <div className="deal_inv_comm_recipients_modal_body">
          <div
            className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel deal_inv_comm_recipients_table_panel"
            role="region"
            aria-label="Email recipients"
          >
            <div
              className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search"
              role="toolbar"
              aria-label="Search email recipients"
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
                  aria-label="Search email recipients"
                />
              </div>
            </div>

            <DataTable
              visualVariant="members"
              stickyFirstColumn
              columns={columns}
              rows={filtered}
              getRowKey={(row) => row.id || row.email}
              emptyLabel={
                query.trim()
                  ? "No recipients match your search."
                  : "No recipient details were stored for this mail."
              }
              initialSort={{ columnId: "user", direction: "asc" }}
              pagination={{
                page,
                pageSize,
                totalItems: filtered.length,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size)
                  setPage(1)
                },
                ariaLabel: "Mail recipients pagination",
              }}
            />
          </div>
        </div>

        <div className="um_modal_actions contacts_suspend_modal_actions">
          <button type="button" className="um_btn_secondary" onClick={onClose}>
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
