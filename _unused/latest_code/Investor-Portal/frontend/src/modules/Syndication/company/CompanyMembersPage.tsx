import {
  Activity,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Phone,
  RefreshCw,
  Search,
  Send,
  Shield,
  Upload,
  User,
  UserCog,
  Info,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable"
import { ViewReadonlyField } from "../../../common/components/ViewReadonlyField"
import { toast } from "../../../common/components/Toast"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../common/utils/displayEmail"
import {
  loadEmailTemplates,
  type EmailTemplateRow,
} from "../contacts/emailTemplatesStorage"
import { decodeJwtPayload } from "../../auth/utils/decode-jwt-payload"
import { SESSION_BEARER_KEY } from "../../../common/auth/sessionKeys"
import { formatUsPhoneStoredForUi } from "../../../common/phone/usPhoneNumber"
import { getApiV1Base } from "../../../common/utils/apiBaseUrl"
import {
  getCurrentSessionUserEmail,
  openSendMailDraft,
  parseEmailInput,
} from "../../../common/features/send-mail"
import {
  SendMailEmailPreviewModal,
  type SendMailEmailPreviewPayload,
} from "../contacts/components/SendMailEmailPreviewModal"
import {
  MEMBER_AUDIT_ACTION_EDIT,
  MEMBER_AUDIT_ACTION_SUSPEND,
  MEMBER_STATUS_EDIT_OPTIONS,
  PLATFORM_INVITE_ROLE_OPTIONS,
  accountInviteIsExpired,
  accountStatusForUi,
  accountStatusLabel,
  formatMemberUsername,
  formatOrganizationsCsvCell,
  formatRoleCsvCell,
  formatValue,
  isOrgStaffPortalRole,
  memberRoleDisplayName,
  memberUserCellPrimaryLabel,
  rowDisplayName,
  memberInvitePending,
  memberRowIsCurrentUser,
  memberRowIsInactive,
  membershipsSortValue,
  organizationsSortValue,
  normalizeMemberStatusForEdit,
  primaryRoleLabelFromRow,
  resolveOrganizationDisplayScope,
  roleSortValue,
  syncSessionUserDetailsById,
  userStatusForUi,
  type OrganizationDisplayScope,
} from "../usermanagement/memberAdminShared"
import { MemberRoleBadge } from "../usermanagement/MemberRoleBadge"
import { UserOrganizationsCell } from "../usermanagement/UserOrganizationsCell"
import { buildMembersCsv, downloadMembersCsv, exportAuditLinesForMembers } from "../usermanagement/memberCsv"
import { notifyMembersExportAudit } from "../usermanagement/membersExportNotifyApi"
import { ExportMembersModal } from "../usermanagement/ExportMembersModal"
import { buildTableExportFilename } from "../../../common/utils/tableExportFilename"
import type { CustomerCompanyOutletContext } from "./CustomerCompanyLayout"
import "../Deals/deal-investors-tab.css"
import "../Deals/deals-list.css"
import "../usermanagement/user_management.css"
import "../contacts/contacts.css"
import "./company_page.css"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function initialsFromRow(row: Record<string, unknown>): string {
  const first = String(row.firstName ?? "").trim()
  const last = String(row.lastName ?? "").trim()
  if (first && last) {
    return (first[0] + last[0]).toUpperCase()
  }
  if (first.length >= 2) return first.slice(0, 2).toUpperCase()
  const u = String(row.username ?? "").trim()
  if (u.length >= 2) return u.slice(0, 2).toUpperCase()
  const e = String(row.email ?? "").trim()
  if (e.length >= 2) return e.slice(0, 2).toUpperCase()
  return "?"
}

function rowStableId(row: Record<string, unknown>, index: number): string {
  const id = row.id ?? row.user_id
  if (id != null && String(id).trim()) return String(id).trim()
  return `member-${index}`
}

function rowSelectionId(row: Record<string, unknown>): string {
  const id = row.id ?? row.user_id
  return id != null ? String(id).trim() : ""
}

function memberRowMatchesSearch(
  row: Record<string, unknown>,
  query: string,
  organizationScope?: OrganizationDisplayScope | null,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [
    rowDisplayName(row),
    formatValue(row.email),
    formatMemberUsername(row.username),
    formatValue(row.companyName),
    formatValue(row.company_name),
    formatUsPhoneStoredForUi(row.phone),
    formatValue(row.role),
    memberRoleDisplayName(row.role),
    primaryRoleLabelFromRow(row),
    membershipsSortValue(row),
    organizationsSortValue(row, organizationScope),
    formatRoleCsvCell(row),
    formatOrganizationsCsvCell(row, organizationScope),
    formatValue(row.userStatus),
    userStatusForUi(row).label,
    accountStatusLabel(row),
  ]
    .join(" ")
    .toLowerCase()
  return hay.includes(q)
}

function StatusWithDot({
  positive,
  label,
  dotTone,
}: {
  positive: boolean
  label: string
  dotTone?: "invited"
}) {
  if (label === "—") {
    return <span className="um_status_muted">—</span>
  }
  const dotClass =
    dotTone === "invited"
      ? "um_status_dot um_status_dot_invited"
      : positive
        ? "um_status_dot um_status_dot_active"
        : "um_status_dot um_status_dot_inactive"
  return (
    <span className="um_status_cell">
      <span className={dotClass} aria-hidden />
      <span className="um_status_label">{label}</span>
    </span>
  )
}

export default function CompanyMembersPage() {
  const { companyId = "" } = useParams<{ companyId: string }>()
  const navigate = useNavigate()
  const { companyDisplayName } = useOutletContext<CustomerCompanyOutletContext>()
  const apiV1 = getApiV1Base()
  const token = sessionStorage.getItem(SESSION_BEARER_KEY)

  const currentUserId = useMemo(() => {
    if (!token) return ""
    const p = decodeJwtPayload<{ id?: unknown }>(token)
    const id = p?.id
    if (id == null || id === "") return ""
    return String(id).trim().toLowerCase()
  }, [token])

  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchQuery, setSearchQuery] = useState("")

  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null)
  const [actionMenuRow, setActionMenuRow] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  )
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [sendMailModalOpen, setSendMailModalOpen] = useState(false)
  const [sendMailConfirmOpen, setSendMailConfirmOpen] = useState(false)
  const [sendMailSending, setSendMailSending] = useState(false)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [sendMailCc, setSendMailCc] = useState("")
  const [sendMailEmailPreview, setSendMailEmailPreview] =
    useState<SendMailEmailPreviewPayload | null>(null)
  const [reinviteBusyId, setReinviteBusyId] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null)
  const [editRole, setEditRole] = useState("")
  const [editUserStatus, setEditUserStatus] = useState("active")
  const [editReason, setEditReason] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [editErr, setEditErr] = useState("")
  const [suspendRow, setSuspendRow] = useState<Record<string, unknown> | null>(
    null,
  )
  const [suspendReason, setSuspendReason] = useState("")
  const [suspendSaving, setSuspendSaving] = useState(false)
  const [suspendErr, setSuspendErr] = useState("")
  const [membersExportOpen, setMembersExportOpen] = useState(false)

  const kebabPortalRef = useRef<HTMLUListElement | null>(null)
  const kebabTriggerRef = useRef<HTMLButtonElement | null>(null)
  const memberSelectAllRef = useRef<HTMLInputElement | null>(null)

  const closeActionMenu = useCallback(() => {
    setActionMenuRowId(null)
    setActionMenuRow(null)
    setMenuPos(null)
  }, [])

  const openMenuContext =
    actionMenuRowId && actionMenuRow
      ? { row: actionMenuRow, rowId: actionMenuRowId }
      : null

  const updateKebabMenuPosition = useCallback(() => {
    if (!actionMenuRowId) {
      setMenuPos(null)
      return
    }
    const el = kebabTriggerRef.current
    if (!(el instanceof HTMLElement)) {
      setMenuPos(null)
      return
    }
    const r = el.getBoundingClientRect()
    const menuMinW = 168
    const margin = 8
    let left = r.right - menuMinW
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - menuMinW - margin),
    )
    setMenuPos({ top: r.bottom + 4, left })
  }, [actionMenuRowId])

  useLayoutEffect(() => {
    if (!actionMenuRowId) {
      setMenuPos(null)
      return
    }
    updateKebabMenuPosition()
    window.addEventListener("scroll", updateKebabMenuPosition, true)
    window.addEventListener("resize", updateKebabMenuPosition)
    return () => {
      window.removeEventListener("scroll", updateKebabMenuPosition, true)
      window.removeEventListener("resize", updateKebabMenuPosition)
    }
  }, [actionMenuRowId, updateKebabMenuPosition])

  useEffect(() => {
    if (actionMenuRowId == null) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (kebabTriggerRef.current?.contains(t)) return
      if (kebabPortalRef.current?.contains(t)) return
      closeActionMenu()
    }
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", onDoc)
    }
  }, [actionMenuRowId, closeActionMenu])

  useEffect(() => {
    if (actionMenuRowId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActionMenu()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [actionMenuRowId, closeActionMenu])

  const load = useCallback(async () => {
    const id = companyId.trim()
    if (!token || !apiV1) {
      setError("Not signed in.")
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    setMembers([])
    closeActionMenu()
    try {
      const userRes = await fetch(
        `${apiV1}/users?organizationId=${encodeURIComponent(id)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      )

      const userData = (await userRes.json().catch(() => ({}))) as {
        users?: unknown
        message?: string
      }
      if (!userRes.ok) {
        setError(userData.message || "Could not load members")
        return
      }
      const list = Array.isArray(userData.users) ? userData.users : []
      setMembers(
        list.filter(
          (x): x is Record<string, unknown> =>
            x !== null &&
            typeof x === "object" &&
            !Array.isArray(x) &&
            isOrgStaffPortalRole(x.role),
        ),
      )
    } catch {
      setError("Unable to connect.")
    } finally {
      setLoading(false)
    }
  }, [companyId, token, apiV1, closeActionMenu])

  useEffect(() => {
    if (!UUID_RE.test(companyId.trim())) {
      navigate("/customers", { replace: true })
      return
    }
    void load()
  }, [companyId, navigate, load])

  const titleCompany = companyDisplayName?.trim() || "Company"

  const organizationDisplayScope = useMemo(
    () => resolveOrganizationDisplayScope(companyId, companyDisplayName),
    [companyId, companyDisplayName],
  )

  const filteredMembers = useMemo(
    () =>
      members.filter((row) =>
        memberRowMatchesSearch(row, searchQuery, organizationDisplayScope),
      ),
    [members, searchQuery, organizationDisplayScope],
  )

  const sendInviteForEmail = useCallback(
    async (
      email: string,
      orgId?: string,
      invitedRole?: string,
    ): Promise<{ ok: boolean; message: string }> => {
      if (!token || !apiV1) {
        return { ok: false, message: "Not signed in." }
      }
      const body: {
        email: string
        companyId?: string
        invitedRole?: string
      } = {
        email: email.trim().toLowerCase(),
      }
      if (orgId) body.companyId = orgId
      if (invitedRole) body.invitedRole = invitedRole
      const response = await fetch(`${apiV1}/auth/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as {
        message?: string
      }
      if (!response.ok) {
        return { ok: false, message: data.message || "Could not send invite." }
      }
      return {
        ok: true,
        message: data.message || "Invitation sent.",
      }
    },
    [token, apiV1],
  )

  function exportRowCsv(row: Record<string, unknown>) {
    const orgScope = resolveOrganizationDisplayScope(companyId, companyDisplayName)
    const csv = buildMembersCsv([row], orgScope)
    const filename = buildTableExportFilename({
      dealName: rowDisplayName(row),
      tableSlug: "member",
    })
    downloadMembersCsv(csv, filename)
    void notifyMembersExportAudit({
      rowCount: 1,
      exportedMemberLines: exportAuditLinesForMembers([row]),
    })
    closeActionMenu()
    toast.success("Member exported", `Saved as ${filename}`)
  }

  async function reinviteRow(row: Record<string, unknown>, rowId: string) {
    const email = String(row.email ?? "").trim()
    if (!email) {
      toast.error("Cannot reinvite", "No email on file for this user.")
      closeActionMenu()
      return
    }
    setReinviteBusyId(rowId)
    try {
      const invitedRole = String(row.role ?? "").trim() || undefined
      const result = await sendInviteForEmail(
        email,
        companyId.trim(),
        invitedRole,
      )
      if (result.ok) {
        toast.success("User invited successfully")
        void load()
      } else {
        toast.error("Reinvite failed", result.message)
      }
    } catch {
      toast.error("Reinvite failed", "Unable to connect. Try again later.")
    } finally {
      setReinviteBusyId(null)
      closeActionMenu()
    }
  }

  function openEditMember(row: Record<string, unknown>) {
    if (memberRowIsCurrentUser(row, currentUserId)) {
      toast.error("Cannot edit", "You cannot edit your own account here.")
      return
    }
    setEditRow(row)
    const rawRole = String(row.role ?? "").trim()
    const roleForEdit =
      rawRole === "user" || rawRole === "" ? "platform_user" : rawRole
    setEditRole(roleForEdit)
    setEditUserStatus(normalizeMemberStatusForEdit(row))
    setEditReason("")
    setEditErr("")
  }

  function closeEditMember() {
    setEditRow(null)
    setEditReason("")
    setEditErr("")
  }

  function openSuspendMember(row: Record<string, unknown>) {
    if (memberRowIsCurrentUser(row, currentUserId)) {
      toast.error(
        "Cannot change status",
        "You cannot suspend or activate your own account here.",
      )
      return
    }
    setSuspendRow(row)
    setSuspendReason("")
    setSuspendErr("")
  }

  function closeSuspendMember() {
    setSuspendRow(null)
    setSuspendReason("")
    setSuspendErr("")
  }

  async function submitEditMember(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow || !token || !apiV1) return
    if (memberRowIsCurrentUser(editRow, currentUserId)) {
      setEditErr("You cannot edit your own account.")
      return
    }
    const id = String(editRow.id ?? "").trim()
    if (!id) {
      setEditErr("Missing member id.")
      return
    }
    const reason = editReason.trim()
    if (!reason) {
      setEditErr("Please enter a reason for this change.")
      return
    }
    setEditSaving(true)
    setEditErr("")
    try {
      const res = await fetch(`${apiV1}/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: editRole,
          userStatus: editUserStatus,
          reason,
          action: MEMBER_AUDIT_ACTION_EDIT,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        user?: Record<string, unknown>
      }
      if (!res.ok) {
        const msg = data.message || "Could not save changes."
        setEditErr(msg)
        toast.error("Could not update member", msg)
        return
      }
      const u = data.user
      if (u && typeof u === "object") {
        setMembers((prev) =>
          prev.map((r) => (String(r.id) === id ? { ...r, ...u } : r)),
        )
        syncSessionUserDetailsById(id, u)
      }
      const okMsg = data.message || "Member updated."
      toast.success("Member updated", okMsg)
      closeEditMember()
    } catch {
      setEditErr("Unable to connect.")
      toast.error("Could not update member", "Unable to connect.")
    } finally {
      setEditSaving(false)
    }
  }

  async function submitSuspendMember(e: React.FormEvent) {
    e.preventDefault()
    if (!suspendRow || !token || !apiV1) return
    if (memberRowIsCurrentUser(suspendRow, currentUserId)) {
      setSuspendErr("You cannot suspend or activate your own account.")
      return
    }
    const id = String(suspendRow.id ?? "").trim()
    if (!id) {
      setSuspendErr("Missing member id.")
      return
    }
    const activating = memberRowIsInactive(suspendRow)
    const reason = suspendReason.trim()
    if (!reason) {
      setSuspendErr(
        activating
          ? "Please enter a reason for activating this member."
          : "Please enter a reason for suspending this member.",
      )
      return
    }
    setSuspendSaving(true)
    setSuspendErr("")
    try {
      const res = await fetch(`${apiV1}/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          activating
            ? {
                userStatus: "active",
                reason,
                action: MEMBER_AUDIT_ACTION_EDIT,
              }
            : {
                userStatus: "inactive",
                reason,
                action: MEMBER_AUDIT_ACTION_SUSPEND,
              },
        ),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        user?: Record<string, unknown>
      }
      if (!res.ok) {
        const msg =
          data.message ||
          (activating
            ? "Could not activate member."
            : "Could not suspend member.")
        setSuspendErr(msg)
        toast.error(
          activating ? "Could not activate member" : "Could not suspend member",
          msg,
        )
        return
      }
      const u = data.user
      if (u && typeof u === "object") {
        setMembers((prev) =>
          prev.map((r) => (String(r.id) === id ? { ...r, ...u } : r)),
        )
        syncSessionUserDetailsById(id, u)
      }
      const okMsg =
        data.message ||
        (activating ? "Member marked active." : "Member marked inactive.")
      toast.success(
        activating ? "Member activated" : "Member suspended",
        okMsg,
      )
      closeSuspendMember()
    } catch {
      setSuspendErr("Unable to connect.")
      toast.error(
        activating ? "Could not activate member" : "Could not suspend member",
        "Unable to connect.",
      )
    } finally {
      setSuspendSaving(false)
    }
  }

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filteredMembers.length,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      ariaLabel: `Members for ${titleCompany} table pagination`,
    }),
    [page, pageSize, filteredMembers.length, titleCompany],
  )

  const allMemberIds = useMemo(
    () => members.map((r) => rowSelectionId(r)).filter(Boolean),
    [members],
  )

  const selectableMemberIds = useMemo(
    () => filteredMembers.map((r) => rowSelectionId(r)).filter(Boolean),
    [filteredMembers],
  )

  const allMembersSelected = useMemo(
    () =>
      selectableMemberIds.length > 0 &&
      selectableMemberIds.every((id) => selectedMemberIds.has(id)),
    [selectableMemberIds, selectedMemberIds],
  )

  const someMembersSelected = useMemo(
    () =>
      selectableMemberIds.some((id) => selectedMemberIds.has(id)) &&
      !allMembersSelected,
    [selectableMemberIds, selectedMemberIds, allMembersSelected],
  )

  useLayoutEffect(() => {
    const el = memberSelectAllRef.current
    if (el) el.indeterminate = someMembersSelected
  }, [someMembersSelected, allMembersSelected, selectableMemberIds.length])

  useEffect(() => {
    setSelectedMemberIds((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(allMemberIds)
      const next = new Set<string>()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
      }
      if (next.size === prev.size) return prev
      return next
    })
  }, [allMemberIds])

  const selectedMemberRows = useMemo(
    () => members.filter((r) => selectedMemberIds.has(rowSelectionId(r))),
    [members, selectedMemberIds],
  )
  const selectedRecipientEmails = useMemo(
    () => [
      ...new Set(
        selectedMemberRows
          .map((r) => String(r.email ?? "").trim())
          .filter((e) => e.includes("@")),
      ),
    ],
    [selectedMemberRows],
  )
  const senderEmail = useMemo(() => getCurrentSessionUserEmail(), [])
  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [emailTemplates, selectedTemplateId],
  )
  const closeSendMailModal = useCallback(() => {
    setSendMailModalOpen(false)
    setSendMailConfirmOpen(false)
    setSendMailSending(false)
    setSendMailEmailPreview(null)
  }, [])

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
      setSendMailConfirmOpen(false)
      setSendMailModalOpen(true)
    })()
  }, [])

  useEffect(() => {
    if (!sendMailModalOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || sendMailSending) return
      if (sendMailConfirmOpen) {
        setSendMailConfirmOpen(false)
        return
      }
      closeSendMailModal()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [
    sendMailModalOpen,
    sendMailConfirmOpen,
    sendMailSending,
    closeSendMailModal,
  ])

  const openSendMailConfirm = useCallback(() => {
    if (selectedMemberRows.length === 0) {
      toast.error("No members selected", "Select at least one member using the checkboxes.")
      return
    }
    if (selectedRecipientEmails.length === 0) {
      toast.error(
        "No email recipients",
        "Selected members do not have a valid email address on file.",
      )
      return
    }
    if (!selectedTemplateId) {
      toast.error("Template required", "Choose an email template first.")
      return
    }
    setSendMailConfirmOpen(true)
  }, [selectedMemberRows.length, selectedRecipientEmails.length, selectedTemplateId])

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
          selectedMemberRows
            .map((r) => String(r.email ?? "").trim())
            .filter((e) => e.includes("@")),
        ),
      ]
      if (emails.length === 0) {
        toast.error("No email recipients", "Selected members have no valid email.")
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
    [emailTemplates, selectedMemberRows, selectedTemplateId, sendMailCc],
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

  const handleSendMailToSelectedMembers = useCallback(async () => {
    const template = emailTemplates.find((t) => t.id === selectedTemplateId)
    if (!template) {
      toast.error("Template required", "Choose an email template first.")
      return
    }
    setSendMailSending(true)
    try {
      const result = await openSendMailDraft({
        to: selectedRecipientEmails,
        ccRaw: sendMailCc,
        templateSubject: template.subject,
        templateBodyHtml: template.body,
        senderEmail,
      })
      if (!result.ok) {
        toast.error("Could not send email", result.message)
        return
      }
      toast.success("Email sent", "Message was sent from the portal.")
      setSelectedMemberIds(new Set())
      closeSendMailModal()
    } finally {
      setSendMailSending(false)
    }
  }, [
    emailTemplates,
    selectedRecipientEmails,
    selectedTemplateId,
    sendMailCc,
    senderEmail,
    closeSendMailModal,
  ])

  const toggleSelectMember = useCallback(
    (id: string) => {
      if (!id) return
      const wasSelected = selectedMemberIds.has(id)
      setSelectedMemberIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      if (!wasSelected) {
        openSendMailModal()
        return
      }
      if (selectedMemberIds.size <= 1) closeSendMailModal()
    },
    [selectedMemberIds, openSendMailModal, closeSendMailModal],
  )

  const toggleSelectAllMembers = useCallback(() => {
    if (selectableMemberIds.length === 0) return
    if (allMembersSelected) {
      setSelectedMemberIds(new Set())
      closeSendMailModal()
      return
    }
    setSelectedMemberIds(new Set(selectableMemberIds))
    openSendMailModal()
  }, [
    selectableMemberIds,
    allMembersSelected,
    openSendMailModal,
    closeSendMailModal,
  ])

  const columns: DataTableColumn<Record<string, unknown>>[] = useMemo(
    () => [
      {
        id: "select",
        header: (
          <input
            ref={memberSelectAllRef}
            type="checkbox"
            className="um_table_header_select_cb"
            checked={allMembersSelected}
            onChange={toggleSelectAllMembers}
            disabled={loading || selectableMemberIds.length === 0}
            aria-label="Select all org members in this list"
          />
        ),
        align: "center",
        colWidth: "2.75rem",
        thClassName: "um_th_checkbox",
        tdClassName: "um_td_checkbox",
        cell: (row) => {
          const id = rowSelectionId(row)
          return (
            <input
              type="checkbox"
              className="um_table_row_select_cb"
              checked={id ? selectedMemberIds.has(id) : false}
              onChange={() => toggleSelectMember(id)}
              onClick={(e) => e.stopPropagation()}
              disabled={!id}
              aria-label={`Select member ${
                memberUserCellPrimaryLabel(row) !== "—"
                  ? memberUserCellPrimaryLabel(row)
                  : "member"
              }`}
            />
          )
        },
      },
      {
        id: "user",
        header: "User",
        colWidth: "16rem",
        sortValue: (row) => {
          const name = memberUserCellPrimaryLabel(row)
          const e = displayEmail(row.email)
          return `${name} ${e}`.toLowerCase()
        },
        tdClassName: "um_td_user",
        cell: (row) => {
          const rawEmail = String(row.email ?? "").trim()
          const emailShown = displayEmail(row.email)
          const displayName = memberUserCellPrimaryLabel(row)
          const namePlaceholder =
            displayName === "—" ? " um_user_meta_username--placeholder" : ""
          return (
            <div className="um_user_cell">
              <div className="um_user_avatar_ring" aria-hidden>
                <span className="um_user_initials">
                  {initialsFromRow(row)}
                </span>
              </div>
              <div className="um_user_meta">
                <span
                  className={`um_user_meta_username${namePlaceholder}`}
                >
                  {displayName}
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
        id: "role",
        header: "Roles",
        colWidth: "9rem",
        sortValue: (row) => roleSortValue(row).toLowerCase(),
        tdClassName: "um_td_memberships um_td_role",
        cell: (row) => <MemberRoleBadge row={row} />,
      },
      {
        id: "organizations",
        header: organizationDisplayScope ? "Organization" : "Organizations",
        colWidth: "12rem",
        sortValue: (row) =>
          organizationsSortValue(row, organizationDisplayScope).toLowerCase(),
        tdClassName: "um_td_memberships",
        cell: (row) => (
          <UserOrganizationsCell
            row={row}
            organizationScope={organizationDisplayScope}
          />
        ),
      },
      {
        id: "status",
        header: "User Status",
        colWidth: "9rem",
        sortValue: (row) =>
          userStatusForUi(row).label.toLowerCase(),
        cell: (row) => {
          const uSt = userStatusForUi(row)
          return <StatusWithDot {...uSt} />
        },
      },
      {
        id: "account",
        header: "Account status",
        colWidth: "10rem",
        sortValue: (row) =>
          accountStatusForUi(row).label.toLowerCase(),
        cell: (row) => {
          const acct = accountStatusForUi(row)
          return (
            <StatusWithDot
              positive={acct.positive}
              label={acct.label}
              dotTone={acct.dotTone}
            />
          )
        },
      },
      {
        id: "actions",
        header: "Actions",
        colWidth: "5rem",
        align: "center",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions",
        cell: (row, rowIndex = 0) => {
          const rowKey = rowStableId(row, rowIndex)
          const memberLabel = memberUserCellPrimaryLabel(row)
          const menuOpen = actionMenuRowId === rowKey
          return (
            <div className="um_kebab_root">
              <button
                type="button"
                className="um_kebab_trigger"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`Actions for ${memberLabel !== "—" ? memberLabel : "member"}`}
                ref={
                  menuOpen
                    ? (el) => {
                        kebabTriggerRef.current = el
                      }
                    : undefined
                }
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setActionMenuRowId((current) => {
                    if (current === rowKey) {
                      setActionMenuRow(null)
                      setMenuPos(null)
                      return null
                    }
                    setActionMenuRow(row)
                    return rowKey
                  })
                }}
              >
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </div>
          )
        },
      },
    ],
    [
      actionMenuRowId,
      allMembersSelected,
      toggleSelectAllMembers,
      loading,
      organizationDisplayScope,
      selectableMemberIds.length,
      selectedMemberIds,
      toggleSelectMember,
    ],
  )

  useEffect(() => {
    setPage(1)
  }, [members.length, companyId, searchQuery])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize))
    if (page > totalPages) setPage(totalPages)
  }, [filteredMembers.length, page, pageSize])

  return (
    <div
      className={`um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel${
        loading ? " deals_list_table_panel_loading" : ""
      }`}
      id="cp-company-panel-members"
      role="tabpanel"
      aria-labelledby="cp-company-tab-members"
      aria-busy={loading}
    >
      <div className="cp_company_tab_panel_inner">
        <div className="um_toolbar cp_company_tab_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search">
          <p className="cp_company_tab_toolbar_hint">
            Portal members assigned to{" "}
            <strong className="cp_company_tab_toolbar_strong">
              {titleCompany}
            </strong>
            .
          </p>
          <div className="um_toolbar_actions">
            <button
              type="button"
              className="um_btn_toolbar"
              disabled={loading || selectedMemberRows.length === 0}
              onClick={() => {
                if (selectedMemberRows.length === 0) {
                  toast.error(
                    "No members selected",
                    "Select one or more members using the checkboxes in the table.",
                  )
                  return
                }
                openSendMailModal()
              }}
            >
              <Send size={18} strokeWidth={2} aria-hidden />
              Send email
            </button>
            <button
              type="button"
              className="um_toolbar_export_btn"
              disabled={loading || members.length === 0}
              onClick={() => setMembersExportOpen(true)}
            >
              <Download size={18} strokeWidth={2} aria-hidden />
              <span>Export All</span>
            </button>
            <button
              type="button"
              className="um_btn_toolbar"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={18} strokeWidth={2} aria-hidden />
              Refresh
            </button>
          </div>
          <div className="um_search_wrap">
            <Search className="um_search_icon" size={18} aria-hidden />
            <input
              type="search"
              className="um_search_input"
              placeholder="Search members…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={`Search members for ${titleCompany}`}
              disabled={loading}
            />
          </div>
        </div>

        {error ? (
          <p className="um_msg_error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && selectedMemberRows.length > 0 ? (
          <p className="um_toolbar_notice cp_company_members_selection_notice" role="status">
            {selectedMemberRows.length} member
            {selectedMemberRows.length === 1 ? "" : "s"} selected. Click{" "}
            <strong>Send email</strong> to compose a message for{" "}
            <strong>{titleCompany}</strong>.
          </p>
        ) : null}

        {!error ? (
          <div className="cp_company_tab_table_wrap">
            <DataTable
              visualVariant="members"
              stickyColumnCount={2}
              membersTableClassName="um_table_members deal_inv_table"
              initialSort={{ columnId: "user", direction: "asc" }}
              columns={columns}
              rows={loading ? [] : filteredMembers}
              getRowKey={(row, i) => rowStableId(row, i)}
              emptyLabel={
                loading
                  ? "Loading members…"
                  : members.length === 0
                    ? "No members in this company."
                    : searchQuery.trim()
                      ? "No members match your search."
                      : "No members in this company."
              }
              emptyStateRole={loading ? "status" : undefined}
              pagination={
                !loading && filteredMembers.length > 0 ? pagination : undefined
              }
            />
          </div>
        ) : null}
      </div>

      {actionMenuRowId &&
      menuPos &&
      openMenuContext &&
      typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={kebabPortalRef}
              className="um_kebab_menu um_kebab_menu--portal"
              role="menu"
              aria-label="Row actions"
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
              }}
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => {
                    setViewRow(openMenuContext.row)
                    closeActionMenu()
                  }}
                >
                  <Eye
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  View
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    memberInvitePending(openMenuContext.row) ||
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                  }
                  title={
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                      ? "You cannot edit your own account here."
                      : undefined
                  }
                  onClick={() => {
                    closeActionMenu()
                    openEditMember(openMenuContext.row)
                  }}
                >
                  <Pencil
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Edit
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    memberInvitePending(openMenuContext.row) ||
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                  }
                  title={
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                      ? "You cannot suspend or activate your own account here."
                      : undefined
                  }
                  onClick={() => {
                    closeActionMenu()
                    openSuspendMember(openMenuContext.row)
                  }}
                >
                  {memberRowIsInactive(openMenuContext.row) ? (
                    <CheckCircle2
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <Ban
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  {memberRowIsInactive(openMenuContext.row)
                    ? "Activate"
                    : "Suspend"}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    !accountInviteIsExpired(openMenuContext.row) ||
                    reinviteBusyId === openMenuContext.rowId
                  }
                  onClick={() =>
                    void reinviteRow(
                      openMenuContext.row,
                      openMenuContext.rowId,
                    )
                  }
                >
                  <Mail
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {reinviteBusyId === openMenuContext.rowId
                    ? "Reinviting…"
                    : "Reinvite"}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => exportRowCsv(openMenuContext.row)}
                >
                  <Upload
                    className="um_kebab_menuitem_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  Export
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}

      {viewRow ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal um_modal_view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-members-view-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-members-view-title" className="um_modal_title">
                Member details
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
            <div className="um_view_grid">
              <ViewReadonlyField
                Icon={User}
                label="User name"
                value={formatMemberUsername(viewRow.username)}
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(viewRow.email)}
              />
              <ViewReadonlyField
                Icon={User}
                label="First name"
                value={formatValue(viewRow.firstName)}
              />
              <ViewReadonlyField
                Icon={User}
                label="Last name"
                value={formatValue(viewRow.lastName)}
              />
              <ViewReadonlyField
                Icon={Shield}
                label="Roles"
                value={<MemberRoleBadge row={viewRow} />}
              />
              <ViewReadonlyField
                Icon={Building2}
                label={organizationDisplayScope ? "Organization" : "Organizations"}
                value={
                  <UserOrganizationsCell
                    row={viewRow}
                    organizationScope={organizationDisplayScope}
                  />
                }
                fieldClassName="um_view_field_span_full"
              />
              <ViewReadonlyField
                Icon={Phone}
                label="Phone"
                value={formatUsPhoneStoredForUi(viewRow.phone)}
              />
              <ViewReadonlyField
                Icon={Activity}
                label="User Status"
                value={<StatusWithDot {...userStatusForUi(viewRow)} />}
              />
              <ViewReadonlyField
                Icon={ClipboardList}
                label="Account status"
                value={<StatusWithDot {...accountStatusForUi(viewRow)} />}
              />
            </div>
            <div className="um_modal_actions um_modal_actions_view">
              <button
                type="button"
                className="um_btn_secondary"
                onClick={() => setViewRow(null)}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sendMailModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="um_modal_overlay contacts_suspend_overlay portal_modal_z_boost"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !sendMailSending) {
                  closeSendMailModal()
                }
              }}
            >
          <div
            className="um_modal contacts_suspend_modal cp_company_members_send_mail_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="org-members-send-mail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="um_modal_head">
              <h3
                id="org-members-send-mail-title"
                className="um_modal_title um_title_with_icon"
              >
                <Mail
                  className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_info"
                  size={22}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>Send email to selected members</span>
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={closeSendMailModal}
                disabled={sendMailSending}
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
                Use the row checkboxes to choose recipients, then send from here.
                You selected <strong>{selectedMemberRows.length}</strong> member
                {selectedMemberRows.length === 1 ? "" : "s"} at{" "}
                <strong>{titleCompany}</strong>
                {selectedRecipientEmails.length < selectedMemberRows.length
                  ? ` (${selectedRecipientEmails.length} with a valid email on file).`
                  : "."}
              </span>
            </p>
            <p className="cp_company_members_send_mail_help um_hint">
              Choose an email template and optional CC addresses. When you click
              Send, you will be asked to confirm before the message is delivered
              from the portal.
            </p>
            {/* <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="org-members-send-mail-from"
              >
                <span>From</span>
              </label>
              <input
                id="org-members-send-mail-from"
                type="text"
                className="um_input"
                value={senderEmail || "Current user"}
                readOnly
              />
            </div> */}
            <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="org-members-send-mail-cc"
              >
                <span>CC</span>
              </label>
              <input
                id="org-members-send-mail-cc"
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
                  htmlFor="org-members-send-mail-template"
                >
                  <span>Email template</span>
                </label>
              </div>
              <div className="contacts_send_mail_template_select_row">
                <select
                  id="org-members-send-mail-template"
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
                disabled={sendMailSending}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
              <button
                type="button"
                className="um_btn_primary"
                disabled={
                  !selectedTemplateId ||
                  selectedMemberRows.length === 0 ||
                  selectedRecipientEmails.length === 0 ||
                  sendMailSending
                }
                onClick={openSendMailConfirm}
              >
                <Send size={16} strokeWidth={2} aria-hidden />
                Send
              </button>
            </div>
          </div>

          {sendMailConfirmOpen ? (
            <div
              className="um_modal cp_company_members_send_mail_confirm_modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="org-members-send-mail-confirm-title"
              aria-describedby="org-members-send-mail-confirm-desc"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="um_modal_head">
                <h3
                  id="org-members-send-mail-confirm-title"
                  className="um_modal_title um_title_with_icon"
                >
                  <Send
                    className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_info"
                    size={22}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>Confirm send</span>
                </h3>
                <button
                  type="button"
                  className="um_modal_close"
                  aria-label="Close"
                  onClick={() => setSendMailConfirmOpen(false)}
                  disabled={sendMailSending}
                >
                  <X size={20} strokeWidth={2} aria-hidden />
                </button>
              </div>
              <p
                id="org-members-send-mail-confirm-desc"
                className="contacts_suspend_modal_desc contacts_suspend_modal_desc_info"
              >
                <Info
                  className="contacts_suspend_modal_desc_icon"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>
                  Send the <strong>{selectedTemplate?.name ?? "selected"}</strong>{" "}
                  template to <strong>{selectedRecipientEmails.length}</strong>{" "}
                  recipient
                  {selectedRecipientEmails.length === 1 ? "" : "s"} at{" "}
                  <strong>{titleCompany}</strong>? This action delivers email from
                  the portal and cannot be undone.
                </span>
              </p>
              <div className="um_modal_actions contacts_suspend_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={() => setSendMailConfirmOpen(false)}
                  disabled={sendMailSending}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Go back
                </button>
                <button
                  type="button"
                  className="um_btn_primary"
                  disabled={sendMailSending}
                  onClick={() => void handleSendMailToSelectedMembers()}
                >
                  <Send size={16} strokeWidth={2} aria-hidden />
                  {sendMailSending ? "Sending…" : "Confirm send"}
                </button>
              </div>
            </div>
          ) : null}
        </div>,
            document.body,
          )
        : null}

      <SendMailEmailPreviewModal
        preview={sendMailEmailPreview}
        onClose={() => setSendMailEmailPreview(null)}
        onSaved={handleSendMailPreviewSaved}
      />

      {editRow ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal um_modal_view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-members-edit-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-members-edit-title" className="um_modal_title">
                Edit member
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={editSaving}
                onClick={() => closeEditMember()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="um_view_grid um_view_grid_member_action">
              <ViewReadonlyField
                Icon={User}
                label="User name"
                value={formatMemberUsername(editRow.username)}
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(editRow.email)}
              />
            </div>
            <form onSubmit={submitEditMember}>
              <div className="um_edit_role_status_row">
                <div className="um_field">
                  <label
                    htmlFor="cp-members-edit-role"
                    className="um_field_label_row"
                  >
                    <UserCog className="um_field_label_icon" size={17} aria-hidden />
                    <span>Role</span>
                  </label>
                  <select
                    id="cp-members-edit-role"
                    className="um_field_select"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    required
                    disabled={editSaving}
                  >
                    {PLATFORM_INVITE_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="um_field">
                  <label
                    htmlFor="cp-members-edit-status"
                    className="um_field_label_row"
                  >
                    <Activity className="um_field_label_icon" size={17} aria-hidden />
                    <span>User Status</span>
                  </label>
                  <select
                    id="cp-members-edit-status"
                    className="um_field_select"
                    value={editUserStatus}
                    onChange={(e) => setEditUserStatus(e.target.value)}
                    required
                    disabled={editSaving}
                  >
                    {MEMBER_STATUS_EDIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="um_field">
                <label
                  htmlFor="cp-members-edit-reason"
                  className="um_field_label_row"
                >
                  <ClipboardList
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span>Reason</span>
                </label>
                <textarea
                  id="cp-members-edit-reason"
                  className="um_field_textarea"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                  required
                  disabled={editSaving}
                  aria-required
                />
              </div>
              {editErr ? (
                <p className="um_msg_error um_modal_form_error" role="alert">
                  {editErr}
                </p>
              ) : null}
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  disabled={editSaving}
                  onClick={() => closeEditMember()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={editSaving || !editReason.trim()}
                >
                  <RefreshCw size={16} strokeWidth={2} aria-hidden />
                  {editSaving ? "Updating…" : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {suspendRow ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal um_modal_view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-members-suspend-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-members-suspend-title" className="um_modal_title">
                {memberRowIsInactive(suspendRow)
                  ? "Activate member"
                  : "Suspend member"}
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={suspendSaving}
                onClick={() => closeSuspendMember()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="um_view_grid um_view_grid_member_action">
              <ViewReadonlyField
                Icon={User}
                label="User name"
                value={formatMemberUsername(suspendRow.username)}
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(suspendRow.email)}
              />
            </div>
            <form onSubmit={submitSuspendMember}>
              <div className="um_field">
                <label
                  htmlFor="cp-members-suspend-reason"
                  className="um_field_label_row"
                >
                  {memberRowIsInactive(suspendRow) ? (
                    <CheckCircle2
                      className="um_field_label_icon"
                      size={17}
                      aria-hidden
                    />
                  ) : (
                    <Ban className="um_field_label_icon" size={17} aria-hidden />
                  )}
                  <span>Reason</span>
                </label>
                <textarea
                  id="cp-members-suspend-reason"
                  className="um_field_textarea"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                  required
                  disabled={suspendSaving}
                  aria-required
                />
              </div>
              {suspendErr ? (
                <p className="um_msg_error um_modal_form_error" role="alert">
                  {suspendErr}
                </p>
              ) : null}
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  disabled={suspendSaving}
                  onClick={() => closeSuspendMember()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={suspendSaving || !suspendReason.trim()}
                >
                  {memberRowIsInactive(suspendRow) ? (
                    <CheckCircle2 size={16} aria-hidden />
                  ) : (
                    <Ban size={16} aria-hidden />
                  )}
                  {suspendSaving
                    ? memberRowIsInactive(suspendRow)
                      ? "Activating…"
                      : "Suspending…"
                    : memberRowIsInactive(suspendRow)
                      ? "Activate"
                      : "Suspend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ExportMembersModal
        open={membersExportOpen}
        onClose={() => setMembersExportOpen(false)}
        members={members}
        organizationScope={organizationDisplayScope}
      />
    </div>
  )
}
