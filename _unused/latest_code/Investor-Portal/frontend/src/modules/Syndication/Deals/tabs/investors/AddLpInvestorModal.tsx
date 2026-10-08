import {
  Briefcase,
  IdCard,
  Loader2,
  Mail,
  Percent,
  Plus,
  Save,
  Tag,
  UserRound,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import {
  DropdownSelect,
  MODAL_DROPDOWN_SELECT_PROPS,
  type DropdownSelectSection,
} from "../../../../../common/components/dropdown-select"
import { toast } from "../../../../../common/components/Toast"
import { TabsScrollStrip } from "../../../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../../../common/utils/displayEmail"
import {
  lpInvestorValidationPreferSelector,
  presentFormValidationError,
} from "../../../../../common/utils/formValidationFocus"
import { AddContactPanel } from "../../../contacts/components/AddContactPanel"
import { createContact, fetchContacts } from "../../../contacts/api/contactsApi"
import type { ContactRow } from "../../../contacts/types/contact.types"
import {
  fetchDealInvestorClasses,
  fetchDealLpInvestorForEdit,
  fetchUsersForMemberSelect,
  postDealLpInvestor,
  putDealLpInvestor,
} from "../../api/dealsApi"
import { getApiV1Base } from "../../../../../common/utils/apiBaseUrl"
import type { AddInvestmentFormValues } from "../deal_members/add-investment/add_deal_member_types"
import { loadAddMemberDraft } from "../deal_members/add-investment/addMemberFormDraftStorage"
import {
  buildContactRosterDropdownOption,
  buildDirectoryMemberRosterDropdownOption,
  INVESTOR_ALREADY_ON_DEAL_MESSAGE,
  isContactAlreadyOnDealRoster,
  type RosterRowForDuplicateCheck,
} from "../deal_members/add-investment/dealRosterContactDuplicate"
import {
  ensureSelectedMemberDropdownOption,
  resolveInvestorMemberSelectValue,
  selectedInvestorDropdownLabel,
} from "../deal_members/add-investment/resolveInvestorMemberSelectValue"
import { MEMBER_SELECT_OPTIONS } from "../../constants/member-options"
import {
  INVESTOR_PROFILE_SELECT_OPTIONS,
  investorProfileIdFromLabel,
  isLpInvestorRole,
  LP_INVESTOR_ROLE_VALUE,
  LP_INVESTORS_ROLE_LABEL,
} from "../../constants/investor-profile"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"
import {
  formatDealInvestorClassOptionLabel,
  isGpInvestorClass,
} from "../../utils/investorClassOverviewFields"
import {
  formatPercentTypeInputBare,
  sanitizePercentTypingInput,
} from "../../utils/offeringMoneyFormat"
import { rowDisplayName } from "../../../usermanagement/memberAdminShared"
import { InfoIconPanel } from "../offering_details/FieldInfoHeading"
import { YesNoCardRadioGroup } from "../../../../../common/components/YesNoCardRadioGroup/YesNoCardRadioGroup"
import "../../../contacts/contacts.css"
import "../../../usermanagement/user_management.css"
import "../../components/deal-step-form.css"
import "../../deal-investors-tab.css"
import "../deal_members/add-investment/add_deal_modal.css"

const INVESTOR_CLASS_UNAVAILABLE_HINT =
  "Please complete the Classes section to assign an investor class."

type InvestorEditSectionTab = "investor" | "profile" | "investment"

const INVESTOR_EDIT_SECTION_TABS: Array<{
  id: InvestorEditSectionTab
  label: string
  Icon: LucideIcon
}> = [
  { id: "investor", label: "Investor", Icon: UserRound },
  { id: "profile", label: "Profile", Icon: IdCard },
  { id: "investment", label: "Investment", Icon: Briefcase },
]

const INVITATION_EMAILS_UNAVAILABLE_HINT =
  "Invitation emails are unavailable while required deal details are incomplete. Complete the deal details before sending invitations. You can still choose No below."

const PREFIX_CONTACT = "contact:"
const PREFIX_USER = "user:"

const DROPDOWN_TRIGGER_PILL =
  "um_field_select deals_add_inv_field_control deals_add_inv_field_pill"

type LpInvestorFieldErrors = {
  contactId?: string
  profileId?: string
  investorClass?: string
  percentOfClassOwnership?: string
  percentOfClassDistributions?: string
}

function RequiredMark() {
  return (
    <span className="contacts_required" aria-hidden>
      {" "}
      *
    </span>
  )
}

function firstLpInvestorFieldErrorMessage(
  errors: LpInvestorFieldErrors,
): string {
  return (
    errors.contactId ??
    errors.investorClass ??
    errors.percentOfClassOwnership ??
    errors.percentOfClassDistributions ??
    errors.profileId ??
    ""
  )
}

function stripPctDigits(raw: string): string {
  return sanitizePercentTypingInput(raw)
}

function blurFormatPercentClamped(raw: string): string {
  const t = stripPctDigits(raw)
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return Math.max(0, Math.min(100, n)).toFixed(2)
}

function toPercentInputValue(raw: string | undefined | null): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""
  return blurFormatPercentClamped(t)
}

function percentValuesEqual(a: string, b: string): boolean {
  const ta = stripPctDigits(a)
  const tb = stripPctDigits(b)
  if (!ta && !tb) return true
  if (!ta || !tb) return false
  const na = parseFloat(ta)
  const nb = parseFloat(tb)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return ta === tb
}

function validateLpInvestorForm(input: {
  contactId: string
  profileId: string
  investorClassId: string
  sendInvitationMail: "yes" | "no"
  dealClasses: DealInvestorClass[]
  dealBlocksInvitationEmails: boolean
  selectedContactAlreadyOnDeal: boolean
}): LpInvestorFieldErrors {
  const errors: LpInvestorFieldErrors = {}
  if (!input.contactId.trim()) {
    errors.contactId = "Select an investor."
  } else if (input.selectedContactAlreadyOnDeal) {
    errors.contactId = INVESTOR_ALREADY_ON_DEAL_MESSAGE
  }
  if (input.dealClasses.length === 0) {
    errors.investorClass =
      "Add at least one investor class in Offering Details before adding an LP investor."
  } else {
    const classId = input.investorClassId.trim()
    if (!classId) {
      errors.investorClass = "Select an investor class."
    } else if (!input.dealClasses.some((c) => c.id === classId)) {
      errors.investorClass = "Select a valid investor class from this deal."
    }
  }
  if (
    !input.dealBlocksInvitationEmails &&
    input.sendInvitationMail === "yes" &&
    !input.profileId.trim()
  ) {
    errors.profileId =
      "Select an investor profile before choosing to send the invitation email."
  }
  return errors
}

