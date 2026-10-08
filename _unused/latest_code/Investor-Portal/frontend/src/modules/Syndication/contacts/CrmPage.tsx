import {
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../common/utils/displayEmail"
import {
  formatUsPhoneStoredForUi,
  nationalDigitsFromStoredPhone,
} from "../../../common/phone/usPhoneNumber"
import { toast } from "../../../common/components/Toast"
import { PORTAL_ACTIVE_COMPANY_CHANGED_EVENT } from "../../../common/auth/setActiveCompany"
import { getSessionOrganizationCompanyId } from "../../../common/auth/sessionOrganization"
import "../usermanagement/user_management.css"
import {
  fetchGhlContactDetail,
  fetchGhlContacts,
} from "./api/ghlContactsApi"
import { ContactRowActions } from "./components/ContactRowActions"
import { ViewContactModal } from "./components/ViewContactModal"
import { resolveGhlContactId } from "./utils/ghlContactUrls"
import "../Deals/deals-list.css"
import "./contacts.css"
import type { ContactRow } from "./types/contact.types"
import { formatContactSinceLabel } from "./utils/contactCsv"

const CONTACTS_ACTIONS_COL_WIDTH = "7rem" as const
const CONTACTS_USER_COL_WIDTH = "16rem" as const

function contactDisplayName(row: ContactRow): string {
  const n = [row.firstName, row.lastName].filter(Boolean).join(" ").trim()
  return n || row.email || "—"
}

function initialsFromContact(row: ContactRow): string {
  const first = row.firstName.trim()
  const last = row.lastName.trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first.length >= 2) return first.slice(0, 2).toUpperCase()
  const e = row.email.trim()
  if (e.length >= 2) return e.slice(0, 2).toUpperCase()
  return "?"
}

function contactRowMatchesSearch(row: ContactRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [
    row.firstName,
    row.lastName,
    row.email,
    row.phone,
    nationalDigitsFromStoredPhone(String(row.phone ?? "")),
    formatUsPhoneStoredForUi(row.phone),
    row.companyName ?? "",
    row.ghlSource ?? "",
    row.createdByDisplayName ?? "",
    ...row.tags,
    ...row.owners,
  ]
    .map((s) => String(s).toLowerCase())
    .join(" ")
  return hay.includes(q)
}

function TagsCell({ items }: { items: string[] }) {
  if (!items.length) return <span className="um_status_muted">—</span>
  return (
    <div className="contacts_cell_chips">
      {items.map((t, i) => (
        <span key={`${t}-${i}`} className="contacts_cell_chip" title={t}>
          {t}
        </span>
      ))}
    </div>
  )
}

