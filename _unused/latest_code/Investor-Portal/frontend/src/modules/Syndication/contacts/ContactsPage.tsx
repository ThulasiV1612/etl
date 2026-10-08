import {
  AlertTriangle,
  AlignLeft,
  Archive,
  Ban,
  CheckCircle2,
  ClipboardList,
  ContactRound,
  Download,
  Eye,
  Info,
  LayoutList,
  Mail,
  Pencil,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Tag,
  User,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable"
import {
  DropdownSelect,
  type DropdownSelectOption,
} from "../../../common/components/dropdown-select"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../common/utils/displayEmail"
import {
  formatUsPhoneStoredForUi,
  nationalDigitsFromStoredPhone,
} from "../../../common/phone/usPhoneNumber"
import { ViewReadonlyField } from "../../../common/components/ViewReadonlyField"
import {
  UsageFilterTabs,
  type UsageFilterTab,
} from "../../../common/components/usage-filter-tabs/UsageFilterTabs"
import { TabsScrollStrip } from "../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import { toast } from "../../../common/components/Toast"
import {
  TABLE_PAGE_SIZE_ID,
  usePersistedTablePageSize,
} from "@/common/hooks/usePersistedTablePageSize"
import { PORTAL_ACTIVE_COMPANY_CHANGED_EVENT } from "../../../common/auth/setActiveCompany"
import { getSessionOrganizationCompanyId } from "../../../common/auth/sessionOrganization"
import "../usermanagement/user_management.css"
import {
  createContact,
  fetchContacts,
  fetchOrganizationContactLists,
  fetchOrganizationContactTags,
  notifyContactsExportAudit,
  patchContactShowOfferings,
  patchContactStatus,
  updateContact,
} from "./api/contactsApi"
import {
  getCurrentSessionUserEmail,
  openSendMailDraft,
  parseEmailInput,
} from "../../../common/features/send-mail"
import { AddContactPanel } from "./components/AddContactPanel"
import {
  ContactCatalogRowActions,
  ContactRowActions,
} from "./components/ContactRowActions"
import {
  SendMailEmailPreviewModal,
  type SendMailEmailPreviewPayload,
} from "./components/SendMailEmailPreviewModal"
import { ExportContactsModal } from "./components/ExportContactsModal"
import { ViewContactModal } from "./components/ViewContactModal"
import {
  loadEmailTemplates,
  type EmailTemplateRow,
} from "./emailTemplatesStorage"
import "../Deals/deals-list.css"
import "./contacts.css"
import "../Deals/deal-investors-tab.css"
import type {
  ContactOfferingVisibility,
  ContactRow,
} from "./types/contact.types"
import {
  CONTACT_OFFERING_VISIBILITY_OPTIONS,
} from "./types/contact.types"
import {
  buildContactsCsv,
  downloadContactsCsv,
  exportAuditLinesForContacts,
} from "./utils/contactCsv"
import {
  buildTableExportFilename,
} from "../../../common/utils/tableExportFilename"

/** Full labels for the Offering Visibility cell dropdown. */
const OFFERING_VISIBILITY_CELL_OPTIONS: DropdownSelectOption[] = [
  { value: "", label: "—" },
  ...CONTACT_OFFERING_VISIBILITY_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  })),
]

const OFFERING_VISIBILITY_FILTER_OPTIONS: DropdownSelectOption[] = [
  { value: "all", label: "All visibility" },
  ...CONTACT_OFFERING_VISIBILITY_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  })),
  { value: "unset", label: "Unset" },
]

type OfferingVisibilityFilter =
  | "all"
  | ContactOfferingVisibility
  | "unset"

function contactRowIsSuspended(row: ContactRow): boolean {
  return row.status === "suspended"
}

type ContactsListTab = "active" | "archived"

type ContactsMainTab = "contacts" | "tags" | "lists"

/** Wide enough for the “Actions” header on one line (see contacts.css). */
const CONTACTS_ACTIONS_COL_WIDTH = "7rem" as const
/** Name + email identity — keep compact so other columns get room. */
const CONTACTS_USER_COL_WIDTH = "16rem" as const

type CatalogUsageFilter = UsageFilterTab

type ContactLabelRow = {
  id: string
  name: string
  description: string
}

function newLabelId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function toContactUpdatePayload(
  r: ContactRow,
): Omit<ContactRow, "id" | "createdByDisplayName"> {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    note: r.note,
    tags: r.tags,
    lists: r.lists,
    owners: r.owners,
    status: r.status,
    showOfferingsVisibility: r.showOfferingsVisibility ?? null,
    accreditationStatus: r.accreditationStatus ?? null,
    knownSince: r.knownSince ?? null,
    lastEditReason: r.lastEditReason,
  }
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
    row.note,
    ...row.tags,
    ...row.lists,
    ...row.owners,
    row.createdByDisplayName ?? "",
    String(row.dealCount ?? 0),
  ]
    .map((s) => String(s).toLowerCase())
    .join(" ")
  return hay.includes(q)
}

function initialsFromContact(row: ContactRow): string {
  const first = row.firstName.trim()
  const last = row.lastName.trim()
  if (first && last) {
    return (first[0] + last[0]).toUpperCase()
  }
  if (first.length >= 2) return first.slice(0, 2).toUpperCase()
  const e = row.email.trim()
  if (e.length >= 2) return e.slice(0, 2).toUpperCase()
  return "?"
}

function contactDisplayName(row: ContactRow): string {
  const n = [row.firstName, row.lastName].filter(Boolean).join(" ").trim()
  return n || "—"
}

function contactHasTag(row: ContactRow, tagName: string): boolean {
  const target = tagName.trim().toLowerCase()
  if (!target) return false
  return row.tags.some((t) => t.trim().toLowerCase() === target)
}