function lpRosterStorageKey(dealId: string): string {
  const safe = dealId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)
  return `portal_lp_roster_id_${safe}`
}

function loadLpRosterId(dealId: string): string | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(lpRosterStorageKey(dealId))
    if (!raw?.trim()) return null
    const p = JSON.parse(raw) as { lpInvestorId?: string }
    const id = p.lpInvestorId?.trim()
    return id || null
  } catch {
    return null
  }
}

function saveLpRosterId(dealId: string, lpInvestorId: string): void {
  try {
    sessionStorage.setItem(
      lpRosterStorageKey(dealId),
      JSON.stringify({ lpInvestorId }),
    )
  } catch {
    /* ignore */
  }
}

function clearLpRosterId(dealId: string): void {
  try {
    sessionStorage.removeItem(lpRosterStorageKey(dealId))
  } catch {
    /* ignore */
  }
}

function lpInvestorRowMissingMessage(message: string | undefined): boolean {
  return /lp investor row not found/i.test(String(message ?? ""))
}

function contactOptionLabel(c: ContactRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
  if (name && isDisplayableEmail(c.email)) return `${name} — ${displayEmail(c.email)}`
  if (isDisplayableEmail(c.email)) return displayEmail(c.email)
  return name || "Contact"
}

function buildMemberLabel(u: Record<string, unknown>): string {
  const name = rowDisplayName(u)
  const email = String(u.email ?? "").trim()
  if (name && name !== "—" && isDisplayableEmail(email))
    return `${name} — ${displayEmail(email)}`
  if (isDisplayableEmail(email)) return displayEmail(email)
  return name !== "—" ? name : "—"
}

function memberOptionFromUser(
  u: Record<string, unknown>,
): { value: string; label: string } | null {
  const id = String(u.id ?? "").trim()
  if (!id) return null
  const label = buildMemberLabel(u)
  if (label === "—" || label === id) {
    const email = String(u.email ?? "").trim()
    const un = String(u.username ?? "").trim()
    const fallback = email || un || "Member"
    return { value: id, label: fallback }
  }
  return { value: id, label }
}

export interface AddLpInvestorModalProps {
  dealId: string
  open: boolean
  onClose: () => void
  /** After explicit Save (closes modal via parent). */
  onSaved: () => void
  /** Debounced autosave only — refresh list without closing the modal. */
  onListRefresh?: () => void | Promise<void>
  /** Same chrome as add — edit an existing `deal_lp_investor` row from the Investors table. */
  mode?: "add" | "edit"
  editRow?: DealInvestorRow | null
  /** When required deal details are incomplete, block invitation toggles. */
  dealBlocksInvitationEmails?: boolean
  /**
   * Investors tab “Continue editing” on the session draft row: restore contact + optional
   * autosaved LP id from `portal_add_member_*` draft (same storage as the full add modal).
   */
  resumeAddMemberDraft?: boolean
  /** Current Investors tab rows — used to block duplicate adds and mark dropdown options. */
  existingInvestorRows?: DealInvestorRow[]
}

function resolveLpInvestorClassId(
  row: DealInvestorRow | null | undefined,
  dealClasses: DealInvestorClass[],
): string {
  if (dealClasses.length === 0) return ""
  if (!row) return dealClasses[0]?.id?.trim() ?? ""
  const raw = row.investorClass?.trim()
  if (!raw || raw === "—") return dealClasses[0]?.id?.trim() ?? ""
  const byId = dealClasses.find((c) => c.id === raw)
  if (byId) return byId.id
  const byName = dealClasses.find(
    (c) => c.name.trim().toLowerCase() === raw.toLowerCase(),
  )
  return byName?.id ?? dealClasses[0]?.id?.trim() ?? ""
}