export default function CrmPage() {
  const [orgScopeKey, setOrgScopeKey] = useState(
    () => getSessionOrganizationCompanyId() ?? "",
  )
  const [rows, setRows] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewContact, setViewContact] = useState<ContactRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const openGhlContact = useCallback((row: ContactRow) => {
    setViewContact(row)
    setDetailLoading(true)
    void fetchGhlContactDetail(resolveGhlContactId(row))
      .then((detail) => setViewContact(detail))
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Could not load GoHighLevel contact"
        toast.error(message)
      })
      .finally(() => setDetailLoading(false))
  }, [])

  const loadCrmContacts = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    else setRefreshing(true)
    setLoadError("")

    try {
      const result = await fetchGhlContacts()

      if (!result.configured) {
        setRows([])
        setLoadError(
          result.message ??
            "GoHighLevel is not configured. Set PRIVATE_INTEGRATION_KEY and GHL_LOCATION_ID in backend/.env.local.",
        )
        return
      }

      if (result.message && result.contacts.length === 0) {
        setLoadError(result.message)
      }

      setRows(result.contacts)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load GoHighLevel contacts"
      setLoadError(message)
      setRows([])
      toast.error(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orgScopeKey])

  useEffect(() => {
    const syncOrgScope = () => {
      setOrgScopeKey(getSessionOrganizationCompanyId() ?? "")
    }
    window.addEventListener(PORTAL_ACTIVE_COMPANY_CHANGED_EVENT, syncOrgScope)
    return () => {
      window.removeEventListener(PORTAL_ACTIVE_COMPANY_CHANGED_EVENT, syncOrgScope)
    }
  }, [])

  useEffect(() => {
    void loadCrmContacts()
  }, [loadCrmContacts])

  const filteredRows = useMemo(
    () => rows.filter((row) => contactRowMatchesSearch(row, searchQuery)),
    [rows, searchQuery],
  )

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filteredRows.length,
      onPageChange: setPage,
      onPageSizeChange: (nextSize: number) => {
        setPageSize(nextSize)
        setPage(1)
      },
      ariaLabel: "GoHighLevel contacts table pagination",
    }),
    [page, pageSize, filteredRows.length],
  )

  const columns = useMemo<DataTableColumn<ContactRow>[]>(
    () => [
      {
        id: "user",
        header: "User",
        colWidth: CONTACTS_USER_COL_WIDTH,
        sortValue: (row) =>
          `${row.firstName} ${row.lastName} ${row.email}`.toLowerCase(),
        thClassName: "contacts_th_user",
        tdClassName: "um_td_user contacts_td_user",
        cell: (row) => {
          const primary = contactDisplayName(row)
          const rawEmail = row.email.trim()
          const emailShown = displayEmail(rawEmail)
          return (
            <div className="um_user_cell">
              <div className="um_user_avatar_ring" aria-hidden>
                <span className="um_user_initials">
                  {initialsFromContact(row)}
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
                  >
                    {rawEmail}
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
        id: "phone",
        header: "Phone",
        sortValue: (row) => nationalDigitsFromStoredPhone(String(row.phone ?? "")),
        cell: (row) => formatUsPhoneStoredForUi(row.phone) || "—",
      },
      {
        id: "tags",
        header: "Contact tags",
        sortValue: (row) => row.tags.join(" "),
        cell: (row) => <TagsCell items={row.tags} />,
      },
      {
        id: "source",
        header: "Added by",
        sortValue: (row) => row.ghlSource ?? row.createdByDisplayName ?? "",
        cell: (row) => row.ghlSource?.trim() || row.createdByDisplayName?.trim() || "GoHighLevel",
      },
      {
        id: "since",
        header: "Since",
        sortValue: (row) => {
          const t = row.createdAt ? new Date(row.createdAt).getTime() : NaN
          return Number.isFinite(t) ? t : 0
        },
        cell: (row) => (
          <span title={row.createdAt}>
            {formatContactSinceLabel(row.createdAt) || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: CONTACTS_ACTIONS_COL_WIDTH,
        thClassName: "um_th_actions contacts_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions contacts_td_actions",
        cell: (row) => (
          <ContactRowActions
            viewOnly
            contactLabel={contactDisplayName(row)}
            onView={() => openGhlContact(row)}
          />
        ),
      },
    ],
    [openGhlContact],
  )

  // const crmHint = useMemo(() => {
  //   if (loading) return "Loading contacts from GoHighLevel…"
  //   if (!config?.configured) {
  //     return "Connect GoHighLevel in backend/.env.local to load contacts here."
  //   }
  //   const location = config.locationId ? ` · Location ${config.locationId}` : ""
  //   return `${rows.length} contact${rows.length === 1 ? "" : "s"} from GoHighLevel${location}. Read-only in SyndicationX.`
  // }, [config?.configured, config?.locationId, loading, rows.length])

  return (
    <section className="um_page contacts_page contacts_crm_page">
      <div className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <LayoutGrid
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            CRM
          </h2>
        </div>
      </div>

      {/* <div className="um_members_header_block contacts_inner_header">
        <div className="contacts_toolbar_filters_row contacts_crm_filters_row">
          <p className="um_hint contacts_crm_hint" role="status">
            {crmHint}
          </p>
        </div>
      </div> */}

      <div className="um_members_tab_content contacts_main_tab_content_flush">
        <div
          className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel"
          role="region"
          aria-label="GoHighLevel contacts"
        >
          {loadError && !loading && rows.length === 0 ? (
            <p className="um_hint contacts_crm_empty_hint" role="status">
              {loadError}
            </p>
          ) : (
            <>
              <div className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
                <div className="um_toolbar_actions deal_inv_table_toolbar_actions">
                  <button
                    type="button"
                    className="um_btn_toolbar"
                    disabled={loading || refreshing}
                    onClick={() => void loadCrmContacts({ silent: true })}
                  >
                    {refreshing ? (
                      <Loader2
                        size={18}
                        strokeWidth={2}
                        className="um_spin"
                        aria-hidden
                      />
                    ) : (
                      <RefreshCw size={18} strokeWidth={2} aria-hidden />
                    )}
                    Refresh
                  </button>
                </div>
                <div className="um_search_wrap">
                  <Search className="um_search_icon" size={18} aria-hidden />
                  <input
                    type="search"
                    className="um_search_input"
                    placeholder="Search…"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPage(1)
                    }}
                    aria-label="Search GoHighLevel contacts"
                    disabled={loading}
                  />
                </div>
              </div>

              {loadError && rows.length > 0 ? (
                <p className="um_toolbar_notice" role="status">
                  {loadError}
                </p>
              ) : null}

              <DataTable<ContactRow>
                visualVariant="members"
                stickyFirstColumn
                columns={columns}
                rows={loading ? [] : filteredRows}
                getRowKey={(row) => row.id}
                isLoading={loading}
                onBodyRowClick={(row) => openGhlContact(row)}
                getRowClassName={() => "contacts_crm_row_clickable"}
                emptyLabel={
                  loading
                    ? "Loading contacts…"
                    : rows.length === 0
                      ? "No GoHighLevel contacts yet."
                      : "No contacts match your search."
                }
                emptyStateRole={loading ? "status" : undefined}
                pagination={
                  !loading && filteredRows.length > 0 ? pagination : undefined
                }
              />
            </>
          )}
        </div>
      </div>

      <ViewContactModal
        contact={viewContact}
        loading={detailLoading}
        onClose={() => {
          setViewContact(null)
          setDetailLoading(false)
        }}
      />
    </section>
  )
}
