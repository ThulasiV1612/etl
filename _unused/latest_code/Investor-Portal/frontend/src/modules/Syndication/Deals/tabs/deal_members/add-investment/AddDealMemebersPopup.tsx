import type { LucideIcon } from "lucide-react"
import {
  Briefcase,
  Calendar,
  DollarSign,
  IdCard,
  Loader2,
  Mail,
  Pencil,
  Percent,
  Plus,
  Shield,
  Tag,
  UserRound,
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
import type { ReactNode } from "react"
import { toast } from "../../../../../../common/components/Toast"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../../../../common/utils/displayEmail"
import { presentFormValidationError } from "../../../../../../common/utils/formValidationFocus"
import { formatUsPhoneStoredForUi } from "../../../../../../common/phone/usPhoneNumber"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../../common/components/data-table/DataTable"
import { TabsScrollStrip } from "../../../../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import {
  DropdownSelect,
  MODAL_DROPDOWN_SELECT_PROPS,
  type DropdownSelectSection,
} from "../../../../../../common/components/dropdown-select"
import {
  createContact,
  fetchContacts,
} from "../../../../contacts/api/contactsApi"
import { AddContactPanel } from "../../../../contacts/components/AddContactPanel"
import type { ContactRow } from "../../../../contacts/types/contact.types"
import {
  fetchDealInvestorClasses,
  fetchDealMembers,
  fetchUsersForMemberSelect,
  postDealInvestment,
  postDealLpInvestor,
  putDealInvestment,
  putDealLpInvestor,
} from "../../../api/dealsApi"
import { getApiV1Base } from "../../../../../../common/utils/apiBaseUrl"
import { MEMBER_SELECT_OPTIONS } from "../../../constants/member-options"
import {
  DEAL_MEMBERS_TAB_ROLE_VALUES,
  GENERAL_PARTNER_ROLE_LABEL,
  GENERAL_PARTNER_ROLE_VALUE,
  INVESTOR_PROFILE_SELECT_OPTIONS,
  INVESTOR_ROLE_SELECT_OPTIONS,
  LEAD_SPONSOR_ROLE_VALUE,
  LP_INVESTOR_ROLE_VALUE,
  LP_INVESTORS_ROLE_LABEL,
  isAdminSponsorOrCoSponsorRole,
  isGeneralPartnerRole,
  isLeadSponsorRole,
  isLpInvestorRole,
  leadSponsorContactIdExcludingRow,
  leadSponsorTakenByAnotherMember,
  type DealInvestmentModalEntry,
} from "../../../constants/investor-profile"

import type { AddInvestmentFormValues } from "./add_deal_member_types"
import {
  buildContactRosterDropdownOption,
  buildDirectoryMemberRosterDropdownOption,
} from "./dealRosterContactDuplicate"
import {
  ensureSelectedMemberDropdownOption,
  resolveInvestorMemberSelectValue,
  selectedInvestorDropdownLabel,
} from "./resolveInvestorMemberSelectValue"
import {
  addMemberDraftEligibleForBackendAutosave,
  addMemberDraftHasContent,
  clearAddMemberDraft,
  loadAddMemberDraft,
  saveAddMemberDraft,
  type AddMemberFormDraft,
} from "./addMemberFormDraftStorage"
import type { DealInvestorClass } from "../../../types/deal-investor-class.types"
import {
  formatDealInvestorClassOptionLabel,
  isGpInvestorClass,
} from "../../../utils/investorClassOverviewFields"
import { rowDisplayName } from "../../../../usermanagement/memberAdminShared"
import {
  formatPercentTypeInputBare,
  moneyAmountOnBlur,
  moneyAmountOnChange,
  sanitizePercentTypingInput,
} from "../../../utils/offeringMoneyFormat"
import { InfoIconPanel } from "../../offering_details/FieldInfoHeading"
import { YesNoCardRadioGroup } from "../../../../../../common/components/YesNoCardRadioGroup/YesNoCardRadioGroup"
import { ExtraCompanyUserPayModal } from "../../../../company/ExtraCompanyUserPayModal"
import {
  ExtraCompanyUserPaymentRequiredError,
  type ExtraCompanyUserPaymentRequired,
} from "../../../utils/extraCompanyUserBilling"
import "../../../../contacts/contacts.css"
import "../../../../usermanagement/user_management.css"
import "../../../components/deal-step-form.css"
import "../../../deal-investors-tab.css"
import "./add_deal_modal.css"

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

const INVITATION_EMAILS_UNAVAILABLE_HINT_MEMBER =
  "Invitation emails are unavailable while the deal is in draft or required deal details are incomplete. Finalize the deal before sending invitations. You can still choose No below."

const INVITATION_EMAILS_UNAVAILABLE_HINT_INVESTOR =
  "Invitation emails are unavailable while required deal details are incomplete. Complete the deal details before sending invitations. You can still choose No below."

const PREFIX_CONTACT = "contact:"
const PREFIX_USER = "user:"

const DROPDOWN_TRIGGER_PILL =
  "um_field_select deals_add_inv_field_control deals_add_inv_field_pill"