export function AddLpInvestorModal({
  dealId,
  open,
  onClose,
  onSaved,
  onListRefresh,
  mode = "add",
  editRow = null,
  dealBlocksInvitationEmails = false,
  resumeAddMemberDraft = false,
  existingInvestorRows = [],
}: AddLpInvestorModalProps) {
  const isEditMode = mode === "edit" && editRow != null
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [contactId, setContactId] = useState("")
  const [contactDisplayName, setContactDisplayName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [profileId, setProfileId] = useState("")
  const [sendInvitationMail, setSendInvitationMail] = useState<"yes" | "no">(
    "yes",
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectionTab, setSectionTab] =
    useState<InvestorEditSectionTab>("investor")
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<
    Partial<Record<InvestorEditSectionTab, HTMLElement | null>>
  >({})
  const ignoreScrollSpyUntilRef = useRef(0)
  const [fieldErrors, setFieldErrors] = useState<LpInvestorFieldErrors>({})
  const [memberRows, setMemberRows] = useState<Record<string, unknown>[]>([])
  const [contactRows, setContactRows] = useState<ContactRow[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [addContactModalOpen, setAddContactModalOpen] = useState(false)
  const [dealClasses, setDealClasses] = useState<DealInvestorClass[]>([])
  const [investorClassId, setInvestorClassId] = useState("")
  const [percentOfClassOwnership, setPercentOfClassOwnership] = useState("")
  const [percentOfClassDistributions, setPercentOfClassDistributions] =
    useState("")
  const [entityOwnershipPercent, setEntityOwnershipPercent] = useState("")
  const [distributionAllocationPercent, setDistributionAllocationPercent] =
    useState("")
  const [backendLpRosterId, setBackendLpRosterId] = useState<string | null>(null)
  const backendLpRosterIdRef = useRef<string | null>(null)
  const lpAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const investorRosterForGate = useMemo((): RosterRowForDuplicateCheck[] => {
    return existingInvestorRows.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      userEmail: r.userEmail,
    }))
  }, [existingInvestorRows])

  const excludeRowIdForDuplicateGate = useMemo(() => {
    if (isEditMode && editRow?.id) return editRow.id.trim()
    const lp = backendLpRosterId?.trim() || loadLpRosterId(dealId)?.trim()
    return lp || null
  }, [isEditMode, editRow?.id, backendLpRosterId, dealId])

  const selectedContactAlreadyOnDeal = useMemo(
    () =>
      !isEditMode &&
      Boolean(contactId.trim()) &&
      isContactAlreadyOnDealRoster(
        investorRosterForGate,
        contactId.trim(),
        contactEmail,
        excludeRowIdForDuplicateGate,
      ),
    [
      isEditMode,
      contactId,
      contactEmail,
      investorRosterForGate,
      excludeRowIdForDuplicateGate,
    ],
  )
  const lpPostInFlightRef = useRef(false)
  const lpAutosaveInFlightRef = useRef(false)

  const profileRequiredForInvite =
    !dealBlocksInvitationEmails && sendInvitationMail === "yes"

  const clearFieldError = useCallback(
    (key: keyof LpInvestorFieldErrors) => {
      setFieldErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMembersLoading(true)
    void (async () => {
      const [users, contacts, classes] = await Promise.all([
        fetchUsersForMemberSelect(),
        fetchContacts(),
        fetchDealInvestorClasses(dealId),
      ])
      if (cancelled) return
      setMemberRows(users)
      setContactRows(contacts)
      setDealClasses(classes.filter((c) => !isGpInvestorClass(c)))
      setMembersLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, dealId])

  useEffect(() => {
    if (!open) setAddContactModalOpen(false)
  }, [open])

  const syncActiveTabFromScroll = useCallback(() => {
    if (Date.now() < ignoreScrollSpyUntilRef.current) return
    const root = scrollRef.current
    if (!root) return

    const rootTop = root.getBoundingClientRect().top
    const marker = rootTop + Math.min(72, root.clientHeight * 0.25)
    let active: InvestorEditSectionTab = "investor"

    for (const { id } of INVESTOR_EDIT_SECTION_TABS) {
      const section = sectionRefs.current[id]
      if (!section) continue
      if (section.getBoundingClientRect().top <= marker) active = id
    }

    setSectionTab((prev) => (prev === active ? prev : active))
  }, [])

  const scrollToSection = useCallback((id: InvestorEditSectionTab) => {
    const root = scrollRef.current
    const section = sectionRefs.current[id]
    if (!root || !section) return
    setSectionTab(id)
    ignoreScrollSpyUntilRef.current = Date.now() + 600
    const nextTop =
      root.scrollTop +
      (section.getBoundingClientRect().top - root.getBoundingClientRect().top)
    root.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
  }, [])

  useEffect(() => {
    if (!open) return
    ignoreScrollSpyUntilRef.current = 0
    const root = scrollRef.current
    if (!root) return
    root.scrollTop = 0
    syncActiveTabFromScroll()
    root.addEventListener("scroll", syncActiveTabFromScroll, { passive: true })
    return () => root.removeEventListener("scroll", syncActiveTabFromScroll)
  }, [open, syncActiveTabFromScroll])

  const investorClassOptions = useMemo(
    () =>
      dealClasses.map((c) => ({
        value: c.id,
        label: formatDealInvestorClassOptionLabel(c),
      })),
    [dealClasses],
  )

  const noDealClasses = dealClasses.length === 0

  useEffect(() => {
    if (!open) {
      setContactId("")
      setContactDisplayName("")
      setContactEmail("")
      setProfileId("")
      setInvestorClassId("")
      setPercentOfClassOwnership("")
      setPercentOfClassDistributions("")
      setEntityOwnershipPercent("")
      setDistributionAllocationPercent("")
      setSendInvitationMail("yes")
      setError(null)
      setFieldErrors({})
      setSectionTab("investor")
      setBackendLpRosterId(null)
      backendLpRosterIdRef.current = null
      return
    }
    setSectionTab("investor")
    if (isEditMode && editRow) {
      let cancelled = false
      setError(null)
      setFieldErrors({})
      /** Prefill from list row immediately, then overwrite with DB fetch. */
      setContactId(editRow.contactId?.trim() ?? "")
      setContactDisplayName(editRow.displayName?.trim() ?? "")
      setContactEmail(
        isDisplayableEmail(editRow.userEmail)
          ? String(editRow.userEmail).trim()
          : "",
      )
      setProfileId(
        editRow.profileId?.trim() ||
          investorProfileIdFromLabel(editRow.entitySubtitle ?? "") ||
          "",
      )
      setSendInvitationMail("no")
      setInvestorClassId(resolveLpInvestorClassId(editRow, dealClasses))
      setPercentOfClassOwnership(
        toPercentInputValue(editRow.percentOfClassOwnership),
      )
      setPercentOfClassDistributions(
        toPercentInputValue(editRow.percentOfClassDistributions),
      )
      setEntityOwnershipPercent(
        toPercentInputValue(editRow.entityOwnershipPercent),
      )
      setDistributionAllocationPercent(
        toPercentInputValue(editRow.distributionAllocationPercent),
      )
      setBackendLpRosterId(editRow.id)
      backendLpRosterIdRef.current = editRow.id

      void (async () => {
        const fetched = await fetchDealLpInvestorForEdit(dealId, {
          id: editRow.id,
          contactId: editRow.contactId,
        })
        if (cancelled || !fetched) return
        setContactId(fetched.contactId?.trim() ?? "")
        setContactDisplayName(fetched.displayName?.trim() ?? "")
        setContactEmail(
          isDisplayableEmail(fetched.userEmail)
            ? String(fetched.userEmail).trim()
            : "",
        )
        setProfileId(
          fetched.profileId?.trim() ||
            investorProfileIdFromLabel(fetched.entitySubtitle ?? "") ||
            "",
        )
        setInvestorClassId(resolveLpInvestorClassId(fetched, dealClasses))
        setPercentOfClassOwnership(
          toPercentInputValue(fetched.percentOfClassOwnership),
        )
        setPercentOfClassDistributions(
          toPercentInputValue(fetched.percentOfClassDistributions),
        )
        setEntityOwnershipPercent(
          toPercentInputValue(fetched.entityOwnershipPercent),
        )
        setDistributionAllocationPercent(
          toPercentInputValue(fetched.distributionAllocationPercent),
        )
        setBackendLpRosterId(fetched.id)
        backendLpRosterIdRef.current = fetched.id
      })()

      return () => {
        cancelled = true
      }
    }
    if (resumeAddMemberDraft) {
      const draft = loadAddMemberDraft(dealId)
      const f = draft?.form
      if (
        f &&
        isLpInvestorRole(f.investorRole ?? "") &&
        f.contactId?.trim()
      ) {
        setContactId(f.contactId.trim())
        setContactDisplayName(f.contactDisplayName?.trim() ?? "")
        setContactEmail(f.contactEmail?.trim() ?? "")
        if (!dealBlocksInvitationEmails && f.sendInvitationMail === "yes")
          setSendInvitationMail("yes")
        else setSendInvitationMail("no")
        setProfileId(String(f.profileId ?? "").trim())
        const draftClassRaw = String(f.investorClass ?? "").trim()
        if (draftClassRaw && dealClasses.some((c) => c.id === draftClassRaw)) {
          setInvestorClassId(draftClassRaw)
        } else if (draftClassRaw) {
          const byName = dealClasses.find(
            (c) =>
              c.name.trim().toLowerCase() === draftClassRaw.toLowerCase(),
          )
          setInvestorClassId(byName?.id ?? dealClasses[0]?.id ?? "")
        } else {
          setInvestorClassId(dealClasses[0]?.id ?? "")
        }
        setError(null)
        setFieldErrors({})
        setPercentOfClassOwnership(
          toPercentInputValue(f.percentOfClassOwnership),
        )
        setPercentOfClassDistributions(
          toPercentInputValue(f.percentOfClassDistributions),
        )
        setEntityOwnershipPercent(
          toPercentInputValue(f.entityOwnershipPercent),
        )
        setDistributionAllocationPercent(
          toPercentInputValue(f.distributionAllocationPercent),
        )
        /** Only `deal_lp_investor` ids — never `backendInvestmentId` (different table / PUT route). */
        const bid = draft?.backendLpInvestorId?.trim()
        if (bid) {
          setBackendLpRosterId(bid)
          backendLpRosterIdRef.current = bid
          saveLpRosterId(dealId, bid)
        } else {
          clearLpRosterId(dealId)
          setBackendLpRosterId(null)
          backendLpRosterIdRef.current = null
        }
        return
      }
    }
    setContactId("")
    setContactDisplayName("")
    setContactEmail("")
    setProfileId("")
    setInvestorClassId(dealClasses[0]?.id ?? "")
    setPercentOfClassOwnership("")
    setPercentOfClassDistributions("")
    setEntityOwnershipPercent("")
    setDistributionAllocationPercent("")
    setSendInvitationMail(dealBlocksInvitationEmails ? "no" : "yes")
    setError(null)
    setFieldErrors({})
    const stored = loadLpRosterId(dealId)
    if (stored) {
      setBackendLpRosterId(stored)
      backendLpRosterIdRef.current = stored
    } else {
      setBackendLpRosterId(null)
      backendLpRosterIdRef.current = null
    }
  }, [
    open,
    dealId,
    isEditMode,
    editRow,
    resumeAddMemberDraft,
    dealBlocksInvitationEmails,
    dealClasses,
  ])

  useEffect(() => {
    if (!open || dealClasses.length === 0) return
    if (isEditMode && editRow) {
      const resolved = resolveLpInvestorClassId(editRow, dealClasses)
      setInvestorClassId((prev) => {
        if (prev && dealClasses.some((c) => c.id === prev)) return prev
        return resolved
      })
      return
    }
    setInvestorClassId((prev) => {
      if (prev && dealClasses.some((c) => c.id === prev)) return prev
      return dealClasses[0]?.id ?? ""
    })
  }, [open, isEditMode, editRow, dealClasses])

  const patchMemberById = useCallback(
    (raw: string) => {
      if (!raw) {
        setContactId("")
        setContactDisplayName("")
        setContactEmail("")
        setError(null)
        clearFieldError("contactId")
        return
      }
      if (raw.startsWith(PREFIX_CONTACT)) {
        const id = raw.slice(PREFIX_CONTACT.length)
        const c = contactRows.find((x) => x.id === id)
        if (c) {
          const email = c.email.trim()
          if (
            !isEditMode &&
            isContactAlreadyOnDealRoster(
              investorRosterForGate,
              id,
              email,
              excludeRowIdForDuplicateGate,
            )
          ) {
            setFieldErrors({ contactId: INVESTOR_ALREADY_ON_DEAL_MESSAGE })
            toast.error("Investor already on this deal", INVESTOR_ALREADY_ON_DEAL_MESSAGE)
            return
          }
          const display = contactOptionLabel(c)
          setContactId(id)
          setContactDisplayName(display.split(" — ")[0]?.trim() || display)
          setContactEmail(email)
          setError(null)
          clearFieldError("contactId")
        }
        return
      }
      const userId = raw.startsWith(PREFIX_USER)
        ? raw.slice(PREFIX_USER.length)
        : raw
      const u = memberRows.find((x) => String(x.id) === userId)
      if (u) {
        const email = String(u.email ?? "").trim()
        if (
          !isEditMode &&
          isContactAlreadyOnDealRoster(
            investorRosterForGate,
            userId,
            email,
            excludeRowIdForDuplicateGate,
          )
        ) {
          setFieldErrors({ contactId: INVESTOR_ALREADY_ON_DEAL_MESSAGE })
          toast.error("Investor already on this deal", INVESTOR_ALREADY_ON_DEAL_MESSAGE)
          return
        }
        const display =
          rowDisplayName(u) !== "—"
            ? rowDisplayName(u)
            : email || "—"
        setContactId(userId)
        setContactDisplayName(display)
        setContactEmail(email)
        setError(null)
        clearFieldError("contactId")
        return
      }
      const fallbackOpt = MEMBER_SELECT_OPTIONS.find((o) => o.value === userId)
      if (fallbackOpt?.value) {
        const parts = fallbackOpt.label.split(" — ")
        const email = parts[1]?.trim() ?? ""
        if (
          !isEditMode &&
          isContactAlreadyOnDealRoster(
            investorRosterForGate,
            userId,
            email,
            excludeRowIdForDuplicateGate,
          )
        ) {
          setFieldErrors({ contactId: INVESTOR_ALREADY_ON_DEAL_MESSAGE })
          toast.error("Investor already on this deal", INVESTOR_ALREADY_ON_DEAL_MESSAGE)
          return
        }
        setContactId(userId)
        setContactDisplayName(parts[0]?.trim() || userId)
        setContactEmail(email)
        setError(null)
        clearFieldError("contactId")
        return
      }
      setContactId(userId)
      setContactDisplayName("")
      setContactEmail("")
      setError(null)
      clearFieldError("contactId")
    },
    [
      contactRows,
      memberRows,
      isEditMode,
      investorRosterForGate,
      excludeRowIdForDuplicateGate,
      clearFieldError,
    ],
  )

  const memberSelectValue = useMemo(
    () =>
      resolveInvestorMemberSelectValue({
        contactId,
        contactEmail,
        contactRows,
        memberRows,
        prefixContact: PREFIX_CONTACT,
        prefixUser: PREFIX_USER,
      }),
    [contactId, contactEmail, contactRows, memberRows],
  )

  const memberDropdownSections = useMemo((): DropdownSelectSection[] => {
    function isAlreadyOnInvestorsList(
      contactOrUserId: string,
      email: string,
    ): boolean {
      return isContactAlreadyOnDealRoster(
        investorRosterForGate,
        contactOrUserId,
        email,
        excludeRowIdForDuplicateGate,
      )
    }

    const sections: DropdownSelectSection[] = []
    if (contactRows.length > 0) {
      sections.push({
        heading: "Contacts",
        options: contactRows.map((c) => {
          const value = `${PREFIX_CONTACT}${c.id}`
          const baseLabel = contactOptionLabel(c)
          const onDeal = isAlreadyOnInvestorsList(c.id, c.email ?? "")
          const meta = buildContactRosterDropdownOption(baseLabel, c, onDeal)
          return {
            value,
            label: baseLabel,
            disabled: meta.disabled,
            labelContent: meta.labelContent,
          }
        }),
      })
    }
    if (memberRows.length > 0) {
      sections.push({
        heading: "Directory members",
        options: memberRows
          .map((u) => memberOptionFromUser(u))
          .filter((o): o is { value: string; label: string } => Boolean(o))
          .map((o) => {
            const value = `${PREFIX_USER}${o.value}`
            const dirRow = memberRows.find((x) => String(x.id) === o.value)
            const email = dirRow ? String(dirRow.email ?? "").trim() : ""
            const onDeal = isAlreadyOnInvestorsList(o.value, email)
            const meta = buildDirectoryMemberRosterDropdownOption(
              o.label,
              dirRow ?? {},
              onDeal,
            )
            return {
              value,
              label: o.label,
              disabled: meta.disabled,
              labelContent: meta.labelContent,
            }
          }),
      })
    }
    return ensureSelectedMemberDropdownOption({
      sections,
      value: memberSelectValue,
      fallbackLabel: selectedInvestorDropdownLabel({
        displayName: contactDisplayName,
        email: contactEmail,
      }),
    })
  }, [
    contactRows,
    memberRows,
    investorRosterForGate,
    excludeRowIdForDuplicateGate,
    memberSelectValue,
    contactDisplayName,
    contactEmail,
  ])

  /** When lists load after edit open, resolve id by email and fill email on the trigger. */
  useEffect(() => {
    if (!contactId.trim()) return
    if (contactRows.length === 0 && memberRows.length === 0) return
    const resolved = resolveInvestorMemberSelectValue({
      contactId,
      contactEmail,
      contactRows,
      memberRows,
      prefixContact: PREFIX_CONTACT,
      prefixUser: PREFIX_USER,
    })
    if (!resolved) return

    let nextId = ""
    let nextEmail = contactEmail.trim()
    let nextName = contactDisplayName.trim()
    if (resolved.startsWith(PREFIX_CONTACT)) {
      nextId = resolved.slice(PREFIX_CONTACT.length).trim()
      const c = contactRows.find(
        (row) =>
          String(row.id).trim().toLowerCase() === nextId.toLowerCase(),
      )
      if (c) {
        if (!nextEmail && isDisplayableEmail(c.email))
          nextEmail = String(c.email).trim()
        if (!nextName || nextName === "—") {
          const label = contactOptionLabel(c)
          nextName = label.split(" — ")[0]?.trim() || label
        }
      }
    } else if (resolved.startsWith(PREFIX_USER)) {
      nextId = resolved.slice(PREFIX_USER.length).trim()
      const u = memberRows.find(
        (row) =>
          String(row.id ?? "")
            .trim()
            .toLowerCase() === nextId.toLowerCase(),
      )
      if (u) {
        const em = String(u.email ?? "").trim()
        if (!nextEmail && isDisplayableEmail(em)) nextEmail = em
        if (!nextName || nextName === "—") {
          const label = buildMemberLabel(u)
          nextName = label.split(" — ")[0]?.trim() || label
        }
      }
    }

    if (nextId && nextId !== contactId) setContactId(nextId)
    if (nextEmail && nextEmail !== contactEmail) setContactEmail(nextEmail)
    if (nextName && nextName !== contactDisplayName)
      setContactDisplayName(nextName)
  }, [
    contactId,
    contactEmail,
    contactDisplayName,
    contactRows,
    memberRows,
  ])

  const handleContactCreated = useCallback((contact: ContactRow) => {
    setContactRows((prev) => {
      if (prev.some((c) => c.id === contact.id)) return prev
      return [...prev, contact]
    })
    const display = contactOptionLabel(contact)
    const namePart = display.split(" — ")[0]?.trim() || display
    setContactId(contact.id)
    setContactDisplayName(namePart)
    setContactEmail(contact.email.trim())
    clearFieldError("contactId")
    toast.success(
      "Contact added",
      `${namePart} is selected as the investor for this deal.`,
    )
  }, [clearFieldError])

  const handleAddContactSave = useCallback(
    async (contact: Omit<ContactRow, "id" | "createdByDisplayName">) => {
      const created = await createContact(contact)
      handleContactCreated(created)
    },
    [handleContactCreated],
  )

  backendLpRosterIdRef.current = backendLpRosterId

  useEffect(() => {
    if (!getApiV1Base()) return
    if (!open) return
    if (membersLoading) return
    if (dealClasses.length === 0) return
    const hasContent =
      contactId.trim().length > 0 || sendInvitationMail === "yes"
    if (!hasContent) return
    if (selectedContactAlreadyOnDeal) return

    if (lpAutosaveTimerRef.current)
      clearTimeout(lpAutosaveTimerRef.current)
    lpAutosaveTimerRef.current = setTimeout(() => {
      lpAutosaveTimerRef.current = null
      void (async () => {
        const classId = investorClassId.trim()
        if (!classId) return
        const values: AddInvestmentFormValues = {
          offeringId: "primary",
          contactId: contactId.trim(),
          contactDisplayName: contactDisplayName.trim(),
          contactEmail: contactEmail.trim() || undefined,
          profileId: profileId.trim(),
          investorRole: LP_INVESTOR_ROLE_VALUE,
          status: "",
          fundApproved: false,
          investorClass: classId,
          percentOfClassOwnership: percentOfClassOwnership.trim(),
          percentOfClassDistributions: percentOfClassDistributions.trim(),
          entityOwnershipPercent: entityOwnershipPercent.trim(),
          distributionAllocationPercent: distributionAllocationPercent.trim(),
          docSignedDate: "",
          commitmentAmount: "0",
          extraContributionAmounts: [],
          documentFileName: null,
          sendInvitationMail: dealBlocksInvitationEmails
            ? "no"
            : sendInvitationMail,
        }
        const rosterId = backendLpRosterIdRef.current
        if (lpAutosaveInFlightRef.current) return
        if (rosterId) {
          lpAutosaveInFlightRef.current = true
          try {
            let result = await putDealLpInvestor(dealId, rosterId, values, {
              autosave: true,
            })
            if (
              !result.ok &&
              !isEditMode &&
              lpInvestorRowMissingMessage(result.message)
            ) {
              clearLpRosterId(dealId)
              backendLpRosterIdRef.current = null
              setBackendLpRosterId(null)
              result = await postDealLpInvestor(dealId, values, {
                autosave: true,
              })
              if (result.ok && result.mode === "api" && result.lpInvestorId) {
                backendLpRosterIdRef.current = result.lpInvestorId
                setBackendLpRosterId(result.lpInvestorId)
                saveLpRosterId(dealId, result.lpInvestorId)
              }
            }
            if (result.ok && result.mode === "api") void onListRefresh?.()
          } finally {
            lpAutosaveInFlightRef.current = false
          }
          return
        }
        if (lpPostInFlightRef.current) return
        if (isEditMode) return
        lpPostInFlightRef.current = true
        lpAutosaveInFlightRef.current = true
        try {
          const result = await postDealLpInvestor(dealId, values, {
            autosave: true,
          })
          if (result.ok && result.mode === "api" && result.lpInvestorId) {
            backendLpRosterIdRef.current = result.lpInvestorId
            setBackendLpRosterId(result.lpInvestorId)
            saveLpRosterId(dealId, result.lpInvestorId)
          }
          if (result.ok && result.mode === "api") void onListRefresh?.()
        } finally {
          lpPostInFlightRef.current = false
          lpAutosaveInFlightRef.current = false
        }
      })()
    }, 1200)
    return () => {
      if (lpAutosaveTimerRef.current) {
        clearTimeout(lpAutosaveTimerRef.current)
        lpAutosaveTimerRef.current = null
      }
    }
  }, [
    open,
    dealId,
    dealClasses,
    contactId,
    contactDisplayName,
    contactEmail,
    sendInvitationMail,
    onListRefresh,
    investorClassId,
    isEditMode,
    dealBlocksInvitationEmails,
    profileId,
    selectedContactAlreadyOnDeal,
    membersLoading,
    contactRows,
    memberRows,
    percentOfClassOwnership,
    percentOfClassDistributions,
    entityOwnershipPercent,
    distributionAllocationPercent,
  ])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const validationErrors = validateLpInvestorForm({
      contactId,
      profileId,
      investorClassId,
      sendInvitationMail,
      dealClasses,
      dealBlocksInvitationEmails,
      selectedContactAlreadyOnDeal,
    })
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      if (validationErrors.contactId) scrollToSection("investor")
      else if (validationErrors.profileId) scrollToSection("profile")
      else scrollToSection("investment")
      const message = firstLpInvestorFieldErrorMessage(validationErrors)
      if (validationErrors.contactId && selectedContactAlreadyOnDeal) {
        toast.error("Investor already on this deal", INVESTOR_ALREADY_ON_DEAL_MESSAGE)
      } else if (
        validationErrors.contactId &&
        validationErrors.contactId !== "Select an investor."
      ) {
        toast.error("Cannot add investor", validationErrors.contactId)
      }
      requestAnimationFrame(() => {
        presentFormValidationError({
          container: formRef.current,
          message,
          preferSelector: lpInvestorValidationPreferSelector(message),
        })
      })
      return
    }
    setFieldErrors({})

    const classId = investorClassId.trim()

    const values: AddInvestmentFormValues = {
      offeringId: "primary",
      contactId: contactId.trim(),
      contactDisplayName: contactDisplayName.trim(),
      contactEmail: contactEmail.trim() || undefined,
      profileId: profileId.trim(),
      investorRole: LP_INVESTOR_ROLE_VALUE,
      status: "",
      fundApproved: false,
      investorClass: classId,
      percentOfClassOwnership: percentOfClassOwnership.trim(),
      percentOfClassDistributions: percentOfClassDistributions.trim(),
      entityOwnershipPercent: entityOwnershipPercent.trim(),
      distributionAllocationPercent: distributionAllocationPercent.trim(),
      docSignedDate: "",
      commitmentAmount: "0",
      extraContributionAmounts: [],
      documentFileName: null,
      sendInvitationMail: dealBlocksInvitationEmails ? "no" : sendInvitationMail,
    }

    setSubmitting(true)
    try {
      let existingId =
        backendLpRosterIdRef.current ?? loadLpRosterId(dealId)
      let result = existingId
        ? await putDealLpInvestor(dealId, existingId, values)
        : await postDealLpInvestor(dealId, values)
      if (
        !result.ok &&
        existingId &&
        !isEditMode &&
        lpInvestorRowMissingMessage(result.message)
      ) {
        clearLpRosterId(dealId)
        backendLpRosterIdRef.current = null
        setBackendLpRosterId(null)
        result = await postDealLpInvestor(dealId, values)
        existingId = ""
      }
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (!isEditMode) {
        clearLpRosterId(dealId)
        backendLpRosterIdRef.current = null
        setBackendLpRosterId(null)
      }
      onSaved()
      onClose()
    } catch {
      setError("Could not save. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <>
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
      role="presentation"
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_inv_investor_view_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head add_contact_modal_head">
          <h3 id={titleId} className="um_modal_title add_contact_modal_title">
            {isEditMode ? "Edit investor" : "Add Investors"}
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <form
          ref={formRef}
          className="deals_add_inv_modal_form deal_inv_view_form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="deals_add_inv_section_tabs_outer um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer deal_inv_view_section_tabs">
            <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
              <div
                className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row deals_add_inv_section_tabs_row"
                role="tablist"
                aria-label="Investor form sections"
              >
                {INVESTOR_EDIT_SECTION_TABS.map(({ id, label, Icon }) => {
                  const selected = sectionTab === id
                  return (
                    <button
                      key={id}
                      type="button"
                      id={`lp-inv-tab-${id}`}
                      role="tab"
                      aria-selected={selected}
                      aria-controls={`lp-inv-panel-${id}`}
                      className={`um_members_tab deals_tabs_tab um_segmented_tab${
                        selected ? " um_members_tab_active" : ""
                      }`}
                      onClick={() => scrollToSection(id)}
                    >
                      <Icon
                        className="deals_tabs_icon um_segmented_tab_icon"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="deals_tabs_label um_segmented_tab_label">
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </TabsScrollStrip>
          </div>

          <div
            ref={scrollRef}
            className="deals_add_inv_modal_scroll deal_inv_view_body"
          >
            {error ? (
              <p className="um_msg_error um_modal_form_error" role="alert">
                {error}
              </p>
            ) : null}

            <section
              ref={(el) => {
                sectionRefs.current.investor = el
              }}
              className="add_contact_section deal_inv_view_section"
              role="tabpanel"
              id="lp-inv-panel-investor"
              aria-labelledby="lp-inv-tab-investor"
            >
              <h3 className="deal_inv_view_section_label">Investor</h3>
              <div className="um_field">
                <label htmlFor="lp-inv-member" className="um_field_label_row">
                  <UserRound className="um_field_label_icon" size={17} aria-hidden />
                  <span>
                    Investors
                    <RequiredMark />
                  </span>
                </label>
                <DropdownSelect
                  {...MODAL_DROPDOWN_SELECT_PROPS}
                  id="lp-inv-member"
                  sections={memberDropdownSections}
                  value={memberSelectValue}
                  disabled={membersLoading}
                  invalid={Boolean(fieldErrors.contactId)}
                  onChange={(v) => patchMemberById(v)}
                  placeholder={
                    membersLoading
                      ? "Loading contacts and members…"
                      : "Select contact or member"
                  }
                  ariaLabel="Investor or contact"
                  ariaDescribedBy={
                    fieldErrors.contactId ? "lp-inv-member-err" : undefined
                  }
                  header={
                    isEditMode
                      ? undefined
                      : {
                          label: "+ Add Contact",
                          onClick: () => setAddContactModalOpen(true),
                        }
                  }
                  triggerClassName={DROPDOWN_TRIGGER_PILL}
                />
                {fieldErrors.contactId ? (
                  <p
                    id="lp-inv-member-err"
                    className="um_field_hint um_field_hint_error"
                    role="alert"
                  >
                    {fieldErrors.contactId}
                  </p>
                ) : null}
              </div>
            </section>

            <section
              ref={(el) => {
                sectionRefs.current.profile = el
              }}
              className="add_contact_section deal_inv_view_section"
              role="tabpanel"
              id="lp-inv-panel-profile"
              aria-labelledby="lp-inv-tab-profile"
            >
              <h3 className="deal_inv_view_section_label">Profile</h3>
              <div className="um_field">
                <label htmlFor="lp-inv-profile" className="um_field_label_row">
                  <IdCard className="um_field_label_icon" size={17} aria-hidden />
                  <span>
                    Profile
                    {profileRequiredForInvite ? <RequiredMark /> : null}
                  </span>
                </label>
                <DropdownSelect
                  {...MODAL_DROPDOWN_SELECT_PROPS}
                  id="lp-inv-profile"
                  options={INVESTOR_PROFILE_SELECT_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                  value={profileId}
                  invalid={Boolean(fieldErrors.profileId)}
                  onChange={(v) => {
                    setProfileId(v)
                    clearFieldError("profileId")
                  }}
                  placeholder="Select profile"
                  ariaLabel="Profile"
                  ariaDescribedBy={
                    fieldErrors.profileId
                      ? "lp-inv-profile-err"
                      : "lp-inv-profile-hint"
                  }
                  triggerClassName={DROPDOWN_TRIGGER_PILL}
                />
                <p
                  id="lp-inv-profile-hint"
                  className="deals_add_inv_section_hint"
                  role="note"
                >
                  Used for investor identity and invitation email context when you notify
                  them about being added to the deal.
                </p>
                {fieldErrors.profileId ? (
                  <p
                    id="lp-inv-profile-err"
                    className="um_field_hint um_field_hint_error"
                    role="alert"
                  >
                    {fieldErrors.profileId}
                  </p>
                ) : null}
              </div>
            </section>

            <section
              ref={(el) => {
                sectionRefs.current.investment = el
              }}
              className="add_contact_section deal_inv_view_section"
              role="tabpanel"
              id="lp-inv-panel-investment"
              aria-labelledby="lp-inv-tab-investment"
            >
              <h3 className="deal_inv_view_section_label">Investment</h3>
              <div className="um_field">
                <label htmlFor="lp-inv-role" className="um_field_label_row">
                  <Briefcase className="um_field_label_icon" size={17} aria-hidden />
                  <span>Role</span>
                </label>
                <input
                  id="lp-inv-role"
                  type="text"
                  readOnly
                  className="deals_add_inv_field_pill deals_lp_inv_role_readonly"
                  value={LP_INVESTORS_ROLE_LABEL}
                  aria-readonly="true"
                />
              </div>

              <div className="um_field">
                <label htmlFor="lp-inv-class" className="um_field_label_row">
                  <Tag className="um_field_label_icon" size={17} aria-hidden />
                  <span>
                    Investor class
                    <RequiredMark />
                  </span>
                  {noDealClasses ? (
                    <span className="deals_add_inv_label_info">
                      <InfoIconPanel
                        ariaLabel="More information: Investor class"
                        infoContent={INVESTOR_CLASS_UNAVAILABLE_HINT}
                      />
                    </span>
                  ) : null}
                </label>
                <DropdownSelect
                  {...MODAL_DROPDOWN_SELECT_PROPS}
                  id="lp-inv-class"
                  options={investorClassOptions}
                  value={investorClassId}
                  disabled={noDealClasses}
                  invalid={Boolean(fieldErrors.investorClass)}
                  onChange={(v) => {
                    setInvestorClassId(v)
                    clearFieldError("investorClass")
                  }}
                  placeholder="Select investor class"
                  ariaLabel="Investor class"
                  ariaDescribedBy={
                    fieldErrors.investorClass
                      ? "lp-inv-class-err"
                      : noDealClasses
                        ? "lp-inv-class-hint"
                        : undefined
                  }
                  triggerClassName={DROPDOWN_TRIGGER_PILL}
                />
                {noDealClasses ? (
                  <p id="lp-inv-class-hint" className="visually_hidden">
                    {INVESTOR_CLASS_UNAVAILABLE_HINT}
                  </p>
                ) : null}
                {fieldErrors.investorClass ? (
                  <p
                    id="lp-inv-class-err"
                    className="um_field_hint um_field_hint_error"
                    role="alert"
                  >
                    {fieldErrors.investorClass}
                  </p>
                ) : null}
              </div>

              {!noDealClasses ? (
                <div className="add_contact_name_grid">
                  <div className="um_field">
                    <label
                      htmlFor="lp-inv-pct-ownership"
                      className="um_field_label_row"
                    >
                      <span>
                        Percent of class (ownership)
                      </span>
                    </label>
                    <input
                      id="lp-inv-pct-ownership"
                      type="text"
                      className="deals_add_inv_field_pill"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={percentOfClassOwnership}
                      aria-invalid={
                        Boolean(fieldErrors.percentOfClassOwnership) ||
                        undefined
                      }
                      aria-describedBy={
                        fieldErrors.percentOfClassOwnership
                          ? "lp-inv-pct-ownership-err"
                          : undefined
                      }
                      onChange={(e) => {
                        const next = formatPercentTypeInputBare(e.target.value, 100)
                        const prevOwnership = percentOfClassOwnership
                        setPercentOfClassOwnership(next)
                        clearFieldError("percentOfClassOwnership")
                        if (
                          !stripPctDigits(percentOfClassDistributions) ||
                          percentValuesEqual(
                            percentOfClassDistributions,
                            prevOwnership,
                          )
                        ) {
                          setPercentOfClassDistributions(next)
                          clearFieldError("percentOfClassDistributions")
                        }
                      }}
                      onBlur={(e) => {
                        const next = blurFormatPercentClamped(e.target.value)
                        const prevOwnership = percentOfClassOwnership
                        setPercentOfClassOwnership(next)
                        if (
                          !stripPctDigits(percentOfClassDistributions) ||
                          percentValuesEqual(
                            percentOfClassDistributions,
                            prevOwnership,
                          )
                        ) {
                          setPercentOfClassDistributions(next)
                        }
                      }}
                    />
                    {fieldErrors.percentOfClassOwnership ? (
                      <p
                        id="lp-inv-pct-ownership-err"
                        className="um_field_hint um_field_hint_error"
                        role="alert"
                      >
                        {fieldErrors.percentOfClassOwnership}
                      </p>
                    ) : null}
                  </div>

                  <div className="um_field">
                    <label
                      htmlFor="lp-inv-pct-distributions"
                      className="um_field_label_row"
                    >
                      <span>
                        Percent of class (distributions)
                      </span>
                    </label>
                    <input
                      id="lp-inv-pct-distributions"
                      type="text"
                      className="deals_add_inv_field_pill"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={percentOfClassDistributions}
                      aria-invalid={
                        Boolean(fieldErrors.percentOfClassDistributions) ||
                        undefined
                      }
                      aria-describedBy={
                        fieldErrors.percentOfClassDistributions
                          ? "lp-inv-pct-distributions-err"
                          : undefined
                      }
                      onChange={(e) => {
                        setPercentOfClassDistributions(
                          formatPercentTypeInputBare(e.target.value, 100),
                        )
                        clearFieldError("percentOfClassDistributions")
                      }}
                      onBlur={(e) =>
                        setPercentOfClassDistributions(
                          blurFormatPercentClamped(e.target.value),
                        )
                      }
                    />
                    {fieldErrors.percentOfClassDistributions ? (
                      <p
                        id="lp-inv-pct-distributions-err"
                        className="um_field_hint um_field_hint_error"
                        role="alert"
                      >
                        {fieldErrors.percentOfClassDistributions}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="add_contact_name_grid">
                <div className="um_field">
                  <label
                    htmlFor="lp-inv-entity-ownership"
                    className="um_field_label_row"
                  >
                    <Percent
                      className="um_field_label_icon"
                      size={17}
                      aria-hidden
                    />
                    <span>Entity Ownership</span>
                  </label>
                  <input
                    id="lp-inv-entity-ownership"
                    type="text"
                    className="deals_add_inv_field_pill"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={entityOwnershipPercent}
                    onChange={(e) =>
                      setEntityOwnershipPercent(
                        formatPercentTypeInputBare(e.target.value, 100),
                      )
                    }
                    onBlur={(e) =>
                      setEntityOwnershipPercent(
                        blurFormatPercentClamped(e.target.value),
                      )
                    }
                  />
                </div>

                <div className="um_field">
                  <label
                    htmlFor="lp-inv-distribution-allocation"
                    className="um_field_label_row"
                  >
                    <Percent
                      className="um_field_label_icon"
                      size={17}
                      aria-hidden
                    />
                    <span>Distribution Allocation %</span>
                  </label>
                  <input
                    id="lp-inv-distribution-allocation"
                    type="text"
                    className="deals_add_inv_field_pill"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={distributionAllocationPercent}
                    onChange={(e) =>
                      setDistributionAllocationPercent(
                        formatPercentTypeInputBare(e.target.value, 100),
                      )
                    }
                    onBlur={(e) =>
                      setDistributionAllocationPercent(
                        blurFormatPercentClamped(e.target.value),
                      )
                    }
                  />
                </div>
              </div>

              <div className="um_field">
                <div
                  className="um_field_label_row"
                  id="lp-inv-send-invite-label"
                >
                  <Mail
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span className="mail_text_label">
                    Would you like to notify the investor about their addition to
                    the deal?
                  </span>
                  {dealBlocksInvitationEmails ? (
                    <span className="deals_add_inv_label_info">
                      <InfoIconPanel
                        ariaLabel="More information: Invitation emails"
                        infoContent={
                          <>
                            Invitation emails are unavailable while required deal
                            details are incomplete. Complete the deal details before
                            sending invitations. You can still choose{" "}
                            <strong>No</strong> below.
                          </>
                        }
                      />
                    </span>
                  ) : null}
                </div>
                {dealBlocksInvitationEmails ? (
                  <p id="lp-inv-send-invite-hint" className="visually_hidden">
                    {INVITATION_EMAILS_UNAVAILABLE_HINT}
                  </p>
                ) : null}
                <div className="portal_yesno_field_block">
                  <YesNoCardRadioGroup
                    name="lp-inv-send-invitation"
                    value={sendInvitationMail}
                    onChange={(v) => {
                      setSendInvitationMail(v)
                      if (v === "no") clearFieldError("profileId")
                    }}
                    yesIsCommon
                    variant="mail"
                    disabled={dealBlocksInvitationEmails}
                    ariaLabelledBy="lp-inv-send-invite-label"
                    ariaDescribedBy={
                      dealBlocksInvitationEmails
                        ? "lp-inv-send-invite-hint"
                        : undefined
                    }
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="um_modal_actions add_contact_modal_actions">
            <button
              type="button"
              className="um_btn_secondary"
              onClick={onClose}
              disabled={submitting}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Close
            </button>
            <button
              type="submit"
              className="um_btn_primary"
              disabled={submitting || selectedContactAlreadyOnDeal}
            >
              {submitting ? (
                <>
                  <Loader2
                    size={16}
                    strokeWidth={2}
                    className="add_contact_modal_btn_spin"
                    aria-hidden
                  />
                  {isEditMode ? "Saving…" : "Adding…"}
                </>
              ) : (
                <>
                  {isEditMode ? (
                    <Save size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <Plus size={16} strokeWidth={2} aria-hidden />
                  )}
                  {isEditMode ? "Save" : "Add"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
    <AddContactPanel
      open={addContactModalOpen}
      onClose={() => setAddContactModalOpen(false)}
      onSave={handleAddContactSave}
      contactToEdit={null}
      existingContacts={contactRows}
    />
    </>
  )
}