function TagsCell({ items }: { items: string[] }) {
  if (!items.length)
    return <span className="um_status_muted">—</span>
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

function ContactsPage() {
  const navigate = useNavigate()
  const suspendAllTitleId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<ContactRow[]>([])
  const [orgScopeKey, setOrgScopeKey] = useState(
    () => getSessionOrganizationCompanyId() ?? "",
  )
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [contactToEdit, setContactToEdit] = useState<ContactRow | null>(null)
  const [viewContactId, setViewContactId] = useState<string | null>(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [sendMailModalOpen, setSendMailModalOpen] = useState(false)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [sendMailCc, setSendMailCc] = useState("")
  const [sendMailEmailPreview, setSendMailEmailPreview] =
    useState<SendMailEmailPreviewPayload | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistedTablePageSize(
    TABLE_PAGE_SIZE_ID.contacts,
  )
  /** Bumps DataTable remount so sort state resets on Refresh. */
  const [tableResetKey, setTableResetKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [toolbarNotice, setToolbarNotice] = useState("")
  const [suspendRow, setSuspendRow] = useState<ContactRow | null>(null)
  const [suspendReason, setSuspendReason] = useState("")
  const [suspendSaving, setSuspendSaving] = useState(false)
  const [suspendErr, setSuspendErr] = useState("")
  const [suspendAllOpen, setSuspendAllOpen] = useState(false)
  const [suspendAllBusy, setSuspendAllBusy] = useState(false)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    () => new Set(),
  )
  const contactSelectAllRef = useRef<HTMLInputElement | null>(null)
  const [contactsListTab, setContactsListTab] =
    useState<ContactsListTab>("active")
  const [mainTab, setMainTab] = useState<ContactsMainTab>("contacts")
  /** When set, Contact tab shows only contacts that include this tag. */
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  /** `all` | `Accredited` | `Not Accredited` | `na` (no status) */
  const [accreditationFilter, setAccreditationFilter] = useState<
    "all" | "Accredited" | "Not Accredited" | "na"
  >("all")
  const [offeringVisibilityFilter, setOfferingVisibilityFilter] =
    useState<OfferingVisibilityFilter>("all")
  const [tagCatalog, setTagCatalog] = useState<ContactLabelRow[]>([])
  const [listCatalog, setListCatalog] = useState<ContactLabelRow[]>([])
  const [tagsSearchQuery, setTagsSearchQuery] = useState("")
  const [listsSearchQuery, setListsSearchQuery] = useState("")
  const [tagsPage, setTagsPage] = useState(1)
  const [tagsPageSize, setTagsPageSize] = useState(10)
  const [listsPage, setListsPage] = useState(1)
  const [listsPageSize, setListsPageSize] = useState(10)
  const [tagsUsageFilter, setTagsUsageFilter] =
    useState<CatalogUsageFilter>("all")
  const [listsUsageFilter, setListsUsageFilter] =
    useState<CatalogUsageFilter>("all")
  const [labelModal, setLabelModal] = useState<
    | { kind: "tag"; mode: "add" }
    | { kind: "tag"; mode: "edit"; row: ContactLabelRow }
    | { kind: "list"; mode: "add" }
    | { kind: "list"; mode: "edit"; row: ContactLabelRow }
    | null
  >(null)
  const [labelModalName, setLabelModalName] = useState("")
  const [labelModalDesc, setLabelModalDesc] = useState("")
  const [labelModalErr, setLabelModalErr] = useState("")
  const [labelModalBusy, setLabelModalBusy] = useState(false)
  /** Names persisted in `organization_contact_tag` / `organization_contact_list` (backend 1). */
  const [dbCatalogTagNames, setDbCatalogTagNames] = useState<string[]>([])
  const [dbCatalogListNames, setDbCatalogListNames] = useState<string[]>([])

  useEffect(() => {
    setTagCatalog((prev) => {
      const byLower = new Map<string, ContactLabelRow>()
      for (const r of prev) {
        byLower.set(r.name.toLowerCase(), r)
      }
      for (const t of dbCatalogTagNames) {
        const trimmed = t.trim()
        if (!trimmed) continue
        const lk = trimmed.toLowerCase()
        if (!byLower.has(lk)) {
          byLower.set(lk, {
            id: newLabelId(),
            name: trimmed,
            description: "",
          })
        }
      }
      for (const c of rows) {
        for (const t of c.tags) {
          const trimmed = t.trim()
          if (!trimmed) continue
          const lk = trimmed.toLowerCase()
          if (!byLower.has(lk)) {
            byLower.set(lk, {
              id: newLabelId(),
              name: trimmed,
              description: "",
            })
          }
        }
      }
      return Array.from(byLower.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )
    })
  }, [rows, dbCatalogTagNames])

  useEffect(() => {
    setListCatalog((prev) => {
      const byLower = new Map<string, ContactLabelRow>()
      for (const r of prev) {
        byLower.set(r.name.toLowerCase(), r)
      }
      for (const t of dbCatalogListNames) {
        const trimmed = t.trim()
        if (!trimmed) continue
        const lk = trimmed.toLowerCase()
        if (!byLower.has(lk)) {
          byLower.set(lk, {
            id: newLabelId(),
            name: trimmed,
            description: "",
          })
        }
      }
      for (const c of rows) {
        for (const t of c.lists) {
          const trimmed = t.trim()
          if (!trimmed) continue
          const lk = trimmed.toLowerCase()
          if (!byLower.has(lk)) {
            byLower.set(lk, {
              id: newLabelId(),
              name: trimmed,
              description: "",
            })
          }
        }
      }
      return Array.from(byLower.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )
    })
  }, [rows, dbCatalogListNames])

  const tabRows = useMemo(
    () =>
      rows.filter((r) =>
        contactsListTab === "archived"
          ? contactRowIsSuspended(r)
          : !contactRowIsSuspended(r),
      ),
    [rows, contactsListTab],
  )

  const activeCount = useMemo(
    () => rows.filter((r) => !contactRowIsSuspended(r)).length,
    [rows],
  )

  const archivedCount = useMemo(
    () => rows.filter((r) => contactRowIsSuspended(r)).length,
    [rows],
  )

  const filteredRows = useMemo(
    () =>
      tabRows
        .filter((r) => !tagFilter || contactHasTag(r, tagFilter))
        .filter((r) => contactRowMatchesSearch(r, searchQuery))
        .filter((r) => {
          if (accreditationFilter === "all") return true
          const status = (r.accreditationStatus ?? "").trim()
          if (accreditationFilter === "na") return status === ""
          return status.toLowerCase() === accreditationFilter.toLowerCase()
        })
        .filter((r) => {
          if (offeringVisibilityFilter === "all") return true
          const vis = r.showOfferingsVisibility ?? null
          if (offeringVisibilityFilter === "unset") return vis == null
          return vis === offeringVisibilityFilter
        }),
    [
      tabRows,
      searchQuery,
      tagFilter,
      accreditationFilter,
      offeringVisibilityFilter,
    ],
  )

  const openContactsForTag = useCallback((tagName: string) => {
    const name = tagName.trim()
    if (!name) return
    setTagFilter(name)
    setMainTab("contacts")
    setContactsListTab("active")
    setSearchQuery("")
    setPage(1)
    setToolbarNotice("")
    setSelectedContactIds(new Set())
  }, [])

  const allContactsInFilterSelected = useMemo(
    () =>
      filteredRows.length > 0 &&
      filteredRows.every((r) => selectedContactIds.has(r.id)),
    [filteredRows, selectedContactIds],
  )
  const someContactsFilterSelected = useMemo(
    () =>
      filteredRows.some((r) => selectedContactIds.has(r.id)) &&
      !allContactsInFilterSelected,
    [filteredRows, selectedContactIds, allContactsInFilterSelected],
  )

  useLayoutEffect(() => {
    const el = contactSelectAllRef.current
    if (el) {
      el.indeterminate = someContactsFilterSelected
    }
  }, [someContactsFilterSelected, allContactsInFilterSelected, filteredRows.length])

  useEffect(() => {
    setSelectedContactIds((prev) => {
      if (prev.size === 0) {
        return prev
      }
      const valid = new Set(filteredRows.map((r) => r.id))
      const next = new Set<string>()
      for (const id of prev) {
        if (valid.has(id)) {
          next.add(id)
        }
      }
      if (next.size === prev.size) {
        for (const id of prev) {
          if (!next.has(id)) {
            return next
          }
        }
        return prev
      }
      return next
    })
  }, [filteredRows])

  useEffect(() => {
    setSelectedContactIds(new Set())
  }, [contactsListTab])

  const toggleSelectContact = useCallback((id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAllContactsFiltered = useCallback(() => {
    if (filteredRows.length === 0) {
      return
    }
    if (allContactsInFilterSelected) {
      setSelectedContactIds((prev) => {
        const next = new Set(prev)
        for (const r of filteredRows) {
          next.delete(r.id)
        }
        return next
      })
    } else {
      setSelectedContactIds((prev) => {
        const next = new Set(prev)
        for (const r of filteredRows) {
          next.add(r.id)
        }
        return next
      })
    }
  }, [filteredRows, allContactsInFilterSelected])

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const [list, dbTags, dbLists] = await Promise.all([
        fetchContacts(),
        fetchOrganizationContactTags(),
        fetchOrganizationContactLists(),
      ])
      setRows(list)
      setDbCatalogTagNames(dbTags)
      setDbCatalogListNames(dbLists)
    } finally {
      setLoading(false)
    }
  }, [orgScopeKey])

  const handleRefreshContacts = useCallback(async () => {
    setTableResetKey((k) => k + 1)
    setPage(1)
    setToolbarNotice("")
    setSelectedContactIds(new Set())
    await loadContacts()
  }, [loadContacts])

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
    void loadContacts()
  }, [loadContacts])

  useEffect(() => {
    if (searchParams.get("addContact") !== "1") return
    setViewContactId(null)
    setContactToEdit(null)
    setAddOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete("addContact")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  function handleSuspendAll() {
    if (contactsListTab !== "active" || tabRows.length === 0) return
    setToolbarNotice("")
    setSuspendAllOpen(true)
  }

  function closeSuspendAllModal() {
    if (suspendAllBusy) return
    setSuspendAllOpen(false)
  }

  function confirmSuspendAll() {
    if (contactsListTab !== "active" || tabRows.length === 0) return
    const targets = [...tabRows]
    const n = targets.length
    setSuspendAllBusy(true)
    void (async () => {
      try {
        const results = await Promise.allSettled(
          targets.map((row) => patchContactStatus(row.id, "suspended")),
        )
        const updatedById = new Map<string, ContactRow>()
        let failed = 0
        for (const result of results) {
          if (result.status === "fulfilled") {
            updatedById.set(result.value.id, result.value)
          } else {
            failed += 1
          }
        }
        if (updatedById.size > 0) {
          setRows((prev) =>
            prev.map((r) => updatedById.get(r.id) ?? r),
          )
        }
        setSelectedContactIds(new Set())
        setSuspendAllOpen(false)
        if (failed > 0) {
          const succeeded = updatedById.size
          toast.error(
            "Could not suspend all contacts",
            succeeded > 0
              ? `Suspended ${succeeded} of ${n}; ${failed} failed. Refresh and try again for the rest.`
              : "None of the contacts could be suspended. Try again.",
          )
          if (succeeded > 0) {
            toast.success(
              "Contacts suspended",
              `Moved ${succeeded} contact${succeeded === 1 ? "" : "s"} to Archived.`,
            )
          }
          return
        }
        toast.success(
          "Contacts suspended",
          `Moved ${n} contact${n === 1 ? "" : "s"} to Archived.`,
        )
      } catch (err) {
        toast.error(
          "Could not suspend contacts",
          err instanceof Error ? err.message : "Please try again.",
        )
      } finally {
        setSuspendAllBusy(false)
      }
    })()
  }

  const selectedContacts = useMemo(
    () => filteredRows.filter((r) => selectedContactIds.has(r.id)),
    [filteredRows, selectedContactIds],
  )
  const senderEmail = useMemo(() => getCurrentSessionUserEmail(), [])
  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [emailTemplates, selectedTemplateId],
  )

  const openSendMailModal = useCallback(() => {
    void (async () => {
      const templates = (await loadEmailTemplates()).filter((t) => !t.archived)
      setEmailTemplates(templates)
      setSelectedTemplateId((prev) =>
        prev && templates.some((t) => t.id === prev)
          ? prev
          : (templates[0]?.id ?? ""),
      )
      setSendMailCc("")
      setSendMailModalOpen(true)
    })()
  }, [])

  const closeSendMailModal = useCallback(() => {
    setSendMailModalOpen(false)
    setSendMailEmailPreview(null)
  }, [])

  const goNewTemplateFromSendMail = useCallback(() => {
    navigate("/contacts/email-templates/new")
  }, [navigate])

  const openSendMailEmailPreview = useCallback(
    (mode: "view" | "edit") => {
      const template = emailTemplates.find((t) => t.id === selectedTemplateId)
      if (!template) {
        toast.error("Template required", "Choose an email template first.")
        return
      }
      const emails = [
        ...new Set(
          selectedContacts
            .map((r) => String(r.email ?? "").trim())
            .filter((e) => e.includes("@")),
        ),
      ]
      if (emails.length === 0) {
        toast.error("No email recipients", "Selected contacts have no valid email.")
        return
      }
      setSendMailEmailPreview({
        templateId: template.id,
        templateName: template.name,
        templateArchived: Boolean(template.archived),
        createdBy: template.createdBy,
        createdAt: template.createdAt,
        subject: template.subject,
        bodyHtml: template.body,
        toEmails: emails,
        ccEmails: parseEmailInput(sendMailCc),
        attachment: template.attachment,
        startInEditMode: mode === "edit",
      })
    },
    [emailTemplates, selectedContacts, selectedTemplateId, sendMailCc],
  )

  const handleSendMailPreviewSaved = useCallback(
    (patch: { subject: string; bodyHtml: string }) => {
      setSendMailEmailPreview((p) =>
        p ? { ...p, ...patch, startInEditMode: false } : null,
      )
      void loadEmailTemplates().then((rows) => {
        setEmailTemplates(rows.filter((t) => !t.archived))
      })
    },
    [],
  )

  const handleSendMailToSelectedContacts = useCallback(async () => {
    const emails = [
      ...new Set(
        selectedContacts
          .map((r) => String(r.email ?? "").trim())
          .filter((e) => e.includes("@")),
      ),
    ]
    if (emails.length === 0) {
      toast.error("No email recipients", "Selected contacts have no valid email.")
      return
    }
    const template = emailTemplates.find((t) => t.id === selectedTemplateId)
    if (!template) {
      toast.error("Template required", "Choose an email template first.")
      return
    }
    const result = await openSendMailDraft({
      to: emails,
      ccRaw: sendMailCc,
      templateSubject: template.subject,
      templateBodyHtml: template.body,
      senderEmail,
    })
    if (!result.ok) {
      toast.error("Could not send email", result.message)
      return
    }
    toast.success("Email sent", "Message was sent from server.")
    closeSendMailModal()
  }, [
    emailTemplates,
    selectedContacts,
    selectedTemplateId,
    sendMailCc,
    senderEmail,
    closeSendMailModal,
  ])

  async function handleSave(contact: Omit<ContactRow, "id" | "createdByDisplayName">) {
    const created = await createContact(contact)
    setRows((prev) => [created, ...prev])
    toast.success(
      "Contact added",
      `${contactDisplayName(created)} is in your contact list.`,
    )
  }

  const handleUpdate = useCallback(
    async (
      id: string,
      contact: Omit<ContactRow, "id" | "createdByDisplayName">,
      editReason: string,
    ) => {
      const updated = await updateContact(id, contact, editReason)
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)))
    },
    [],
  )

  const openAddPanel = useCallback(() => {
    setViewContactId(null)
    setContactToEdit(null)
    setAddOpen(true)
  }, [])

  const openEditPanel = useCallback((row: ContactRow) => {
    setViewContactId(null)
    setContactToEdit(row)
    setAddOpen(true)
  }, [])

  const viewContact = useMemo(
    () =>
      viewContactId ? rows.find((r) => r.id === viewContactId) ?? null : null,
    [rows, viewContactId],
  )

  useEffect(() => {
    if (viewContactId && !rows.some((r) => r.id === viewContactId)) {
      setViewContactId(null)
    }
  }, [rows, viewContactId])

  const openViewPanel = useCallback((row: ContactRow) => {
    navigate(`/contacts/${encodeURIComponent(row.id)}`)
  }, [navigate])

  const onShowOfferingsChange = useCallback(
    async (row: ContactRow, value: ContactOfferingVisibility | "") => {
      const next = value === "" ? null : value
      const prev = row.showOfferingsVisibility ?? null
      if (prev === next) return
      setRows((list) =>
        list.map((r) =>
          r.id === row.id ? { ...r, showOfferingsVisibility: next } : r,
        ),
      )
      try {
        const updated = await patchContactShowOfferings(row.id, next)
        setRows((list) =>
          list.map((r) => (r.id === updated.id ? updated : r)),
        )
      } catch (err) {
        setRows((list) =>
          list.map((r) =>
            r.id === row.id ? { ...r, showOfferingsVisibility: prev } : r,
          ),
        )
        toast.error(
          "Could not update",
          err instanceof Error ? err.message : "Try again.",
        )
      }
    },
    [],
  )

  const openSuspendContact = useCallback((row: ContactRow) => {
    setSuspendRow(row)
    setSuspendReason("")
    setSuspendErr("")
  }, [])

  const closeSuspendContact = useCallback(() => {
    setSuspendRow(null)
    setSuspendReason("")
    setSuspendErr("")
  }, [])

  const exportContactRow = useCallback((row: ContactRow) => {
    const csv = buildContactsCsv([row])
    const filename = buildTableExportFilename({ dealName: contactDisplayName(row) })
    downloadContactsCsv(csv, filename)
    void notifyContactsExportAudit({
      rowCount: 1,
      exportedContactLines: exportAuditLinesForContacts([row]),
    })
    toast.success("Contact exported", `Saved as ${filename}`)
  }, [])

  const submitSuspendContact = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!suspendRow) return
      const activating = contactRowIsSuspended(suspendRow)
      const reason = suspendReason.trim()
      if (!activating && !reason) {
        setSuspendErr("Please enter a reason for suspending this contact.")
        return
      }
      setSuspendSaving(true)
      setSuspendErr("")
      try {
        const nextStatus = activating ? "active" : "suspended"
        const updated = await patchContactStatus(suspendRow.id, nextStatus)
        setRows((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        )
        toast.success(
          activating ? "Contact activated" : "Contact suspended",
          activating
            ? "This contact is active again."
            : "This contact is suspended.",
        )
        closeSuspendContact()
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not update contact."
        setSuspendErr(msg)
        toast.error(
          activating ? "Could not activate contact" : "Could not suspend contact",
          msg,
        )
      } finally {
        setSuspendSaving(false)
      }
    },
    [suspendRow, suspendReason, closeSuspendContact],
  )

  const openEditFromView = useCallback(() => {
    if (!viewContactId) return
    const row = rows.find((r) => r.id === viewContactId)
    setViewContactId(null)
    if (row) {
      setContactToEdit(row)
      setAddOpen(true)
    }
  }, [viewContactId, rows])

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filteredRows.length,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      ariaLabel:
        contactsListTab === "archived"
          ? "Archived contacts table pagination"
          : "Active contacts table pagination",
    }),
    [page, pageSize, filteredRows.length, contactsListTab],
  )

  const tagCountInUse = useMemo(
    () =>
      tagCatalog.filter(
        (t) => rows.filter((c) => contactHasTag(c, t.name)).length > 0,
      ).length,
    [tagCatalog, rows],
  )
  const tagCountUnused = tagCatalog.length - tagCountInUse

  const listCountInUse = useMemo(
    () =>
      listCatalog.filter(
        (t) => rows.filter((c) => c.lists.includes(t.name)).length > 0,
      ).length,
    [listCatalog, rows],
  )
  const listCountUnused = listCatalog.length - listCountInUse

  const tagCatalogUsageFiltered = useMemo(() => {
    if (tagsUsageFilter === "all") return tagCatalog
    return tagCatalog.filter((t) => {
      const n = rows.filter((c) => contactHasTag(c, t.name)).length
      return tagsUsageFilter === "in_use" ? n > 0 : n === 0
    })
  }, [tagCatalog, rows, tagsUsageFilter])

  const listCatalogUsageFiltered = useMemo(() => {
    if (listsUsageFilter === "all") return listCatalog
    return listCatalog.filter((t) => {
      const n = rows.filter((c) => c.lists.includes(t.name)).length
      return listsUsageFilter === "in_use" ? n > 0 : n === 0
    })
  }, [listCatalog, rows, listsUsageFilter])

  const filteredTagCatalogRows = useMemo(() => {
    const q = tagsSearchQuery.trim().toLowerCase()
    if (!q) return tagCatalogUsageFiltered
    return tagCatalogUsageFiltered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    )
  }, [tagCatalogUsageFiltered, tagsSearchQuery])

  const filteredListCatalogRows = useMemo(() => {
    const q = listsSearchQuery.trim().toLowerCase()
    if (!q) return listCatalogUsageFiltered
    return listCatalogUsageFiltered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    )
  }, [listCatalogUsageFiltered, listsSearchQuery])

  useEffect(() => {
    setTagsPage(1)
  }, [tagsSearchQuery, tagsUsageFilter])

  useEffect(() => {
    setListsPage(1)
  }, [listsSearchQuery, listsUsageFilter])

  useEffect(() => {
    const total = Math.max(
      1,
      Math.ceil(filteredTagCatalogRows.length / tagsPageSize),
    )
    if (tagsPage > total) setTagsPage(total)
  }, [filteredTagCatalogRows.length, tagsPage, tagsPageSize])

  useEffect(() => {
    const total = Math.max(
      1,
      Math.ceil(filteredListCatalogRows.length / listsPageSize),
    )
    if (listsPage > total) setListsPage(total)
  }, [filteredListCatalogRows.length, listsPage, listsPageSize])

  const tagsPagination = useMemo(
    () => ({
      page: tagsPage,
      pageSize: tagsPageSize,
      totalItems: filteredTagCatalogRows.length,
      onPageChange: setTagsPage,
      onPageSizeChange: setTagsPageSize,
      ariaLabel: "Tags table pagination",
    }),
    [tagsPage, tagsPageSize, filteredTagCatalogRows.length],
  )

  const listsPagination = useMemo(
    () => ({
      page: listsPage,
      pageSize: listsPageSize,
      totalItems: filteredListCatalogRows.length,
      onPageChange: setListsPage,
      onPageSizeChange: setListsPageSize,
      ariaLabel: "Lists table pagination",
    }),
    [listsPage, listsPageSize, filteredListCatalogRows.length],
  )

  const catalogTagNames = useMemo(
    () => tagCatalog.map((t) => t.name.trim()).filter(Boolean),
    [tagCatalog],
  )
  const catalogListNames = useMemo(
    () => listCatalog.map((t) => t.name.trim()).filter(Boolean),
    [listCatalog],
  )

  function openLabelAdd(kind: "tag" | "list") {
    setLabelModalErr("")
    setLabelModalName("")
    setLabelModalDesc("")
    setLabelModal({ kind, mode: "add" })
  }

  function openLabelEdit(kind: "tag" | "list", row: ContactLabelRow) {
    setLabelModalErr("")
    setLabelModalName(row.name)
    setLabelModalDesc(row.description)
    setLabelModal({ kind, mode: "edit", row })
  }

  function closeLabelModal() {
    if (labelModalBusy) return
    setLabelModal(null)
    setLabelModalErr("")
  }

  const submitLabelModal = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!labelModal) return
      const nameTrim = labelModalName.trim()
      const descTrim = labelModalDesc.trim()
      if (!nameTrim) {
        setLabelModalErr("Name is required.")
        return
      }
      const catalog = labelModal.kind === "tag" ? tagCatalog : listCatalog
      const setCatalog = labelModal.kind === "tag" ? setTagCatalog : setListCatalog
      const dup = catalog.some(
        (x) =>
          x.name.toLowerCase() === nameTrim.toLowerCase() &&
          (labelModal.mode === "add" || x.id !== labelModal.row.id),
      )
      if (dup) {
        setLabelModalErr(
          `A ${labelModal.kind === "tag" ? "tag" : "list"} with this name already exists.`,
        )
        return
      }
      if (labelModal.mode === "add") {
        setCatalog((prev) =>
          [...prev, { id: newLabelId(), name: nameTrim, description: descTrim }].sort(
            (a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          ),
        )
        toast.success(
          labelModal.kind === "tag" ? "Tag added" : "List added",
          `${nameTrim} is available when editing contacts.`,
        )
        setLabelModal(null)
        return
      }
      const prevRow = labelModal.row
      const field = labelModal.kind === "tag" ? "tags" : "lists"
      const oldName = prevRow.name
      if (nameTrim === oldName && descTrim === prevRow.description.trim()) {
        setLabelModal(null)
        return
      }
      if (nameTrim !== oldName) {
        const affected = rows.filter((r) =>
          field === "tags"
            ? r.tags.includes(oldName)
            : r.lists.includes(oldName),
        )
        if (affected.length === 0) {
          setCatalog((prev) =>
            prev.map((x) =>
              x.id === prevRow.id
                ? { ...x, name: nameTrim, description: descTrim }
                : x,
            ),
          )
          toast.success(
            labelModal.kind === "tag" ? "Tag updated" : "List updated",
            "Saved.",
          )
          setLabelModal(null)
          return
        }
        setLabelModalBusy(true)
        setLabelModalErr("")
        try {
          for (const r of affected) {
            const nextTagsOrLists =
              field === "tags"
                ? r.tags.map((t) => (t === oldName ? nameTrim : t))
                : r.lists.map((t) => (t === oldName ? nameTrim : t))
            const payload =
              field === "tags"
                ? { ...toContactUpdatePayload(r), tags: nextTagsOrLists }
                : { ...toContactUpdatePayload(r), lists: nextTagsOrLists }
            const updated = await updateContact(
              r.id,
              payload,
              labelModal.kind === "tag"
                ? "Contact tag renamed"
                : "Contact list renamed",
            )
            setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
          }
          setCatalog((prev) =>
            prev.map((x) =>
              x.id === prevRow.id
                ? { ...x, name: nameTrim, description: descTrim }
                : x,
            ),
          )
          toast.success(
            labelModal.kind === "tag" ? "Tag updated" : "List updated",
            `Renamed on ${affected.length} contact${affected.length === 1 ? "" : "s"}.`,
          )
          setLabelModal(null)
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Could not update contacts."
          setLabelModalErr(msg)
          toast.error("Update failed", msg)
        } finally {
          setLabelModalBusy(false)
        }
        return
      }
      setCatalog((prev) =>
        prev.map((x) =>
          x.id === prevRow.id ? { ...x, description: descTrim } : x,
        ),
      )
      toast.success(
        labelModal.kind === "tag" ? "Tag updated" : "List updated",
        "Saved.",
      )
      setLabelModal(null)
    },
    [
      labelModal,
      labelModalName,
      labelModalDesc,
      rows,
      tagCatalog,
      listCatalog,
    ],
  )

  const tagColumns: DataTableColumn<ContactLabelRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        sortValue: (r) => r.name.toLowerCase(),
        cell: (r) => (
          <button
            type="button"
            className="deals_table_name_link contacts_catalog_name_btn"
            onClick={() => openContactsForTag(r.name)}
            aria-label={`View contacts with tag ${r.name}`}
          >
            {r.name}
          </button>
        ),
      },
      {
        id: "description",
        header: "Description",
        sortValue: (r) => r.description.toLowerCase(),
        cell: (r) => (r.description.trim() ? r.description : "—"),
      },
      {
        id: "contacts",
        header: "Contacts",
        align: "center",
        sortValue: (r) => rows.filter((c) => contactHasTag(c, r.name)).length,
        cell: (r) => {
          const count = rows.filter((c) => contactHasTag(c, r.name)).length
          return (
            <button
              type="button"
              className="deals_table_name_link contacts_catalog_count_btn"
              onClick={() => openContactsForTag(r.name)}
              aria-label={`View ${count} contact${count === 1 ? "" : "s"} with tag ${r.name}`}
            >
              {count}
            </button>
          )
        },
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        colWidth: CONTACTS_ACTIONS_COL_WIDTH,
        thClassName: "um_th_actions contacts_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions contacts_td_actions",
        cell: (r) => (
          <ContactCatalogRowActions
            itemLabel={r.name}
            kind="tag"
            onEdit={() => openLabelEdit("tag", r)}
          />
        ),
      },
    ],
    [openContactsForTag, rows],
  )

  const listColumns: DataTableColumn<ContactLabelRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        sortValue: (r) => r.name.toLowerCase(),
        cell: (r) => r.name,
      },
      {
        id: "description",
        header: "Description",
        sortValue: (r) => r.description.toLowerCase(),
        cell: (r) => (r.description.trim() ? r.description : "—"),
      },
      {
        id: "contacts",
        header: "Contacts",
        align: "center",
        sortValue: (r) => rows.filter((c) => c.lists.includes(r.name)).length,
        cell: (r) => rows.filter((c) => c.lists.includes(r.name)).length,
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: CONTACTS_ACTIONS_COL_WIDTH,
        thClassName: "um_th_actions contacts_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions contacts_td_actions",
        cell: (r) => (
          <ContactCatalogRowActions
            itemLabel={r.name}
            kind="list"
            onEdit={() => openLabelEdit("list", r)}
          />
        ),
      },
    ],
    [rows],
  )

  const columns: DataTableColumn<ContactRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: (
          <input
            ref={contactSelectAllRef}
            type="checkbox"
            className="um_table_header_select_cb"
            checked={allContactsInFilterSelected}
            onChange={toggleSelectAllContactsFiltered}
            disabled={loading || filteredRows.length === 0}
            aria-label="Select all contacts in this list"
          />
        ),
        align: "center",
        thClassName: "um_th_checkbox",
        tdClassName: "um_td_checkbox",
        cell: (row) => (
          <input
            type="checkbox"
            className="um_table_row_select_cb"
            checked={selectedContactIds.has(row.id)}
            onChange={() => toggleSelectContact(row.id)}
            onClick={(e) => e.stopPropagation()}
            disabled={loading}
            aria-label={`Select contact ${
              [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
              row.email ||
              row.id
            }`}
          />
        ),
      },
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
                {primary === "—" ? (
                  <span className="um_user_meta_username um_user_meta_username--placeholder">
                    {primary}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="um_user_meta_username contacts_user_name_link"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/contacts/${encodeURIComponent(row.id)}`)
                    }}
                  >
                    {primary}
                  </button>
                )}
                {isDisplayableEmail(rawEmail) ? (
                  <a
                    href={`mailto:${encodeURIComponent(rawEmail)}`}
                    className="um_user_meta_email um_user_meta_email_link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rawEmail}
                  </a>
                ) : (
                  <span className="um_user_meta_email um_status_muted">
                    {emailShown}
                  </span>
                )}
                {/* {dealN > 0 ? (
                  <span
                    className="contacts_user_deal_line"
                    title="Add Investment rows in deal_investment where contact_id is this contact (same count as Deals column)."
                  >
                    {dealN} investment{dealN === 1 ? "" : "s"}
                  </span>
                ) : null} */}
              </div>
            </div>
          )
        },
      },
      {
        id: "deals",
        header: "Deals",
        align: "center",
        thClassName: "contacts_th_deals_count",
        tdClassName: "contacts_td_deals_count",
        sortValue: (row) => row.dealCount ?? 0,
        cell: (row) => {
          const n = row.dealCount ?? 0
          if (n <= 0) {
            return (
              <span className="contacts_deals_count_num contacts_deals_count_num--empty">
                0
              </span>
            )
          }
          return (
            <span
              className="contacts_deals_count_num contacts_deals_count_num--value"
              title="Distinct deals where this contact id or a portal user with the same email has an investment (your visible deals only)."
            >
              {n}
            </span>
          )
        },
      },
      {
        id: "phone",
        header: "Phone",
        sortValue: (row) => nationalDigitsFromStoredPhone(String(row.phone ?? "")),
        thClassName: "contacts_th_phone",
        tdClassName: "contacts_td_phone",
        cell: (row) => formatUsPhoneStoredForUi(row.phone),
      },
      {
        id: "showOfferingsVisibility",
        header: "Offering Visibility",
        sortValue: (row) => row.showOfferingsVisibility ?? "",
        thClassName: "contacts_th_show_offerings",
        tdClassName: "contacts_td_show_offerings",
        cell: (row) => (
          <div
            className="contacts_show_offerings_dd"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DropdownSelect
              className="contacts_show_offerings_dropdown"
              triggerClassName="contacts_show_offerings_dropdown_trigger"
              panelClassName="contacts_show_offerings_dropdown_panel"
              value={row.showOfferingsVisibility ?? ""}
              options={OFFERING_VISIBILITY_CELL_OPTIONS}
              disabled={loading || contactsListTab === "archived"}
              ariaLabel={`Offering visibility for ${contactDisplayName(row)}`}
              useFixedPanel
              onChange={(v) => {
                void onShowOfferingsChange(
                  row,
                  v as ContactOfferingVisibility | "",
                )
              }}
            />
          </div>
        ),
      },
      {
        id: "accreditationStatus",
        header: "Accreditation Status",
        align: "center",
        sortValue: (row) => row.accreditationStatus ?? "",
        thClassName: "contacts_th_accreditation",
        tdClassName: "contacts_td_accreditation",
        cell: (row) => {
          const status = (row.accreditationStatus ?? "").trim()
          const tone =
            status.toLowerCase() === "accredited"
              ? "accredited"
              : status.toLowerCase() === "not accredited"
                ? "not-accredited"
                : "na"
          const label =
            tone === "accredited"
              ? "Accredited"
              : tone === "not-accredited"
                ? "Not Accredited"
                : "N/A"
          return (
            <span
              className={`contacts_accreditation_badge contacts_accreditation_badge--${tone}`}
            >
              {label}
            </span>
          )
        },
      },
      {
        id: "knownSince",
        header: "Known Since",
        align: "center",
        sortValue: (row) => row.knownSince ?? "",
        thClassName: "contacts_th_known_since",
        tdClassName: "contacts_td_known_since",
        cell: (row) => {
          const date = (row.knownSince ?? "").trim()
          return <span>{date || "-"}</span>
        },
      },
      // {
      //   id: "note",
      //   header: "Note",
      //   sortValue: (row) => row.note ?? "",
      //   cell: (row) => (
      //     <span title={row.note || undefined}>
      //       {row.note ? row.note : "—"}
      //     </span>
      //   ),
      // },
      /* Hidden: Contact tags & Lists columns (restore by uncommenting)
      {
        id: "tags",
        header: "Contact tags",
        sortValue: (row) => row.tags.join(" "),
        cell: (row) => <TagsCell items={row.tags} />,
      },
      {
        id: "lists",
        header: "Lists",
        sortValue: (row) => row.lists.join(" "),
        cell: (row) => (
          <span>{row.lists.length ? row.lists.join(", ") : "—"}</span>
        ),
      },
      */
      {
        id: "owners",
        header: "Owners",
        sortValue: (row) => row.owners.join(" "),
        cell: (row) => <TagsCell items={row.owners} />,
      },
      // {
      //   id: "createdBy",
      //   header: "Added by",
      //   sortValue: (row) => row.createdByDisplayName ?? "",
      //   cell: (row) => row.createdByDisplayName?.trim() || "—",
      // },
      // {
      //   id: "since",
      //   header: "Since",
      //   sortValue: (row) => {
      //     const t = row.createdAt
      //       ? new Date(row.createdAt).getTime()
      //       : NaN
      //     return Number.isFinite(t) ? t : 0
      //   },
      //   cell: (row) => (
      //     <span title={row.createdAt}>{formatContactSinceLabel(row.createdAt)}</span>
      //   ),
      // },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: CONTACTS_ACTIONS_COL_WIDTH,
        thClassName: "um_th_actions contacts_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions contacts_td_actions",
        cell: (row) => (
          <ContactRowActions
            contactLabel={
              [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
              row.email ||
              "Contact"
            }
            isSuspended={contactRowIsSuspended(row)}
            onView={() => openViewPanel(row)}
            onEdit={
              contactsListTab === "archived"
                ? undefined
                : () => openEditPanel(row)
            }
            onSuspend={() => openSuspendContact(row)}
            onExport={() => exportContactRow(row)}
          />
        ),
      },
    ],
    [
      allContactsInFilterSelected,
      contactsListTab,
      exportContactRow,
      filteredRows.length,
      loading,
      navigate,
      onShowOfferingsChange,
      openEditPanel,
      openSuspendContact,
      openViewPanel,
      selectedContactIds,
      toggleSelectAllContactsFiltered,
      toggleSelectContact,
    ],
  )

  useEffect(() => {
    setPage(1)
  }, [
    searchQuery,
    contactsListTab,
    tagFilter,
    accreditationFilter,
    offeringVisibilityFilter,
  ])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
    if (page > totalPages) setPage(totalPages)
  }, [filteredRows.length, page, pageSize])

  const tagsTableEmptyLabel = useMemo(() => {
    if (tagCatalog.length === 0) {
      return "No tags yet. Add a tag or assign tags on a contact."
    }
    if (tagCatalogUsageFiltered.length === 0) {
      if (tagsUsageFilter === "in_use") {
        return "No tags are used on any contact yet."
      }
      if (tagsUsageFilter === "unused") {
        return "No unused tags."
      }
    }
    return "No tags match your search or filter."
  }, [
    tagCatalog.length,
    tagCatalogUsageFiltered.length,
    tagsUsageFilter,
  ])

  const listsTableEmptyLabel = useMemo(() => {
    if (listCatalog.length === 0) {
      return "No lists yet. Add a list or assign lists on a contact."
    }
    if (listCatalogUsageFiltered.length === 0) {
      if (listsUsageFilter === "in_use") {
        return "No lists are used on any contact yet."
      }
      if (listsUsageFilter === "unused") {
        return "No unused lists."
      }
    }
    return "No lists match your search or filter."
  }, [
    listCatalog.length,
    listCatalogUsageFiltered.length,
    listsUsageFilter,
  ])

  return (
    <section className="um_page contacts_page">
      <div className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <ContactRound
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            Contacts
          </h2>
          {mainTab === "contacts" ? (
            <button
              type="button"
              className="um_btn_primary contacts_toolbar_add_btn"
              onClick={openAddPanel}
            >
              <Plus size={18} strokeWidth={2} aria-hidden />
              Add Contact
            </button>
          ) : mainTab === "tags" ? (
            <button
              type="button"
              className="um_btn_primary contacts_toolbar_add_btn"
              onClick={() => openLabelAdd("tag")}
            >
              <Plus size={18} strokeWidth={2} aria-hidden />
              Add Tags
            </button>
          ) : (
            <button
              type="button"
              className="um_btn_primary contacts_toolbar_add_btn"
              onClick={() => openLabelAdd("list")}
            >
              <Plus size={18} strokeWidth={2} aria-hidden />
              Add Lists
            </button>
          )}
        </div>
      </div>

      <div className="um_members_tabs_outer deals_tabs_outer contacts_main_tabs_outer um_segmented_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Contacts, tags, and lists"
          >
            <button
              type="button"
              id="contacts-main-tab-contacts"
              role="tab"
              aria-selected={mainTab === "contacts"}
              aria-controls="contacts-main-panel-contacts"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                mainTab === "contacts" ? " um_members_tab_active" : ""
              }`}
              onClick={() => {
                setMainTab("contacts")
                setToolbarNotice("")
              }}
            >
              <ContactRound
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Contact
              </span>
            </button>
            <button
              type="button"
              id="contacts-main-tab-tags"
              role="tab"
              aria-selected={mainTab === "tags"}
              aria-controls="contacts-main-panel-tags"
              aria-label={`Tags, ${tagCatalog.length}`}
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                mainTab === "tags" ? " um_members_tab_active" : ""
              }`}
              onClick={() => {
                setMainTab("tags")
                setToolbarNotice("")
              }}
            >
              <Tag
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Tags
              </span>
              <span className="deals_tabs_count contacts_tab_count" aria-hidden>
                ({tagCatalog.length})
              </span>
            </button>
            <button
              type="button"
              id="contacts-main-tab-lists"
              role="tab"
              aria-selected={mainTab === "lists"}
              aria-controls="contacts-main-panel-lists"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                mainTab === "lists" ? " um_members_tab_active" : ""
              }`}
              onClick={() => {
                setMainTab("lists")
                setToolbarNotice("")
              }}
            >
              <LayoutList
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Lists
              </span>
            </button>
          </div>
        </TabsScrollStrip>
      </div>

      {mainTab === "contacts" ? (
        <div
          id="contacts-main-panel-contacts"
          role="tabpanel"
          aria-labelledby="contacts-main-tab-contacts"
          className="contacts_main_tab_panel_wrap"
        >
          <div className="um_members_tab_content contacts_main_tab_content_flush">
            <div
              className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel"
              id="contacts-directory-panel"
              role="region"
              aria-label={
                contactsListTab === "archived"
                  ? "Archived contacts"
                  : "Active contacts"
              }
            >
              <div className="contacts_directory_toolbar">
                    <div className="contacts_directory_toolbar_start">
                      <div
                        className="contacts_status_pills"
                        role="tablist"
                        aria-label="Filter contacts by status"
                      >
                        <button
                          type="button"
                          id="contacts-filter-active"
                          role="tab"
                          aria-selected={contactsListTab === "active"}
                          aria-controls="contacts-main-panel-contacts"
                          aria-label={`Active, ${activeCount}`}
                          className={`contacts_status_pill${
                            contactsListTab === "active"
                              ? " contacts_status_pill_active"
                              : ""
                          }`}
                          onClick={() => {
                            setContactsListTab("active")
                            setToolbarNotice("")
                          }}
                        >
                          <ContactRound size={14} strokeWidth={2} aria-hidden />
                          <span>Active</span>
                          <span className="contacts_status_pill_count" aria-hidden>
                            {activeCount}
                          </span>
                        </button>
                        <button
                          type="button"
                          id="contacts-filter-archived"
                          role="tab"
                          aria-selected={contactsListTab === "archived"}
                          aria-controls="contacts-main-panel-contacts"
                          aria-label={`Archived, ${archivedCount}`}
                          className={`contacts_status_pill${
                            contactsListTab === "archived"
                              ? " contacts_status_pill_active"
                              : ""
                          }`}
                          onClick={() => {
                            setContactsListTab("archived")
                            setToolbarNotice("")
                          }}
                        >
                          <Archive size={14} strokeWidth={2} aria-hidden />
                          <span>Archived</span>
                          <span className="contacts_status_pill_count" aria-hidden>
                            {archivedCount}
                          </span>
                        </button>
                      </div>

                      <div
                        className="contacts_directory_actions"
                        role="toolbar"
                        aria-label="Contact actions"
                      >
                        <button
                          type="button"
                          className="um_btn_toolbar"
                          onClick={openSendMailModal}
                          disabled={loading || selectedContacts.length === 0}
                        >
                          <Send size={16} strokeWidth={2} aria-hidden />
                          Send email
                        </button>
                        <button
                          type="button"
                          className="um_btn_toolbar"
                          onClick={handleSuspendAll}
                          disabled={
                            loading ||
                            contactsListTab === "archived" ||
                            tabRows.length === 0
                          }
                        >
                          <Ban size={16} strokeWidth={2} aria-hidden />
                          Suspend all
                        </button>
                        <button
                          type="button"
                          className="um_toolbar_export_btn"
                          onClick={() => setExportModalOpen(true)}
                          disabled={loading || tabRows.length === 0}
                        >
                          <Download size={16} strokeWidth={2} aria-hidden />
                          <span>Export</span>
                        </button>
                        <button
                          type="button"
                          className="um_btn_toolbar"
                          onClick={() => void handleRefreshContacts()}
                          disabled={loading}
                          aria-label="Refresh contacts and reset sorting"
                        >
                          {loading ? (
                            <Loader2
                              size={16}
                              strokeWidth={2}
                              className="um_spin"
                              aria-hidden
                            />
                          ) : (
                            <RefreshCw size={16} strokeWidth={2} aria-hidden />
                          )}
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div className="contacts_directory_toolbar_end">
                      <div className="contacts_toolbar_filter">
                        <DropdownSelect
                          id="contacts-filter-offering-visibility"
                          className="contacts_toolbar_filter_dropdown"
                          triggerClassName="contacts_toolbar_filter_dropdown_trigger"
                          panelClassName="contacts_toolbar_filter_dropdown_panel"
                          value={offeringVisibilityFilter}
                          options={OFFERING_VISIBILITY_FILTER_OPTIONS}
                          disabled={loading}
                          ariaLabel="Filter by offering visibility"
                          placeholder="Visibility"
                          useFixedPanel
                          onChange={(v) => {
                            setOfferingVisibilityFilter(
                              v as OfferingVisibilityFilter,
                            )
                            setToolbarNotice("")
                          }}
                        />
                      </div>
                      <div className="contacts_toolbar_filter">
                        <DropdownSelect
                          id="contacts-filter-accreditation"
                          className="contacts_toolbar_filter_dropdown contacts_accreditation_filter_select"
                          triggerClassName="contacts_toolbar_filter_dropdown_trigger"
                          panelClassName="contacts_toolbar_filter_dropdown_panel"
                          value={accreditationFilter}
                          options={[
                            { value: "all", label: "All accreditation" },
                            { value: "Accredited", label: "Accredited" },
                            {
                              value: "Not Accredited",
                              label: "Not Accredited",
                            },
                            { value: "na", label: "N/A" },
                          ]}
                          disabled={loading}
                          ariaLabel="Filter by accreditation status"
                          placeholder="Accreditation"
                          useFixedPanel
                          onChange={(v) => {
                            setAccreditationFilter(
                              v as
                                | "all"
                                | "Accredited"
                                | "Not Accredited"
                                | "na",
                            )
                            setToolbarNotice("")
                          }}
                        />
                      </div>
                      <div className="um_search_wrap contacts_directory_search">
                        <Search
                          className="um_search_icon"
                          size={16}
                          aria-hidden
                        />
                        <input
                          type="search"
                          className="um_search_input"
                          placeholder="Search contacts…"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setToolbarNotice("")
                          }}
                          aria-label={
                            contactsListTab === "archived"
                              ? "Search archived contacts"
                              : "Search active contacts"
                          }
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>
              {toolbarNotice ? (
                <p className="um_toolbar_notice" role="status">
                  {toolbarNotice}
                </p>
              ) : null}
              {tagFilter ? (
                <div
                  className="contacts_active_tag_filter"
                  role="status"
                  aria-live="polite"
                >
                  <span className="contacts_active_tag_filter_label">
                    Showing contacts with tag{" "}
                    <strong className="contacts_active_tag_filter_name">
                      {tagFilter}
                    </strong>
                    {` (${filteredRows.length})`}
                  </span>
                  <button
                    type="button"
                    className="contacts_active_tag_filter_clear"
                    onClick={() => {
                      setTagFilter(null)
                      setPage(1)
                    }}
                  >
                    <X size={14} strokeWidth={2} aria-hidden />
                    Clear filter
                  </button>
                </div>
              ) : null}
              <DataTable
                key={tableResetKey}
                visualVariant="members"
                stickyFirstColumn
                columns={columns}
                rows={loading ? [] : filteredRows}
                isLoading={loading}
                getRowKey={(row) => row.id}
                getRowClassName={(row) =>
                  contactsListTab === "active" && contactRowIsSuspended(row)
                    ? "contacts_row_suspended"
                    : undefined
                }
                emptyLabel={
                  loading
                    ? "Loading contacts…"
                    : rows.length === 0
                      ? "No contacts yet. Add a contact to see it here."
                      : tabRows.length === 0
                        ? contactsListTab === "archived"
                          ? "No archived contacts. Suspend a contact from Active to move it here."
                          : "No active contacts."
                        : tagFilter
                          ? `No contacts with tag “${tagFilter}”.`
                          : offeringVisibilityFilter !== "all"
                            ? "No contacts match this offering visibility filter."
                            : accreditationFilter !== "all"
                              ? "No contacts match this accreditation filter."
                              : "No contacts match your search."
                }
                emptyStateRole={loading ? "status" : undefined}
                pagination={
                  !loading && filteredRows.length > 0 ? pagination : undefined
                }
              />
            </div>
      </div>
      </div>
      ) : mainTab === "tags" ? (
        <>
          <UsageFilterTabs
            value={tagsUsageFilter}
            onChange={setTagsUsageFilter}
            allCount={tagCatalog.length}
            inUseCount={tagCountInUse}
            unusedCount={tagCountUnused}
            idPrefix="contacts-tags-filter"
            ariaLabel="Filter tags by usage"
            className="contacts_status_tabs_outer"
          />
          <div
            className="um_members_tab_content contacts_main_tab_content_flush"
            id="contacts-main-panel-tags"
            role="tabpanel"
            aria-labelledby="contacts-main-tab-tags"
          >
            <div className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel">
              <div className="um_toolbar">
                <div className="um_search_wrap">
                  <Search className="um_search_icon" size={18} aria-hidden />
                  <input
                    type="search"
                    className="um_search_input"
                    placeholder="Search tags"
                    value={tagsSearchQuery}
                    onChange={(e) => setTagsSearchQuery(e.target.value)}
                    aria-label="Search tags"
                  />
                </div>
              </div>
              <DataTable
                visualVariant="members"
                columns={tagColumns}
                rows={filteredTagCatalogRows}
                getRowKey={(r) => r.id}
                emptyLabel={tagsTableEmptyLabel}
                onBodyRowClick={(r) => openContactsForTag(r.name)}
                pagination={
                  filteredTagCatalogRows.length > 0
                    ? tagsPagination
                    : undefined
                }
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <UsageFilterTabs
            value={listsUsageFilter}
            onChange={setListsUsageFilter}
            allCount={listCatalog.length}
            inUseCount={listCountInUse}
            unusedCount={listCountUnused}
            idPrefix="contacts-lists-filter"
            ariaLabel="Filter lists by usage"
            className="contacts_status_tabs_outer"
          />
          <div
            className="um_members_tab_content contacts_main_tab_content_flush"
            id="contacts-main-panel-lists"
            role="tabpanel"
            aria-labelledby="contacts-main-tab-lists"
          >
            <div className="um_panel um_members_tab_panel deal_inv_table_panel contacts_table_panel">
              <div className="um_toolbar">
                <div className="um_search_wrap">
                  <Search className="um_search_icon" size={18} aria-hidden />
                  <input
                    type="search"
                    className="um_search_input"
                    placeholder="Search lists"
                    value={listsSearchQuery}
                    onChange={(e) => setListsSearchQuery(e.target.value)}
                    aria-label="Search lists"
                  />
                </div>
              </div>
              <DataTable
                visualVariant="members"
                columns={listColumns}
                rows={filteredListCatalogRows}
                getRowKey={(r) => r.id}
                emptyLabel={listsTableEmptyLabel}
                pagination={
                  filteredListCatalogRows.length > 0
                    ? listsPagination
                    : undefined
                }
              />
            </div>
          </div>
        </>
      )}

      {labelModal ? (
        <div
          className="um_modal_overlay contacts_label_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal contacts_label_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-label-modal-title"
          >
            <div className="um_modal_head contacts_label_modal_head">
              <h3
                id="contacts-label-modal-title"
                className="um_modal_title um_title_with_icon contacts_label_modal_title"
              >
                {labelModal.kind === "tag" ? (
                  <Tag
                    className="um_title_icon contacts_label_modal_title_icon"
                    size={22}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                ) : (
                  <LayoutList
                    className="um_title_icon contacts_label_modal_title_icon"
                    size={22}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
                <span>
                  {labelModal.mode === "add"
                    ? labelModal.kind === "tag"
                      ? "Add tag"
                      : "Add list"
                    : labelModal.kind === "tag"
                      ? "Edit tag"
                      : "Edit list"}
                </span>
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={labelModalBusy}
                onClick={() => closeLabelModal()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <form
              className="contacts_label_modal_form"
              onSubmit={(e) => void submitLabelModal(e)}
            >
              <div className="um_field contacts_label_modal_field">
                <label
                  className="um_field_label_row"
                  htmlFor="contacts-label-name"
                >
                  {labelModal.kind === "tag" ? (
                    <Tag
                      className="um_field_label_icon"
                      size={17}
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <LayoutList
                      className="um_field_label_icon"
                      size={17}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  <span>Name</span>
                </label>
                <input
                  id="contacts-label-name"
                  type="text"
                  value={labelModalName}
                  onChange={(e) => {
                    setLabelModalName(e.target.value)
                    setLabelModalErr("")
                  }}
                  disabled={labelModalBusy}
                  autoComplete="off"
                  placeholder={
                    labelModal.kind === "tag"
                      ? "e.g. Accredited, VIP"
                      : "e.g. Newsletter, Q1 outreach"
                  }
                  required
                />
              </div>
              <div className="um_field contacts_label_modal_field">
                <label
                  className="um_field_label_row"
                  htmlFor="contacts-label-desc"
                >
                  <AlignLeft
                    className="um_field_label_icon"
                    size={17}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>Description</span>
                </label>
                <textarea
                  id="contacts-label-desc"
                  className="um_field_textarea contacts_label_modal_textarea"
                  value={labelModalDesc}
                  onChange={(e) => {
                    setLabelModalDesc(e.target.value)
                    setLabelModalErr("")
                  }}
                  disabled={labelModalBusy}
                  rows={4}
                  placeholder="Optional notes for your team"
                />
              </div>
              {labelModalErr ? (
                <p className="um_msg_error um_modal_form_error" role="alert">
                  {labelModalErr}
                </p>
              ) : null}
              <div className="um_modal_actions contacts_label_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  disabled={labelModalBusy}
                  onClick={() => closeLabelModal()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={labelModalBusy}
                >
                  {labelModalBusy ? (
                    <Loader2 size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <Save size={16} strokeWidth={2} aria-hidden />
                  )}
                  {labelModalBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AddContactPanel
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setContactToEdit(null)
        }}
        onSave={handleSave}
        contactToEdit={contactToEdit}
        onUpdate={handleUpdate}
        existingContacts={rows}
        catalogTagNames={catalogTagNames}
        catalogListNames={catalogListNames}
      />

      <ViewContactModal
        contact={viewContact}
        onClose={() => setViewContactId(null)}
        onEdit={
          contactsListTab === "archived" ? undefined : openEditFromView
        }
      />

      <ExportContactsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        contacts={tabRows}
        listKind={contactsListTab}
      />

      {sendMailModalOpen ? (
        <div
          className="um_modal_overlay contacts_suspend_overlay"
          role="presentation"
        >
          <div
            className="um_modal contacts_suspend_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-send-mail-title"
          >
            <div className="um_modal_head">
              <h3
                id="contacts-send-mail-title"
                className="um_modal_title um_title_with_icon"
              >
                <Mail
                  className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_info"
                  size={22}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>Send email</span>
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={closeSendMailModal}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <p className="contacts_suspend_modal_desc contacts_suspend_modal_desc_info">
              <Info
                className="contacts_suspend_modal_desc_icon"
                size={18}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                Sending to {selectedContacts.length} selected contact
                {selectedContacts.length === 1 ? "" : "s"}.
              </span>
            </p>

            {/* <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="contacts-send-mail-from"
              >
                <span>From</span>
              </label>
              <input
                id="contacts-send-mail-from"
                type="text"
                className="um_input"
                value={senderEmail || "Current user"}
                readOnly
              />
            </div> */}

            <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="contacts-send-mail-cc"
              >
                <span>CC</span>
              </label>
              <input
                id="contacts-send-mail-cc"
                type="text"
                className="um_input"
                placeholder="email1@domain.com, email2@domain.com"
                value={sendMailCc}
                onChange={(e) => setSendMailCc(e.target.value)}
              />
            </div>

            <div className="um_field contacts_suspend_reason_field">
              <div className="contacts_send_mail_template_head">
                <label
                  className="um_field_label_row"
                  htmlFor="contacts-send-mail-template"
                >
                  <span>Email template</span>
                </label>
              </div>
              <div className="contacts_send_mail_template_select_row">
                <select
                  id="contacts-send-mail-template"
                  className="um_field_select contacts_send_mail_template_select"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  {emailTemplates.length === 0 ? (
                    <option value="">No active templates</option>
                  ) : null}
                  {emailTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate ? (
                  <>
                    <button
                      type="button"
                      className="contacts_send_mail_template_edit_btn"
                      aria-label="View"
                      title="View"
                      onClick={() => openSendMailEmailPreview("view")}
                    >
                      <Eye size={16} strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="contacts_send_mail_template_edit_btn"
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => openSendMailEmailPreview("edit")}
                    >
                      <Pencil size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="contacts_send_mail_template_edit_btn"
                  aria-label="New template"
                  title="New template"
                  onClick={goNewTemplateFromSendMail}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                </button>
              </div>
              {emailTemplates.length === 0 ? (
                <p className="um_hint" role="status">
                  Create an email template first in Email Templates.
                </p>
              ) : null}
            </div>

            <div className="um_modal_actions contacts_suspend_modal_actions">
              <button
                type="button"
                className="um_btn_secondary"
                onClick={closeSendMailModal}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
              <button
                type="button"
                className="um_btn_primary"
                disabled={!selectedTemplateId || selectedContacts.length === 0}
                onClick={handleSendMailToSelectedContacts}
              >
                <Send size={16} strokeWidth={2} aria-hidden />
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SendMailEmailPreviewModal
        preview={sendMailEmailPreview}
        onClose={() => setSendMailEmailPreview(null)}
        onSaved={handleSendMailPreviewSaved}
      />

      {suspendAllOpen ? (
        <div
          className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSuspendAllModal()
          }}
        >
          <div
            className="um_modal um_modal_view deals_add_inv_modal_panel deals_suspend_all_modal_panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={suspendAllTitleId}
          >
            <div className="um_modal_head">
              <h3 id={suspendAllTitleId} className="um_modal_title">
                Suspend all contacts?
              </h3>
              <button
                type="button"
                className="um_modal_close"
                onClick={closeSuspendAllModal}
                disabled={suspendAllBusy}
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="deals_suspend_all_modal_body">
              <p className="deals_suspend_all_modal_message">
                Suspend {tabRows.length} active contact
                {tabRows.length === 1 ? "" : "s"}? They will move to the
                Archived tab and can be activated again later.
              </p>
            </div>
            <div className="um_modal_actions add_contact_modal_actions">
              <button
                type="button"
                className="um_btn_secondary"
                onClick={closeSuspendAllModal}
                disabled={suspendAllBusy}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
              <button
                type="button"
                className="um_btn_primary"
                onClick={confirmSuspendAll}
                disabled={suspendAllBusy}
              >
                <Ban size={16} strokeWidth={2} aria-hidden />
                {suspendAllBusy ? "Suspending…" : "Suspend all"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {suspendRow ? (
        <div
          className="um_modal_overlay contacts_suspend_overlay"
          role="presentation"
        >
          <div
            className="um_modal contacts_suspend_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-suspend-title"
            aria-describedby="contacts-suspend-desc"
          >
            <div className="um_modal_head">
              <h3
                id="contacts-suspend-title"
                className="um_modal_title um_title_with_icon"
              >
                {contactRowIsSuspended(suspendRow) ? (
                  <CheckCircle2
                    className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_activate"
                    size={22}
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <Ban
                    className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_suspend"
                    size={22}
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
                <span>
                  {contactRowIsSuspended(suspendRow)
                    ? "Activate contact"
                    : "Suspend contact"}
                </span>
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={suspendSaving}
                onClick={() => closeSuspendContact()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <p
              id="contacts-suspend-desc"
              className={
                contactRowIsSuspended(suspendRow)
                  ? "contacts_suspend_modal_desc contacts_suspend_modal_desc_info"
                  : "contacts_suspend_modal_desc contacts_suspend_modal_desc_warn"
              }
            >
              {contactRowIsSuspended(suspendRow) ? (
                <Info
                  className="contacts_suspend_modal_desc_icon"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
              ) : (
                <AlertTriangle
                  className="contacts_suspend_modal_desc_icon"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
              )}
              <span>
                {contactRowIsSuspended(suspendRow)
                  ? "This contact will return to your active list and can be edited and exported as usual."
                  : "They will move to Archived and won’t appear in your active list until you activate them again."}
              </span>
            </p>

            <div className="contacts_suspend_modal_grid">
              <ViewReadonlyField
                Icon={User}
                label="Name"
                value={
                  [suspendRow.firstName, suspendRow.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "—"
                }
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(suspendRow.email)}
              />
            </div>

            <form
              className="contacts_suspend_modal_form"
              onSubmit={(e) => void submitSuspendContact(e)}
            >
              {!contactRowIsSuspended(suspendRow) ? (
                <div className="um_field contacts_suspend_reason_field">
                  <label
                    className="um_field_label_row"
                    htmlFor="contacts-suspend-reason"
                  >
                    <ClipboardList
                      className="um_field_label_icon"
                      size={17}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span>
                      Reason for suspension{" "}
                      <span className="contacts_required" aria-hidden>
                        *
                      </span>
                    </span>
                  </label>
                  <textarea
                    id="contacts-suspend-reason"
                    className="um_field_textarea contacts_suspend_reason_textarea"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="e.g. No longer a prospect, requested removal…"
                    rows={3}
                    disabled={suspendSaving}
                    aria-required
                  />
                </div>
              ) : null}
              {suspendErr ? (
                <p
                  className="um_msg_error um_modal_form_error contacts_suspend_modal_error"
                  role="alert"
                >
                  {suspendErr}
                </p>
              ) : null}
              <div className="um_modal_actions contacts_suspend_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  disabled={suspendSaving}
                  onClick={() => closeSuspendContact()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={
                    suspendSaving ||
                    (!contactRowIsSuspended(suspendRow) &&
                      !suspendReason.trim())
                  }
                >
                  {contactRowIsSuspended(suspendRow) ? (
                    <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <Ban size={16} strokeWidth={2} aria-hidden />
                  )}
                  {suspendSaving
                    ? contactRowIsSuspended(suspendRow)
                      ? "Activating…"
                      : "Suspending…"
                    : contactRowIsSuspended(suspendRow)
                      ? "Activate contact"
                      : "Suspend contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default ContactsPage