function contactOptionLabel(c: ContactRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
  if (name && isDisplayableEmail(c.email))
    return `${name} — ${displayEmail(c.email)}`
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

/** Field row matching Add contact (`um_field` + `um_field_label_row`). */
function InvFormField({
  id,
  label,
  Icon,
  children,
  tight,
  labelSuffix,
}: {
  id: string
  label: string
  Icon?: LucideIcon
  children: ReactNode
  tight?: boolean
  labelSuffix?: ReactNode
}) {
  return (
    <div className={tight ? "um_field add_contact_field_tight" : "um_field"}>
      <label htmlFor={id} className="um_field_label_row">
        {Icon ? (
          <Icon className="um_field_label_icon" size={17} aria-hidden />
        ) : null}
        <span>{label}</span>
        {labelSuffix}
      </label>
      {children}
    </div>
  )
}

function withInvitationMailPolicy(
  f: AddInvestmentFormValues,
  blockInvites: boolean,
): AddInvestmentFormValues {
  if (!blockInvites) return f
  return { ...f, sendInvitationMail: "no" }
}

function toPercentInputValue(raw: string | undefined | null): string {
  const t = sanitizePercentTypingInput(String(raw ?? ""))
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return Math.max(0, Math.min(100, n)).toFixed(2)
}

function normalizePercentFormFields(
  f: AddInvestmentFormValues,
): AddInvestmentFormValues {
  return {
    ...f,
    percentOfClassOwnership: toPercentInputValue(f.percentOfClassOwnership),
    percentOfClassDistributions: toPercentInputValue(
      f.percentOfClassDistributions,
    ),
    entityOwnershipPercent: toPercentInputValue(f.entityOwnershipPercent),
    distributionAllocationPercent: toPercentInputValue(
      f.distributionAllocationPercent,
    ),
  }
}

function emptyForm(): AddInvestmentFormValues {
  return {
    offeringId: "",
    contactId: "",
    profileId: "",
    investorRole: "",
    status: "",
    fundApproved: false,
    investorClass: "",
    percentOfClassOwnership: "",
    percentOfClassDistributions: "",
    entityOwnershipPercent: "",
    distributionAllocationPercent: "",
    docSignedDate: "",
    commitmentAmount: "",
    extraContributionAmounts: [],
    documentFileName: null,
    sendInvitationMail: "yes",
  }
}

interface AddInvestmentModalProps {
  /** Used to load investor classes from Offering Details */
  dealId: string
  open: boolean
  onClose: () => void
  onSave: (
    values: AddInvestmentFormValues,
    subscriptionDocument: File | null,
  ) => void | Promise<void>
  /** Primary offering label (e.g. deal name) */
  defaultOfferingLabel: string
  mode?: "add" | "edit"
  /** When `mode` is `edit`, prefill the form (e.g. from an investor row). */
  initialValues?: AddInvestmentFormValues | null
  /** Stable key when opening add vs edit (e.g. investment row id) so class prefill syncs correctly. */
  prefillKey?: string
  /** Add mode: Investors tab vs Deal Members vs General Partners. */
  addEntry?: DealInvestmentModalEntry
  /**
   * Add mode: when true (“Continue editing”), restore session draft into the form.
   * When false (“Add Member”), always open an empty form; the table draft row still reflects
   * saved session data until the user deletes it or saves a completed member.
   */
  restoreAddMemberSessionDraft?: boolean
  /**
   * After debounced backend autosave (add mode). `createdInvestment` is true only
   * on first POST when an investment id is assigned — use that to refresh Deal Members
   * once; omitting it on every PUT avoids DataTable flicker while typing.
   */
  onBackendAutosave?: (
    detail?: { createdInvestment?: boolean },
  ) => void | Promise<void>
  /**
   * When true, do not send invitation emails (save/autosave forces
   * `send_invitation_mail` off). Draft deals may still invite investors.
   */
  dealBlocksInvitationEmails?: boolean
}

export function AddInvestmentModal({
  dealId,
  open,
  onClose,
  onSave,
  defaultOfferingLabel,
  mode = "add",
  initialValues = null,
  prefillKey = "default",
  addEntry = "member",
  restoreAddMemberSessionDraft = true,
  onBackendAutosave,
  dealBlocksInvitationEmails = false,
}: AddInvestmentModalProps) {
  const isInvestorEntry = addEntry === "investor"
  const isGpEntry = addEntry === "general_partner"
  const titleId = useId()
  const addMemberDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const latestAddMemberDraftRef = useRef({ form: emptyForm(), step: 1 as 1 | 2 })
  const skipFlushDraftAfterSaveRef = useRef(false)
  const prevModalOpenRef = useRef(false)
  const [backendInvestmentId, setBackendInvestmentId] = useState<string | null>(
    null,
  )
  const backendInvestmentIdRef = useRef<string | null>(null)
  const [backendLpInvestorId, setBackendLpInvestorId] = useState<string | null>(
    null,
  )
  const backendLpInvestorIdRef = useRef<string | null>(null)
  const [extraUserPayment, setExtraUserPayment] =
    useState<ExtraCompanyUserPaymentRequired | null>(null)
  const pendingSaveAfterExtraPayRef = useRef<AddInvestmentFormValues | null>(
    null,
  )
  const backendInvAutosaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const backendInvPostInFlightRef = useRef(false)
  const backendInvAutosaveInFlightRef = useRef(false)
  const [form, setForm] = useState<AddInvestmentFormValues>(emptyForm)
  const addInvFormRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [sectionTab, setSectionTab] =
    useState<InvestorEditSectionTab>("investor")
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<
    Partial<Record<InvestorEditSectionTab, HTMLElement | null>>
  >({})
  const ignoreScrollSpyUntilRef = useRef(0)
  const [submitting, setSubmitting] = useState(false)
  const [memberRows, setMemberRows] = useState<Record<string, unknown>[]>([])
  const [contactRows, setContactRows] = useState<ContactRow[]>([])
  const [allDealClasses, setAllDealClasses] = useState<DealInvestorClass[]>([])
  const dealClasses = useMemo(() => {
    if (isGpEntry) return allDealClasses.filter((c) => isGpInvestorClass(c))
    if (isInvestorEntry)
      return allDealClasses.filter((c) => !isGpInvestorClass(c))
    return allDealClasses
  }, [allDealClasses, isGpEntry, isInvestorEntry])
  const [investorClassesReady, setInvestorClassesReady] = useState(false)
  const [investorClassOptions, setInvestorClassOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "", label: "Loading investor classes…" }])
  const [membersLoading, setMembersLoading] = useState(false)
  const [addContactModalOpen, setAddContactModalOpen] = useState(false)
  const [memberRosterForGate, setMemberRosterForGate] = useState<
    {
      id: string
      investorRole?: string
      contactId?: string
      profileId?: string
      userEmail?: string
    }[]
  >([])

  const refreshMemberRosterForGate = useCallback(() => {
    void fetchDealMembers(dealId).then(({ members: rows }) => {
      setMemberRosterForGate(
        rows.map((r) => ({
          id: r.id,
          investorRole: r.investorRole,
          contactId: r.contactId,
          profileId: r.profileId,
          userEmail: r.userEmail,
        })),
      )
    })
  }, [dealId])

  /** Any stable row id from `editRow.id` — not only UUIDs (API may use other shapes). */
  const editingRowIdForLeadSponsorGate = useMemo(() => {
    if (mode !== "edit") return null
    const k = prefillKey?.trim() ?? ""
    if (!k || k.startsWith("add-")) return null
    return k
  }, [mode, prefillKey])

  /** Edit: exclude the row being edited. Add: exclude autosaved roster row for duplicate checks. */
  const excludeRowIdForLeadSponsorGate = useMemo(() => {
    if (mode === "edit") return editingRowIdForLeadSponsorGate
    if (isInvestorEntry) {
      const lp = backendLpInvestorId?.trim()
      return lp || null
    }
    const bid = backendInvestmentId?.trim()
    return bid || null
  }, [
    mode,
    editingRowIdForLeadSponsorGate,
    isInvestorEntry,
    backendInvestmentId,
    backendLpInvestorId,
  ])

  const leadSponsorOptionDisabled = useMemo(
    () =>
      leadSponsorTakenByAnotherMember(
        memberRosterForGate,
        excludeRowIdForLeadSponsorGate,
      ),
    [memberRosterForGate, excludeRowIdForLeadSponsorGate],
  )

  const leadSponsorContactId = useMemo(
    () =>
      leadSponsorContactIdExcludingRow(
        memberRosterForGate,
        excludeRowIdForLeadSponsorGate,
      ),
    [memberRosterForGate, excludeRowIdForLeadSponsorGate],
  )

  const adminCoBlockedForSelectedContact = useMemo(
    () =>
      Boolean(leadSponsorContactId) &&
      form.contactId.trim() === leadSponsorContactId,
    [leadSponsorContactId, form.contactId],
  )

  /** Lead Sponsor is a single roster identity — do not allow changing member/contact while editing that row. */
  const memberContactSelectLocked = useMemo(
    () => mode === "edit" && isLeadSponsorRole(form.investorRole),
    [mode, form.investorRole],
  )

  const investorRoleDropdownOptions = useMemo(
    () =>
      isInvestorEntry
        ? [
            {
              value: LP_INVESTOR_ROLE_VALUE,
              label: LP_INVESTORS_ROLE_LABEL,
              disabled: false,
            },
          ]
        : isGpEntry
          ? [
              {
                value: GENERAL_PARTNER_ROLE_VALUE,
                label: GENERAL_PARTNER_ROLE_LABEL,
                disabled: false,
              },
            ]
          : INVESTOR_ROLE_SELECT_OPTIONS.filter(
              (o) =>
                !o.value || DEAL_MEMBERS_TAB_ROLE_VALUES.has(o.value),
            ).map((o) => ({
              value: o.value,
              label: o.label,
              disabled:
                (o.value === LEAD_SPONSOR_ROLE_VALUE &&
                  leadSponsorOptionDisabled) ||
                (adminCoBlockedForSelectedContact &&
                  (o.value === "admin sponsor" || o.value === "Co-sponsor")),
            })),
    [
      isInvestorEntry,
      isGpEntry,
      leadSponsorOptionDisabled,
      adminCoBlockedForSelectedContact,
    ],
  )

  useEffect(() => {
    if (!open) return
    refreshMemberRosterForGate()
  }, [open, refreshMemberRosterForGate])

  const syncActiveTabFromScroll = useCallback(() => {
    if (!isInvestorEntry) return
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
  }, [isInvestorEntry])

  const scrollToSection = useCallback(
    (id: InvestorEditSectionTab) => {
      if (!isInvestorEntry) return
      const root = scrollRef.current
      const section = sectionRefs.current[id]
      if (!root || !section) return
      setSectionTab(id)
      ignoreScrollSpyUntilRef.current = Date.now() + 600
      const nextTop =
        root.scrollTop +
        (section.getBoundingClientRect().top - root.getBoundingClientRect().top)
      root.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
    },
    [isInvestorEntry],
  )

  useEffect(() => {
    if (!open || !isInvestorEntry) return
    ignoreScrollSpyUntilRef.current = 0
    const root = scrollRef.current
    if (!root) return
    root.scrollTop = 0
    syncActiveTabFromScroll()
    root.addEventListener("scroll", syncActiveTabFromScroll, { passive: true })
    return () => root.removeEventListener("scroll", syncActiveTabFromScroll)
  }, [open, isInvestorEntry, syncActiveTabFromScroll])

  useLayoutEffect(() => {
    if (!open) return
    setSectionTab("investor")
    const rolePatch = isInvestorEntry
      ? { investorRole: LP_INVESTOR_ROLE_VALUE }
      : isGpEntry
        ? { investorRole: GENERAL_PARTNER_ROLE_VALUE }
        : {}
    if (mode === "edit" && initialValues) {
      setForm(
        normalizePercentFormFields({
          ...emptyForm(),
          ...initialValues,
          ...rolePatch,
        }),
      )
      setBackendInvestmentId(null)
      backendInvestmentIdRef.current = null
      setBackendLpInvestorId(null)
      backendLpInvestorIdRef.current = null
      setError(null)
      return
    }
    if (mode === "add" && !restoreAddMemberSessionDraft) {
      setForm({ ...emptyForm(), offeringId: "primary", ...rolePatch })
      setBackendInvestmentId(null)
      backendInvestmentIdRef.current = null
      setBackendLpInvestorId(null)
      backendLpInvestorIdRef.current = null
      setError(null)
      return
    }
    const restored = loadAddMemberDraft(dealId)
    const restoredRole = restored?.form?.investorRole
    const restoredMatchesEntry = isGpEntry
      ? isGeneralPartnerRole(restoredRole)
      : !isGeneralPartnerRole(restoredRole) &&
        !isLpInvestorRole(restoredRole)
    if (
      mode === "add" &&
      restored &&
      addMemberDraftHasContent(restored) &&
      restoredMatchesEntry
    ) {
      setForm(
        normalizePercentFormFields({
          ...emptyForm(),
          ...restored.form,
          offeringId: restored.form.offeringId?.trim() || "primary",
          ...rolePatch,
        }),
      )
      if (isInvestorEntry) {
        setBackendInvestmentId(null)
        backendInvestmentIdRef.current = null
        const lpBid = restored.backendLpInvestorId?.trim()
        if (lpBid) {
          setBackendLpInvestorId(lpBid)
          backendLpInvestorIdRef.current = lpBid
        } else {
          setBackendLpInvestorId(null)
          backendLpInvestorIdRef.current = null
        }
      } else {
        setBackendLpInvestorId(null)
        backendLpInvestorIdRef.current = null
        const bid = restored.backendInvestmentId?.trim()
        if (bid) {
          setBackendInvestmentId(bid)
          backendInvestmentIdRef.current = bid
        } else {
          setBackendInvestmentId(null)
          backendInvestmentIdRef.current = null
        }
      }
    } else {
      setForm({ ...emptyForm(), offeringId: "primary", ...rolePatch })
      setBackendInvestmentId(null)
      backendInvestmentIdRef.current = null
      setBackendLpInvestorId(null)
      backendLpInvestorIdRef.current = null
    }
    setError(null)
  }, [
    open,
    dealId,
    mode,
    initialValues,
    prefillKey,
    restoreAddMemberSessionDraft,
    isInvestorEntry,
    isGpEntry,
  ])

  latestAddMemberDraftRef.current = { form, step: 1 as const }

  /** Autosave Add Member draft (per deal) while adding — restored next time you open this modal. */
  useEffect(() => {
    if (!open || mode !== "add") {
      if (addMemberDraftTimerRef.current) {
        clearTimeout(addMemberDraftTimerRef.current)
        addMemberDraftTimerRef.current = null
      }
      return
    }
    if (addMemberDraftTimerRef.current)
      clearTimeout(addMemberDraftTimerRef.current)
    addMemberDraftTimerRef.current = setTimeout(() => {
      addMemberDraftTimerRef.current = null
      const { form: f } = latestAddMemberDraftRef.current
      const draft: AddMemberFormDraft = {
        form: f,
        step: 1 as const,
        ...(backendInvestmentIdRef.current
          ? { backendInvestmentId: backendInvestmentIdRef.current }
          : {}),
        ...(backendLpInvestorIdRef.current
          ? { backendLpInvestorId: backendLpInvestorIdRef.current }
          : {}),
      }
      /* Fresh “Add Member”: do not overwrite stored draft with an empty form — keeps draft row visible. */
      if (!restoreAddMemberSessionDraft && !addMemberDraftHasContent(draft)) return
      saveAddMemberDraft(dealId, draft)
    }, 500)
    return () => {
      if (addMemberDraftTimerRef.current) {
        clearTimeout(addMemberDraftTimerRef.current)
        addMemberDraftTimerRef.current = null
      }
    }
  }, [
    open,
    mode,
    dealId,
    form,
    restoreAddMemberSessionDraft,
    backendInvestmentId,
    backendLpInvestorId,
  ])

  backendInvestmentIdRef.current = backendInvestmentId
  backendLpInvestorIdRef.current = backendLpInvestorId

  /** Debounced POST/PUT — same pattern as Add Deal (placeholder contact + first class on server). */
  useEffect(() => {
    if (!getApiV1Base()) return
    if (!open || mode !== "add") return
    if (membersLoading) return
    if (!investorClassesReady) return
    if (isInvestorEntry && dealClasses.length === 0) return

    if (backendInvAutosaveTimerRef.current)
      clearTimeout(backendInvAutosaveTimerRef.current)
    backendInvAutosaveTimerRef.current = setTimeout(() => {
      backendInvAutosaveTimerRef.current = null
      void (async () => {
        const f = latestAddMemberDraftRef.current.form
        const draft: AddMemberFormDraft = {
          form: f,
          step: 1,
          ...(backendInvestmentIdRef.current
            ? { backendInvestmentId: backendInvestmentIdRef.current }
            : {}),
          ...(backendLpInvestorIdRef.current
            ? { backendLpInvestorId: backendLpInvestorIdRef.current }
            : {}),
        }
        if (!addMemberDraftEligibleForBackendAutosave(draft)) return

        const values: AddInvestmentFormValues = withInvitationMailPolicy(
          {
            ...f,
            offeringId: f.offeringId?.trim() || "primary",
          },
          dealBlocksInvitationEmails,
        )

        if (isInvestorEntry) {
          const lpId = backendLpInvestorIdRef.current
          if (backendInvAutosaveInFlightRef.current) return
          if (lpId) {
            backendInvAutosaveInFlightRef.current = true
            try {
              const result = await putDealLpInvestor(
                dealId,
                lpId,
                values,
                { autosave: true },
              )
              if (result.ok && result.mode === "api") {
                refreshMemberRosterForGate()
                if (onBackendAutosave) await onBackendAutosave()
              }
            } catch {
              /* silent — user may be offline */
            } finally {
              backendInvAutosaveInFlightRef.current = false
            }
            return
          }
          if (backendInvPostInFlightRef.current) return
          backendInvPostInFlightRef.current = true
          backendInvAutosaveInFlightRef.current = true
          try {
            const result = await postDealLpInvestor(dealId, values, {
              autosave: true,
            })
            if (result.ok && result.mode === "api" && result.lpInvestorId) {
              backendLpInvestorIdRef.current = result.lpInvestorId
              setBackendLpInvestorId(result.lpInvestorId)
              saveAddMemberDraft(dealId, {
                form: f,
                step: 1,
                backendLpInvestorId: result.lpInvestorId,
              })
            }
            if (result.ok && result.mode === "api") {
              refreshMemberRosterForGate()
              if (onBackendAutosave)
                await onBackendAutosave({
                  createdInvestment: Boolean(result.lpInvestorId),
                })
            }
          } finally {
            backendInvPostInFlightRef.current = false
            backendInvAutosaveInFlightRef.current = false
          }
          return
        }

        const invId = backendInvestmentIdRef.current
        if (backendInvAutosaveInFlightRef.current) return

        if (invId) {
          backendInvAutosaveInFlightRef.current = true
          try {
            const result = await putDealInvestment(
              dealId,
              invId,
              values,
              null,
              { autosave: true },
            )
            if (result.ok && result.mode === "api") {
              refreshMemberRosterForGate()
              if (onBackendAutosave) await onBackendAutosave()
            }
          } catch {
            /* silent — user may be offline */
          } finally {
            backendInvAutosaveInFlightRef.current = false
          }
          return
        }

        if (backendInvPostInFlightRef.current) return
        backendInvPostInFlightRef.current = true
        backendInvAutosaveInFlightRef.current = true
        try {
          const result = await postDealInvestment(dealId, values, null, {
            autosave: true,
          })
          if (result.ok && result.mode === "api" && result.investmentId) {
            backendInvestmentIdRef.current = result.investmentId
            setBackendInvestmentId(result.investmentId)
            saveAddMemberDraft(dealId, {
              form: f,
              step: 1,
              backendInvestmentId: result.investmentId,
            })
          }
          if (result.ok && result.mode === "api") {
            refreshMemberRosterForGate()
            if (onBackendAutosave)
              await onBackendAutosave({
                createdInvestment: Boolean(result.investmentId),
              })
          }
        } finally {
          backendInvPostInFlightRef.current = false
          backendInvAutosaveInFlightRef.current = false
        }
      })()
    }, 1200)
    return () => {
      if (backendInvAutosaveTimerRef.current) {
        clearTimeout(backendInvAutosaveTimerRef.current)
        backendInvAutosaveTimerRef.current = null
      }
    }
  }, [
    open,
    mode,
    dealId,
    form,
    dealClasses.length,
    investorClassesReady,
    onBackendAutosave,
    refreshMemberRosterForGate,
    dealBlocksInvitationEmails,
    isInvestorEntry,
    membersLoading,
    contactRows,
    memberRows,
  ])

  useEffect(() => {
    if (!dealBlocksInvitationEmails || !open) return
    setForm((prev) =>
      prev.sendInvitationMail === "no"
        ? prev
        : { ...prev, sendInvitationMail: "no" },
    )
  }, [dealBlocksInvitationEmails, open])

  /** Persist partial add-member data when the modal closes (covers close before debounced autosave). */
  useEffect(() => {
    const wasOpen = prevModalOpenRef.current
    prevModalOpenRef.current = open
    if (!wasOpen || open) return
    if (addMemberDraftTimerRef.current) {
      clearTimeout(addMemberDraftTimerRef.current)
      addMemberDraftTimerRef.current = null
    }
    if (skipFlushDraftAfterSaveRef.current) {
      skipFlushDraftAfterSaveRef.current = false
      return
    }
    if (mode !== "add") return
    const draft: AddMemberFormDraft = {
      form: latestAddMemberDraftRef.current.form,
      step: 1 as const,
      ...(backendInvestmentIdRef.current
        ? { backendInvestmentId: backendInvestmentIdRef.current }
        : {}),
      ...(backendLpInvestorIdRef.current
        ? { backendLpInvestorId: backendLpInvestorIdRef.current }
        : {}),
    }
    if (!addMemberDraftHasContent(draft)) return
    saveAddMemberDraft(dealId, draft)
  }, [open, mode, dealId])

  useEffect(() => {
    if (!open) {
      setInvestorClassesReady(false)
      return
    }
    let cancelled = false
    setMembersLoading(true)
    setInvestorClassesReady(false)
    setInvestorClassOptions([{ value: "", label: "Loading investor classes…" }])
    void (async () => {
      const [users, contacts, classes] = await Promise.all([
        fetchUsersForMemberSelect(),
        fetchContacts(),
        fetchDealInvestorClasses(dealId),
      ])
      if (cancelled) return
      setMemberRows(users)
      setContactRows(contacts)
      setAllDealClasses(classes)
      setInvestorClassesReady(true)
      setMembersLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, dealId])

  useEffect(() => {
    if (!open) return
    if (!investorClassesReady) {
      setInvestorClassOptions([
        { value: "", label: "Loading investor classes…" },
      ])
      return
    }
    if (dealClasses.length > 0) {
      setInvestorClassOptions([
        {
          value: "",
          label: isGpEntry
            ? "Select general partner class"
            : "Select investor class",
        },
        ...dealClasses.map((row) => ({
          value: row.id,
          label: formatDealInvestorClassOptionLabel(row),
        })),
      ])
      return
    }
    setInvestorClassOptions([
      {
        value: "",
        label: isGpEntry
          ? "No general partner classes defined"
          : "No investor classes defined",
      },
    ])
    if (isInvestorEntry || isGpEntry) {
      setForm((prev) => ({ ...prev, investorClass: "" }))
    }
  }, [open, investorClassesReady, dealClasses, isGpEntry, isInvestorEntry])

  useEffect(() => {
    if (!open || !investorClassesReady || dealClasses.length === 0) return
    if (mode !== "edit" || !initialValues?.investorClass?.trim()) return
    const raw = initialValues.investorClass.trim()
    const byId = dealClasses.find((c) => c.id === raw)
    const resolved = byId
      ? raw
      : dealClasses.find(
          (c) => c.name.trim().toLowerCase() === raw.toLowerCase(),
        )?.id ?? ""
    if (!resolved) return
    setForm((prev) => ({ ...prev, investorClass: resolved }))
  }, [
    open,
    investorClassesReady,
    dealClasses,
    mode,
    initialValues?.investorClass,
    prefillKey,
  ])

  useEffect(() => {
    if (!open) return
    function onWindowKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setAddContactModalOpen(false)
  }, [open])

  const offeringOptions = [
    {
      value: "primary",
      label: defaultOfferingLabel.trim() || "Default offering",
    },
  ]

  const patch = useCallback((p: Partial<AddInvestmentFormValues>) => {
    setForm((prev) => ({ ...prev, ...p }))
  }, [])

  const patchMemberById = useCallback(
    (raw: string) => {
      if (memberContactSelectLocked) return

      function isLeadSponsorBlockedForAdminCo(nextContactId: string): boolean {
        if (
          !leadSponsorContactId ||
          nextContactId.trim() !== leadSponsorContactId
        )
          return false
        if (!isAdminSponsorOrCoSponsorRole(form.investorRole)) return false
        toast.error(
          "This person is already Lead Sponsor on this deal. They cannot also be Admin sponsor or Co-sponsor.",
        )
        return true
      }

      if (!raw) {
        patch({
          contactId: "",
          contactDisplayName: undefined,
          contactEmail: undefined,
          contactUsername: undefined,
        })
        return
      }

      if (raw.startsWith(PREFIX_CONTACT)) {
        const id = raw.slice(PREFIX_CONTACT.length)
        if (isLeadSponsorBlockedForAdminCo(id)) return
        const c = contactRows.find((x) => x.id === id)
        if (c) {
          const display = contactOptionLabel(c)
          patch({
            contactId: id,
            contactDisplayName: display.split(" — ")[0]?.trim() || display,
            contactEmail: c.email.trim(),
            contactUsername: undefined,
          })
        }
        return
      }

      const userId = raw.startsWith(PREFIX_USER)
        ? raw.slice(PREFIX_USER.length)
        : raw
      if (isLeadSponsorBlockedForAdminCo(userId)) return
      const u = memberRows.find((x) => String(x.id) === userId)
      if (u) {
        const display =
          rowDisplayName(u) !== "—"
            ? rowDisplayName(u)
            : String(u.email ?? "").trim() || "—"
        patch({
          contactId: userId,
          contactDisplayName: display,
          contactEmail: String(u.email ?? "").trim(),
          contactUsername: String(u.username ?? ""),
        })
        return
      }

      const fallbackOpt = MEMBER_SELECT_OPTIONS.find((o) => o.value === userId)
      if (fallbackOpt?.value) {
        const parts = fallbackOpt.label.split(" — ")
        patch({
          contactId: userId,
          contactDisplayName: parts[0]?.trim() || userId,
          contactEmail: parts[1]?.trim() ?? "",
          contactUsername: undefined,
        })
        return
      }

      patch({
        contactId: userId,
        contactDisplayName: undefined,
        contactEmail: undefined,
        contactUsername: undefined,
      })
    },
    [
      contactRows,
      memberRows,
      patch,
      leadSponsorContactId,
      form.investorRole,
      memberContactSelectLocked,
    ],
  )

  const memberSelectValue = useMemo(
    () =>
      resolveInvestorMemberSelectValue({
        contactId: form.contactId,
        contactEmail: form.contactEmail,
        contactRows,
        memberRows,
        prefixContact: PREFIX_CONTACT,
        prefixUser: PREFIX_USER,
      }),
    [form.contactId, form.contactEmail, contactRows, memberRows],
  )

  const memberDropdownSections = useMemo((): DropdownSelectSection[] => {
    const lsId = leadSponsorContactId?.trim() ?? ""
    const blockLsPersonForAdminCo =
      Boolean(lsId) && isAdminSponsorOrCoSponsorRole(form.investorRole)
    function optionDisabledForLeadSponsorConflict(value: string): boolean {
      if (!blockLsPersonForAdminCo) return false
      if (value.startsWith(PREFIX_CONTACT)) {
        const id = value.slice(PREFIX_CONTACT.length).trim()
        return id === lsId
      }
      if (value.startsWith(PREFIX_USER)) {
        const id = value.slice(PREFIX_USER.length).trim()
        return id === lsId
      }
      return value.trim() === lsId
    }

    function isAlreadyOnDealRoster(contactOrUserId: string, email: string): boolean {
      const em = email.trim().toLowerCase()
      for (const r of memberRosterForGate) {
        if (
          excludeRowIdForLeadSponsorGate &&
          r.id === excludeRowIdForLeadSponsorGate
        )
          continue
        const cid = String(r.contactId ?? "").trim()
        if (cid && cid === contactOrUserId) return true
        const rowEm = String(r.userEmail ?? "").trim().toLowerCase()
        if (em && rowEm && rowEm === em) return true
      }
      return false
    }

    const sections: DropdownSelectSection[] = []
    if (contactRows.length > 0) {
      sections.push({
        heading: "Contacts",
        options: contactRows.map((c) => {
          const value = `${PREFIX_CONTACT}${c.id}`
          const baseLabel = contactOptionLabel(c)
          const onDeal = isAlreadyOnDealRoster(c.id, c.email ?? "")
          const lsConflict = optionDisabledForLeadSponsorConflict(value)
          const meta = buildContactRosterDropdownOption(
            baseLabel,
            c,
            onDeal,
            lsConflict,
          )
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
      const directoryOptions = memberRows
        .map((u) => memberOptionFromUser(u))
        .filter((o): o is { value: string; label: string } => Boolean(o))
        .map((o) => {
          const value = `${PREFIX_USER}${o.value}`
          const dirRow = memberRows.find((x) => String(x.id) === o.value)
          const email = dirRow ? String(dirRow.email ?? "").trim() : ""
          const onDeal = isAlreadyOnDealRoster(o.value, email)
          const lsConflict = optionDisabledForLeadSponsorConflict(value)
          const meta = buildDirectoryMemberRosterDropdownOption(
            o.label,
            dirRow ?? {},
            onDeal,
            lsConflict,
          )
          return {
            value,
            label: o.label,
            disabled: meta.disabled,
            labelContent: meta.labelContent,
          }
        })
      sections.push({
        heading: isInvestorEntry ? "Directory users" : "Directory members",
        options: directoryOptions,
      })
    }
    return ensureSelectedMemberDropdownOption({
      sections,
      value: memberSelectValue,
      fallbackLabel: selectedInvestorDropdownLabel({
        displayName: form.contactDisplayName,
        email: form.contactEmail,
      }),
    })
  }, [
    contactRows,
    memberRows,
    isInvestorEntry,
    leadSponsorContactId,
    form.investorRole,
    form.contactDisplayName,
    form.contactEmail,
    memberRosterForGate,
    excludeRowIdForLeadSponsorGate,
    memberSelectValue,
  ])

  /** After contacts/members load on edit, keep the investor selected with email shown. */
  useEffect(() => {
    const id = form.contactId.trim()
    if (!id) return
    if (contactRows.length === 0 && memberRows.length === 0) return
    const resolved = resolveInvestorMemberSelectValue({
      contactId: id,
      contactEmail: form.contactEmail,
      contactRows,
      memberRows,
      prefixContact: PREFIX_CONTACT,
      prefixUser: PREFIX_USER,
    })
    if (!resolved) return

    let nextId = id
    let nextEmail = String(form.contactEmail ?? "").trim()
    let nextName = String(form.contactDisplayName ?? "").trim()
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

    const patchNext: Partial<AddInvestmentFormValues> = {}
    if (nextId && nextId !== id) patchNext.contactId = nextId
    if (nextEmail && nextEmail !== String(form.contactEmail ?? "").trim())
      patchNext.contactEmail = nextEmail
    if (nextName && nextName !== String(form.contactDisplayName ?? "").trim())
      patchNext.contactDisplayName = nextName
    if (Object.keys(patchNext).length > 0) patch(patchNext)
  }, [
    form.contactId,
    form.contactEmail,
    form.contactDisplayName,
    contactRows,
    memberRows,
    patch,
  ])

  const handleContactCreated = useCallback(
    (contact: ContactRow) => {
      setContactRows((prev) => {
        if (prev.some((c) => c.id === contact.id)) return prev
        return [...prev, contact]
      })
      const display = contactOptionLabel(contact)
      const namePart = display.split(" — ")[0]?.trim() || display
      patch({
        contactId: contact.id,
        contactDisplayName: namePart,
        contactEmail: contact.email.trim(),
        contactUsername: undefined,
      })
      toast.success(
        "Contact added",
        isInvestorEntry
          ? `${namePart} is selected as the investor for this investment.`
          : `${namePart} is selected as the member for this investment.`,
      )
    },
    [patch, isInvestorEntry],
  )

  const handleAddContactSave = useCallback(
    async (
      contact: Omit<ContactRow, "id" | "createdByDisplayName">,
    ) => {
      const created = await createContact(contact)
      handleContactCreated(created)
    },
    [handleContactCreated],
  )

  const noDealClasses =
    investorClassesReady && dealClasses.length === 0

  const showInvestorClassField =
    isInvestorEntry || (isGpEntry && dealClasses.length > 0)

  const showClassPercentFields = isInvestorEntry && !noDealClasses

  function blurFormatPercentClamped(raw: string): string {
    const t = sanitizePercentTypingInput(raw)
    if (!t) return ""
    const n = parseFloat(t)
    if (!Number.isFinite(n)) return ""
    return Math.max(0, Math.min(100, n)).toFixed(2)
  }

  function percentValuesEqual(a: string, b: string): boolean {
    const ta = sanitizePercentTypingInput(a)
    const tb = sanitizePercentTypingInput(b)
    if (!ta && !tb) return true
    if (!ta || !tb) return false
    const na = parseFloat(ta)
    const nb = parseFloat(tb)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
    return ta === tb
  }

  function validateInvestmentStep1(): string | null {
    if (!form.offeringId.trim()) return "Select an offering."
    if (!form.contactId.trim()) {
      return isInvestorEntry
        ? "Select an investor or contact."
        : isGpEntry
          ? "Select a team member."
          : "Select a general partner."
    }
    if (!isInvestorEntry && !form.investorRole.trim()) {
      return "Select a role."
    }
    if (isInvestorEntry) {
      if (!investorClassesReady) return "Loading investor classes…"
      if (noDealClasses) {
        return "Add at least one investor class in the Classes section before recording an investment."
      }
      if (!form.investorClass.trim()) return "Select an investor class."
      if (!dealClasses.some((c) => c.id === form.investorClass.trim())) {
        return "Select a valid investor class from this deal."
      }
    }
    if (isGpEntry && dealClasses.length > 0) {
      if (!form.investorClass.trim()) return "Select a general partner class."
      if (!dealClasses.some((c) => c.id === form.investorClass.trim())) {
        return "Select a valid general partner class from this deal."
      }
    }
    if (isInvestorEntry && !form.commitmentAmount.trim()) {
      return "Enter a commitment amount."
    }
    if (
      leadSponsorContactId &&
      form.contactId.trim() === leadSponsorContactId &&
      isAdminSponsorOrCoSponsorRole(form.investorRole)
    ) {
      return "This person is already Lead Sponsor on this deal. They cannot also be Admin sponsor or Co-sponsor."
    }
    if (
      form.investorRole === LEAD_SPONSOR_ROLE_VALUE &&
      leadSponsorTakenByAnotherMember(
        memberRosterForGate,
        excludeRowIdForLeadSponsorGate,
      )
    ) {
      return "This deal already has a Lead Sponsor. Choose another role or edit the existing Lead Sponsor row."
    }
    if (
      isInvestorEntry &&
      form.sendInvitationMail === "yes" &&
      !String(form.profileId ?? "").trim()
    ) {
      return "Select an investor profile before choosing to send the invitation email."
    }
    return null
  }

  function focusSectionForValidation(message: string) {
    if (!isInvestorEntry) return
    const m = message.toLowerCase()
    if (m.includes("profile")) {
      scrollToSection("profile")
      return
    }
    if (
      m.includes("class") ||
      m.includes("commitment") ||
      m.includes("percent") ||
      m.includes("invitation")
    ) {
      scrollToSection("investment")
      return
    }
    scrollToSection("investor")
  }

  function reportAddInvestmentValidation(message: string) {
    setError(message)
    focusSectionForValidation(message)
    requestAnimationFrame(() => {
      presentFormValidationError({
        container: addInvFormRef.current,
        message,
      })
    })
  }

  async function performSave() {
    setError(null)
    const validationMessage = validateInvestmentStep1()
    if (validationMessage) {
      reportAddInvestmentValidation(validationMessage)
      return
    }
    setSubmitting(true)
    try {
      let values = withInvitationMailPolicy(form, dealBlocksInvitationEmails)
      await onSave(values, null)
      if (mode === "add") {
        skipFlushDraftAfterSaveRef.current = true
        backendInvestmentIdRef.current = null
        setBackendInvestmentId(null)
        backendLpInvestorIdRef.current = null
        setBackendLpInvestorId(null)
        clearAddMemberDraft(dealId)
      }
    } catch (err) {
      if (err instanceof ExtraCompanyUserPaymentRequiredError) {
        pendingSaveAfterExtraPayRef.current = withInvitationMailPolicy(
          form,
          dealBlocksInvitationEmails,
        )
        setExtraUserPayment(err.payload)
        setError(err.message)
        return
      }
      setError(
        err instanceof Error ? err.message : "Could not save. Try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    void performSave()
  }

  type ContactDraftTableRow = {
    id: string
    name: string
    email: string
    phone: string
    status: string
  }

  const handleEditContactDraft = useCallback(() => {
    setAddContactModalOpen(true)
  }, [])

  /** Rows for “All Contacts” draft preview — wire to storage when `contactAddDraft*` exists. */
  const contactDraftTableRows = useMemo((): ContactDraftTableRow[] => [], [])

  const contactDraftColumns = useMemo(
    (): DataTableColumn<ContactDraftTableRow>[] => [
      { id: "name", header: "Name", cell: (r) => r.name },
      { id: "email", header: "Email", cell: (r) => r.email },
      {
        id: "phone",
        header: "Phone",
        cell: (r) => formatUsPhoneStoredForUi(r.phone),
      },
      // { id: "status", header: "Status", cell: (r) => r.status },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        cell: () => (
          <button
            type="button"
            className="um_btn_secondary deals_add_inv_draft_edit_btn"
            onClick={handleEditContactDraft}
          >
            <Pencil size={14} strokeWidth={2} aria-hidden />
            Edit
          </button>
        ),
      },
    ],
    [handleEditContactDraft],
  )

  if (!open) return null

  return (
    <>
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
      role="presentation"
    >
      <div
        className={[
          "um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel",
          isInvestorEntry ? "deal_inv_investor_view_modal" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head add_contact_modal_head">
          <div className="add_contact_modal_head_main">
            <h3 id={titleId} className="um_modal_title add_contact_modal_title">
              {mode === "edit"
                ? addEntry === "investor"
                  ? "Edit Investor"
                  : addEntry === "general_partner"
                    ? "Edit Team Member"
                    : "Edit General Partner"
                : addEntry === "investor"
                  ? "Add Investor"
                  : addEntry === "general_partner"
                    ? "Add Team Member"
                    : "Add General Partner"}
              {mode === "add" ? (
                <span className="deals_add_inv_autosave_badge" aria-live="polite">
                  {/* Autosave on */}
                </span>
              ) : null}
            </h3>
          </div>
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
          ref={addInvFormRef}
          className={[
            "deals_add_inv_modal_form",
            isInvestorEntry ? "deal_inv_view_form" : "",
            !isInvestorEntry ? "deals_add_member_form_stacked" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onSubmit={handleFormSubmit}
          noValidate
        >
          {isInvestorEntry ? (
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
                        id={`add-inv-tab-${id}`}
                        role="tab"
                        aria-selected={selected}
                        aria-controls={`add-inv-panel-${id}`}
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
          ) : null}

          <div
            ref={scrollRef}
            className={[
              "deals_add_inv_modal_scroll",
              isInvestorEntry ? "deal_inv_view_body" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {error ? (
              <p className="um_msg_error um_modal_form_error" role="alert">
                {error}
              </p>
            ) : null}

            <>
                <section
                  ref={(el) => {
                    sectionRefs.current.investor = el
                  }}
                  className={[
                    "add_contact_section",
                    isInvestorEntry ? "deal_inv_view_section" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role={isInvestorEntry ? "tabpanel" : undefined}
                  id={isInvestorEntry ? "add-inv-panel-investor" : undefined}
                  aria-labelledby={
                    isInvestorEntry ? "add-inv-tab-investor" : undefined
                  }
                >
                  {isInvestorEntry ? (
                    <h3 className="deal_inv_view_section_label">Investor</h3>
                  ) : null}
                  <div className="add_contact_name_grid">
                    <InvFormField
                      id="add-inv-offering"
                      label="Offering"
                      // label="Select offering"
                      Icon={Briefcase}
                      tight
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-offering"
                        options={offeringOptions.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        value={form.offeringId}
                        onChange={(v) => patch({ offeringId: v })}
                        placeholder="Select offering"
                        ariaLabel="Select offering"
                        triggerClassName={DROPDOWN_TRIGGER_PILL}
                      />
                    </InvFormField>

                    <InvFormField
                      id="add-inv-member"
                      label={
                        isInvestorEntry
                          ? "Investor"
                          : isGpEntry
                            ? "Team Member"
                            : "General Partner"
                      }
                      Icon={UserRound}
                      tight
                      labelSuffix={
                        memberContactSelectLocked ? (
                          <span className="deals_add_inv_field_locked_badge">
                            Read-only
                          </span>
                        ) : null
                      }
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-member"
                        sections={memberDropdownSections}
                        value={memberSelectValue}
                        disabled={membersLoading || memberContactSelectLocked}
                        onChange={(v) => patchMemberById(v)}
                        placeholder={
                          membersLoading
                            ? isInvestorEntry
                              ? "Loading contacts and directory users…"
                              : isGpEntry
                                ? "Loading contacts and team members…"
                                : "Loading contacts and general partners…"
                            : isInvestorEntry
                              ? "Select investor or contact"
                              : isGpEntry
                                ? "Select team member or contact"
                                : "Select general partner or contact"
                        }
                        ariaLabel={
                          isInvestorEntry
                            ? "Investor or contact"
                            : isGpEntry
                              ? "Team member or contact"
                              : "General partner or contact"
                        }
                        header={
                          memberContactSelectLocked
                            ? undefined
                            : {
                                label: "+ Add Contact",
                                onClick: () => setAddContactModalOpen(true),
                              }
                        }
                        triggerClassName={[
                          DROPDOWN_TRIGGER_PILL,
                          memberContactSelectLocked
                            ? "deals_add_inv_field_control_readonly"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                      {memberContactSelectLocked ? (
                        <p className="um_field_hint deals_add_inv_member_readonly_hint" role="note">
                          The Lead Sponsor&apos;s name and email cannot be changed
                          here. Change their role first, or manage members from the
                          deal roster.
                        </p>
                      ) : null}
                    </InvFormField>
                  </div>
                  {contactDraftTableRows.length > 0 ? (
                    <div
                      className="deals_add_inv_draft_table_wrap"
                      aria-labelledby="add-inv-draft-label"
                    >
                      <p
                        className="deals_add_inv_draft_table_label"
                        id="add-inv-draft-label"
                      >
                        Autosaved contact (All Contacts draft)
                      </p>
                      <DataTable<ContactDraftTableRow>
                        visualVariant="members"
                        membersTableClassName="um_table_members deal_inv_table deals_add_inv_draft_table"
                        columns={contactDraftColumns}
                        rows={contactDraftTableRows}
                        getRowKey={(r) => r.id}
                        emptyLabel="No autosaved draft."
                        membersShell="plain"
                        stickyFirstColumn={false}
                      />
                    </div>
                  ) : null}
                </section>

                {!isInvestorEntry ? (
                  <hr className="add_contact_section_rule" />
                ) : null}

                {isInvestorEntry ? (
                    <section
                      ref={(el) => {
                        sectionRefs.current.profile = el
                      }}
                      className="add_contact_section deal_inv_view_section"
                      role="tabpanel"
                      id="add-inv-panel-profile"
                      aria-labelledby="add-inv-tab-profile"
                    >
                      <h3 className="deal_inv_view_section_label">Profile</h3>
                      <div className="add_contact_name_grid deals_add_inv_profile_section_grid">
                        <InvFormField
                          id="add-inv-profile"
                          label="Profile"
                          Icon={IdCard}
                          tight
                        >
                          <DropdownSelect
                            {...MODAL_DROPDOWN_SELECT_PROPS}
                            id="add-inv-profile"
                            options={INVESTOR_PROFILE_SELECT_OPTIONS.map((o) => ({
                              value: o.value,
                              label: o.label,
                            }))}
                            value={form.profileId}
                            onChange={(v) => patch({ profileId: v })}
                            placeholder="Select profile"
                            ariaLabel="Profile"
                            ariaDescribedBy="add-inv-profile-hint"
                            triggerClassName={DROPDOWN_TRIGGER_PILL}
                          />
                        </InvFormField>
                      </div>
                      <p
                        id="add-inv-profile-hint"
                        className="deals_add_inv_section_hint"
                        role="note"
                      >
                        Used for investor identity and invitation email context when
                        you notify them about being added to the deal.
                      </p>
                    </section>
                ) : null}

                <section
                  ref={(el) => {
                    sectionRefs.current.investment = el
                  }}
                  className={[
                    "add_contact_section",
                    isInvestorEntry ? "deal_inv_view_section" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role={isInvestorEntry ? "tabpanel" : undefined}
                  id={isInvestorEntry ? "add-inv-panel-investment" : undefined}
                  aria-labelledby={
                    isInvestorEntry ? "add-inv-tab-investment" : undefined
                  }
                >
                  {isInvestorEntry ? (
                    <h3 className="deal_inv_view_section_label">Investment</h3>
                  ) : (
                    <p
                      className="add_contact_section_eyebrow add_contact_section_eyebrow_spaced"
                    >
                      Investment details
                    </p>
                  )}
                  <div className="add_contact_name_grid">
                    <InvFormField
                      id="add-inv-role"
                      label="Role"
                      Icon={Shield}
                      tight
                    >
                      {isInvestorEntry || isGpEntry ? (
                        <input
                          id="add-inv-role"
                          type="text"
                          readOnly
                          className="deals_add_inv_field_pill deals_lp_inv_role_readonly"
                          value={
                            isGpEntry
                              ? GENERAL_PARTNER_ROLE_LABEL
                              : LP_INVESTORS_ROLE_LABEL
                          }
                          aria-readonly="true"
                          aria-label="Role"
                        />
                      ) : (
                        <DropdownSelect
                          {...MODAL_DROPDOWN_SELECT_PROPS}
                          id="add-inv-role"
                          options={investorRoleDropdownOptions}
                          value={form.investorRole}
                          onChange={(v) => {
                            if (
                              leadSponsorContactId &&
                              form.contactId.trim() === leadSponsorContactId &&
                              isAdminSponsorOrCoSponsorRole(v)
                            ) {
                              toast.error(
                                "This person is already Lead Sponsor on this deal. They cannot also be Admin sponsor or Co-sponsor.",
                              )
                              return
                            }
                            patch({ investorRole: v })
                          }}
                          placeholder="Select role"
                          ariaLabel="Role"
                          triggerClassName={DROPDOWN_TRIGGER_PILL}
                        />
                      )}
                    </InvFormField>
                     {/* <InvFormField id="add-inv-status" label="Status" Icon={Activity}>
                    <DropdownSelect
                      id="add-inv-status"
                      options={INVESTMENT_STATUS_SELECT_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      value={form.status}
                      onChange={(v) => patch({ status: v })}
                      placeholder="Select status"
                      ariaLabel="Status"
                      triggerClassName={DROPDOWN_TRIGGER_PILL}
                    />
                  </InvFormField> */}
                  </div>

                  {showInvestorClassField ? (
                    <InvFormField
                      id="add-inv-class"
                      label={
                        isGpEntry ? "General partner class" : "Investor class"
                      }
                      Icon={Tag}
                      labelSuffix={
                        isInvestorEntry && noDealClasses ? (
                          <span className="deals_add_inv_label_info">
                            <InfoIconPanel
                              ariaLabel="More information: Investor class"
                              infoContent={INVESTOR_CLASS_UNAVAILABLE_HINT}
                            />
                          </span>
                        ) : null
                      }
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-class"
                        options={investorClassOptions.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        value={form.investorClass}
                        disabled={
                          !investorClassesReady || dealClasses.length === 0
                        }
                        onChange={(v) => patch({ investorClass: v })}
                        placeholder={
                          isGpEntry
                            ? "Select general partner class"
                            : "Select investor class"
                        }
                        ariaLabel={
                          isGpEntry
                            ? "General partner class"
                            : "Investor class"
                        }
                        ariaDescribedBy={
                          isInvestorEntry && noDealClasses
                            ? "add-inv-class-hint"
                            : undefined
                        }
                        triggerClassName={DROPDOWN_TRIGGER_PILL}
                      />
                      {isInvestorEntry && noDealClasses ? (
                        <p id="add-inv-class-hint" className="visually_hidden">
                          {INVESTOR_CLASS_UNAVAILABLE_HINT}
                        </p>
                      ) : null}
                    </InvFormField>
                  ) : null}
                  {/* Deal Members: investor class is not collected here (assigned via Offering / investor flows). */}

                  {showClassPercentFields ? (
                    <div className="add_contact_name_grid">
                      <InvFormField
                        id="add-inv-pct-ownership"
                        label="Percent of class (ownership)"
                        tight
                      >
                        <input
                          id="add-inv-pct-ownership"
                          type="text"
                          className="deals_add_inv_field_pill"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={form.percentOfClassOwnership ?? ""}
                          onChange={(e) => {
                            const next = formatPercentTypeInputBare(
                              e.target.value,
                              100,
                            )
                            const prevOwnership =
                              form.percentOfClassOwnership ?? ""
                            const dist = form.percentOfClassDistributions ?? ""
                            const mirror =
                              !sanitizePercentTypingInput(dist) ||
                              percentValuesEqual(dist, prevOwnership)
                            patch({
                              percentOfClassOwnership: next,
                              ...(mirror
                                ? { percentOfClassDistributions: next }
                                : {}),
                            })
                          }}
                          onBlur={(e) => {
                            const next = blurFormatPercentClamped(
                              e.target.value,
                            )
                            const prevOwnership =
                              form.percentOfClassOwnership ?? ""
                            const dist = form.percentOfClassDistributions ?? ""
                            const mirror =
                              !sanitizePercentTypingInput(dist) ||
                              percentValuesEqual(dist, prevOwnership)
                            patch({
                              percentOfClassOwnership: next,
                              ...(mirror
                                ? { percentOfClassDistributions: next }
                                : {}),
                            })
                          }}
                          aria-label="Percent of class (ownership)"
                        />
                      </InvFormField>

                      <InvFormField
                        id="add-inv-pct-distributions"
                        label="Percent of class (distributions)"
                        tight
                      >
                        <input
                          id="add-inv-pct-distributions"
                          type="text"
                          className="deals_add_inv_field_pill"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={form.percentOfClassDistributions ?? ""}
                          onChange={(e) =>
                            patch({
                              percentOfClassDistributions:
                                formatPercentTypeInputBare(e.target.value, 100),
                            })
                          }
                          onBlur={(e) =>
                            patch({
                              percentOfClassDistributions:
                                blurFormatPercentClamped(e.target.value),
                            })
                          }
                          aria-label="Percent of class (distributions)"
                        />
                      </InvFormField>
                    </div>
                  ) : null}

                  {isInvestorEntry ? (
                    <div className="add_contact_name_grid">
                      <InvFormField
                        id="add-inv-entity-ownership"
                        label="Entity Ownership"
                        Icon={Percent}
                        tight
                      >
                        <input
                          id="add-inv-entity-ownership"
                          type="text"
                          className="deals_add_inv_field_pill"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={form.entityOwnershipPercent ?? ""}
                          onChange={(e) =>
                            patch({
                              entityOwnershipPercent: formatPercentTypeInputBare(
                                e.target.value,
                                100,
                              ),
                            })
                          }
                          onBlur={(e) =>
                            patch({
                              entityOwnershipPercent: blurFormatPercentClamped(
                                e.target.value,
                              ),
                            })
                          }
                          aria-label="Entity Ownership"
                        />
                      </InvFormField>

                      <InvFormField
                        id="add-inv-distribution-allocation"
                        label="Distribution Allocation %"
                        Icon={Percent}
                        tight
                      >
                        <input
                          id="add-inv-distribution-allocation"
                          type="text"
                          className="deals_add_inv_field_pill"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={form.distributionAllocationPercent ?? ""}
                          onChange={(e) =>
                            patch({
                              distributionAllocationPercent:
                                formatPercentTypeInputBare(e.target.value, 100),
                            })
                          }
                          onBlur={(e) =>
                            patch({
                              distributionAllocationPercent:
                                blurFormatPercentClamped(e.target.value),
                            })
                          }
                          aria-label="Distribution Allocation %"
                        />
                      </InvFormField>
                    </div>
                  ) : null}

                  {isInvestorEntry ? (
                    <div className="add_contact_name_grid">
                      <InvFormField
                        id="add-inv-doc-date"
                        label="Doc signed date"
                        Icon={Calendar}
                        tight
                      >
                        <input
                          id="add-inv-doc-date"
                          type="date"
                          className="deals_add_inv_field_pill"
                          value={form.docSignedDate}
                          onChange={(e) =>
                            patch({ docSignedDate: e.target.value })
                          }
                          aria-label="Document signed date"
                        />
                      </InvFormField>

                      <InvFormField
                        id="add-inv-commitment"
                        label="Commitment amount"
                        Icon={DollarSign}
                        tight
                      >
                        <input
                          id="add-inv-commitment"
                          type="text"
                          className="deals_add_inv_field_pill"
                          placeholder="Enter amount"
                          value={form.commitmentAmount}
                          onChange={(e) =>
                            patch({
                              commitmentAmount: moneyAmountOnChange(
                                e.target.value,
                              ),
                            })
                          }
                          onBlur={(e) =>
                            patch({
                              commitmentAmount: moneyAmountOnBlur(e.target.value),
                            })
                          }
                          aria-label="Commitment amount"
                          inputMode="decimal"
                        />
                      </InvFormField>
                    </div>
                  ) : null}
                  {/*
                    Add Member: Doc signed date + Commitment amount commented out — form state
                    still submits empty strings; API unchanged.
                    <div className="add_contact_name_grid">
                      <InvFormField id="add-inv-doc-date" label="Doc signed date" ... />
                      <InvFormField id="add-inv-commitment" label="Commitment amount" ... />
                    </div>
                  */}

                  <div className="um_field">
                    <div
                      className="um_field_label_row"
                      id="add-inv-send-invite-label"
                    >
                      <Mail
                        className="um_field_label_icon"
                        size={17}
                        aria-hidden
                      />
                      <span className="mail_text_label">
                        {isInvestorEntry
                          ? "Would you like to notify the investor about their addition to the deal?"
                          : isGpEntry
                            ? "Would you like to notify the team member about their addition to the deal?"
                            : "Would you like to notify the general partner about their addition to the deal?"}
                      </span>
                      {dealBlocksInvitationEmails ? (
                        <span className="deals_add_inv_label_info">
                          <InfoIconPanel
                            ariaLabel="More information: Invitation emails"
                            infoContent={
                              isInvestorEntry ? (
                                <>
                                  Invitation emails are unavailable while required
                                  deal details are incomplete. Complete the deal
                                  details before sending invitations. You can still
                                  choose <strong>No</strong> below.
                                </>
                              ) : (
                                <>
                                  Invitation emails are unavailable while the deal is
                                  in draft or required deal details are incomplete.
                                  Finalize the deal before sending invitations. You
                                  can still choose <strong>No</strong> below.
                                </>
                              )
                            }
                          />
                        </span>
                      ) : null}
                    </div>
                    {dealBlocksInvitationEmails ? (
                      <p id="add-inv-send-invite-hint" className="visually_hidden">
                        {isInvestorEntry
                          ? INVITATION_EMAILS_UNAVAILABLE_HINT_INVESTOR
                          : INVITATION_EMAILS_UNAVAILABLE_HINT_MEMBER}
                      </p>
                    ) : null}
                    <div className="portal_yesno_field_block">
                      <YesNoCardRadioGroup
                        name="add-inv-send-invitation"
                        value={form.sendInvitationMail}
                        onChange={(v) => patch({ sendInvitationMail: v })}
                        yesIsCommon
                        variant="mail"
                        disabled={dealBlocksInvitationEmails}
                        ariaLabelledBy="add-inv-send-invite-label"
                        ariaDescribedBy={
                          dealBlocksInvitationEmails
                            ? "add-inv-send-invite-hint"
                            : undefined
                        }
                      />
                    </div>
                  </div>
{/* 
                  {form.extraContributionAmounts.map((amt, idx) => (
                    <InvFormField
                      key={idx}
                      id={`add-inv-extra-${idx}`}
                      label={`Additional contribution ${idx + 1}`}
                      Icon={DollarSign}
                    >
                      <input
                        id={`add-inv-extra-${idx}`}
                        type="text"
                        className="deals_add_inv_field_pill"
                        placeholder="Enter amount"
                        value={amt}
                        onChange={(e) => {
                          const next = [...form.extraContributionAmounts]
                          next[idx] = e.target.value
                          patch({ extraContributionAmounts: next })
                        }}
                        onBlur={(e) => {
                          const next = [...form.extraContributionAmounts]
                          next[idx] = blurFormatMoneyInput(e.target.value)
                          patch({ extraContributionAmounts: next })
                        }}
                        aria-label={`Additional contribution ${idx + 1}`}
                        inputMode="decimal"
                      />
                    </InvFormField>
                  ))}
                  <div className="deals_add_inv_add_row">
                    <button
                      type="button"
                      className="um_btn_secondary"
                      onClick={handleAddContribution}
                      disabled={submitting}
                    >
                      + Add contribution
                    </button>
                  </div> */}
                </section>
              </>
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
            <div className="add_contact_modal_actions_trailing">
              <button
                type="submit"
                className="um_btn_primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={16}
                      strokeWidth={2}
                      className="add_contact_modal_btn_spin"
                      aria-hidden
                    />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus size={16} strokeWidth={2} aria-hidden />
                    Add
                  </>
                )}
              </button>
            </div>
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
    <ExtraCompanyUserPayModal
      payload={extraUserPayment}
      onClose={() => {
        setExtraUserPayment(null)
        pendingSaveAfterExtraPayRef.current = null
      }}
      onPaid={() => {
        setExtraUserPayment(null)
        toast.success("Extra company user paid", "Saving the team member…")
        pendingSaveAfterExtraPayRef.current = null
        void performSave()
      }}
    />
    </>
  )
}
