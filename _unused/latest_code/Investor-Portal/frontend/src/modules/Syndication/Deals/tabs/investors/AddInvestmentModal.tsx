import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ArrowLeft,
  Briefcase,
  Calendar,
  ChevronRight,
  DollarSign,
  IdCard,
  Loader2,
  Plus,
  Save,
  Shield,
  Tag,
  Upload,
  UserRound,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import type { ReactNode } from "react"
import { toast } from "../../../../../common/components/Toast"
import {
  DropdownSelect,
  MODAL_DROPDOWN_SELECT_PROPS,
  type DropdownSelectSection,
} from "../../../../../common/components/dropdown-select"
import { AddContactPanel } from "../../../contacts/components/AddContactPanel"
import { createContact, fetchContacts } from "../../../contacts/api/contactsApi"
import type { ContactRow } from "../../../contacts/types/contact.types"
import {
  fetchDealInvestorClasses,
  fetchUsersForMemberSelect,
} from "../../api/dealsApi"
import { MEMBER_SELECT_OPTIONS } from "../../constants/member-options"
import { INVESTMENT_STATUS_SELECT_OPTIONS } from "../../constants/investment-status"
import { INVESTOR_PROFILE_SELECT_OPTIONS } from "../../constants/investor-profile"
import { INVESTOR_ROLE_SELECT_OPTIONS } from "../../constants/investor-profile"

import type { AddInvestmentFormValues } from "../../types/add-investment.types"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"
import { rowDisplayName } from "../../../usermanagement/memberAdminShared"
import {
  moneyAmountOnBlur,
  moneyAmountOnChange,
} from "../../utils/offeringMoneyFormat"
import { InfoIconPanel } from "../offering_details/FieldInfoHeading"
import "../../../contacts/contacts.css"
import "../../../usermanagement/user_management.css"
import "./add-investment-modal.css"

const INVESTOR_CLASS_UNAVAILABLE_HINT =
  "Please complete the Classes section to assign an investor class."

const PREFIX_CONTACT = "contact:"
const PREFIX_USER = "user:"

const DROPDOWN_TRIGGER_PILL =
  "um_field_select deals_add_inv_field_control deals_add_inv_field_pill"

function contactOptionLabel(c: ContactRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
  if (name && c.email.trim()) return `${name} — ${c.email.trim()}`
  if (c.email.trim()) return c.email.trim()
  return name || "Contact"
}

function buildMemberLabel(u: Record<string, unknown>): string {
  const name = rowDisplayName(u)
  const email = String(u.email ?? "").trim()
  if (name && name !== "—" && email) return `${name} — ${email}`
  if (email) return email
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
  Icon: LucideIcon
  children: ReactNode
  tight?: boolean
  labelSuffix?: ReactNode
}) {
  return (
    <div className={tight ? "um_field add_contact_field_tight" : "um_field"}>
      <label htmlFor={id} className="um_field_label_row">
        <Icon className="um_field_label_icon" size={17} aria-hidden />
        <span>{label}</span>
        {labelSuffix}
      </label>
      {children}
    </div>
  )
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
    docSignedDate: "",
    commitmentAmount: "",
    extraContributionAmounts: [],
    documentFileName: null,
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
}: AddInvestmentModalProps) {
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<AddInvestmentFormValues>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [dropFocus, setDropFocus] = useState(false)
  const [subscriptionDocument, setSubscriptionDocument] =
    useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [memberRows, setMemberRows] = useState<Record<string, unknown>[]>([])
  const [contactRows, setContactRows] = useState<ContactRow[]>([])
  const [dealClasses, setDealClasses] = useState<DealInvestorClass[]>([])
  const [investorClassesReady, setInvestorClassesReady] = useState(false)
  const [investorClassOptions, setInvestorClassOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "", label: "Loading investor classes…" }])
  const [membersLoading, setMembersLoading] = useState(false)
  const [addContactModalOpen, setAddContactModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  useEffect(() => {
    if (open) setStep(1)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && initialValues) {
      setForm({ ...emptyForm(), ...initialValues })
      setError(null)
      setSubscriptionDocument(null)
      return
    }
    setForm({ ...emptyForm(), offeringId: "primary" })
    setError(null)
    setSubscriptionDocument(null)
  }, [open, mode, initialValues])

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
      setDealClasses(classes)

      if (classes.length > 0) {
        setInvestorClassOptions([
          { value: "", label: "Select investor class" },
          ...classes.map((row) => ({
            value: row.id,
            label: row.name.trim() || "Unnamed class",
          })),
        ])
      } else {
        setInvestorClassOptions([
          { value: "", label: "No investor classes defined" },
        ])
        setForm((prev) => ({ ...prev, investorClass: "" }))
      }

      setInvestorClassesReady(true)
      setMembersLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, dealId])

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
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
    [contactRows, memberRows, patch],
  )

  const memberSelectValue = useMemo(() => {
    const id = form.contactId.trim()
    if (!id) return ""
    if (contactRows.some((c) => c.id === id))
      return `${PREFIX_CONTACT}${id}`
    if (memberRows.some((u) => String(u.id) === id))
      return `${PREFIX_USER}${id}`
    if (MEMBER_SELECT_OPTIONS.some((o) => o.value === id))
      return `${PREFIX_USER}${id}`
    return id
  }, [form.contactId, contactRows, memberRows])

  const memberDropdownSections = useMemo((): DropdownSelectSection[] => {
    const sections: DropdownSelectSection[] = []
    if (contactRows.length > 0) {
      sections.push({
        heading: "Contacts",
        options: contactRows.map((c) => ({
          value: `${PREFIX_CONTACT}${c.id}`,
          label: contactOptionLabel(c),
        })),
      })
    }
    if (memberRows.length > 0) {
      sections.push({
        heading: "Directory members",
        options: memberRows
          .map((u) => memberOptionFromUser(u))
          .filter((o): o is { value: string; label: string } => Boolean(o))
          .map((o) => ({
            value: `${PREFIX_USER}${o.value}`,
            label: o.label,
          })),
      })
    }
    return sections
  }, [contactRows, memberRows])

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
        `${namePart} is selected for this investment.`,
      )
    },
    [patch],
  )

  const handleAddContactSave = useCallback(
    async (contact: Omit<ContactRow, "id" | "createdByDisplayName">) => {
      const created = await createContact(contact)
      handleContactCreated(created)
    },
    [handleContactCreated],
  )

  function handleFileChange(file: File | null) {
    setSubscriptionDocument(file)
    if (!file) {
      patch({ documentFileName: null })
      return
    }
    patch({ documentFileName: file.name })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropFocus(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileChange(f)
  }

  const noDealClasses =
    investorClassesReady && dealClasses.length === 0

  function validateInvestmentStep1(): boolean {
    if (!form.offeringId.trim()) {
      setError("Select an offering.")
      return false
    }
    if (!form.contactId.trim()) {
      setError("Select a member.")
      return false
    }
    if (!investorClassesReady) {
      setError("Loading investor classes…")
      return false
    }
    if (noDealClasses) {
      setError(
        "Add at least one investor class in the Classes section before recording an investment.",
      )
      return false
    }
    if (!form.investorClass.trim()) {
      setError("Select an investor class.")
      return false
    }
    if (!dealClasses.some((c) => c.id === form.investorClass.trim())) {
      setError("Select a valid investor class from this deal.")
      return false
    }
    if (!form.commitmentAmount.trim()) {
      setError("Enter a commitment amount.")
      return false
    }
    return true
  }

  async function performSave() {
    setError(null)
    if (!validateInvestmentStep1()) {
      setStep(1)
      return
    }
    setSubmitting(true)
    try {
      await onSave(form, subscriptionDocument)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save. Try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (step === 1) {
      if (validateInvestmentStep1()) setStep(2)
      return
    }
    void performSave()
  }

  function handleAddContribution() {
    setForm((prev) => ({
      ...prev,
      extraContributionAmounts: [...prev.extraContributionAmounts, ""],
    }))
  }

  if (!open) return null

  return (
    <>
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
      role="presentation"
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head add_contact_modal_head">
          <div className="add_contact_modal_head_main">
            <h3 id={titleId} className="um_modal_title add_contact_modal_title">
              {mode === "edit" ? "Edit investment" : "Add investment"}
            </h3>
            <div
              className="add_contact_stepper"
              role="group"
              aria-label="Progress"
            >
              <div
                className={
                  step === 1
                    ? "add_contact_step_node add_contact_step_node_active"
                    : "add_contact_step_node add_contact_step_node_done"
                }
              >
                <span
                  className="add_contact_step_dot"
                  aria-current={step === 1 ? "step" : undefined}
                >
                  1
                </span>
                <span className="add_contact_step_label">Details</span>
              </div>
              <span
                className={
                  step === 2
                    ? "add_contact_step_line add_contact_step_line_active"
                    : "add_contact_step_line"
                }
                aria-hidden
              />
              <div
                className={
                  step === 2
                    ? "add_contact_step_node add_contact_step_node_active"
                    : "add_contact_step_node"
                }
              >
                <span className="add_contact_step_dot">2</span>
                <span className="add_contact_step_label">Documents</span>
              </div>
            </div>
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
          className="deals_add_inv_modal_form"
          onSubmit={handleFormSubmit}
          noValidate
        >
          <div className="deals_add_inv_modal_scroll">
            {error ? (
              <p className="um_msg_error um_modal_form_error" role="alert">
                {error}
              </p>
            ) : null}

            {step === 1 ? (
              <>
                <div className="add_contact_section">
                  <div className="add_contact_name_grid">
                    <InvFormField
                      id="add-inv-offering"
                      label="Select offering"
                      Icon={Briefcase}
                      tight
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-offering"
                        options={offeringOptions}
                        value={form.offeringId}
                        onChange={(v) => patch({ offeringId: v })}
                        placeholder="Select offering"
                        ariaLabel="Select offering"
                        triggerClassName={DROPDOWN_TRIGGER_PILL}
                      />
                    </InvFormField>

                    <InvFormField
                      id="add-inv-member"
                      label="Member"
                      Icon={UserRound}
                      tight
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-member"
                        sections={memberDropdownSections}
                        value={memberSelectValue}
                        disabled={membersLoading}
                        onChange={(v) => patchMemberById(v)}
                        placeholder={
                          membersLoading
                            ? "Loading contacts and members…"
                            : "Select member or contact"
                        }
                        ariaLabel="Member or contact"
                        header={{
                          label: "+ Add Contact",
                          onClick: () => setAddContactModalOpen(true),
                        }}
                        triggerClassName={DROPDOWN_TRIGGER_PILL}
                      />
                    </InvFormField>
                  </div>
                </div>

                <hr className="add_contact_section_rule" />

                <div className="add_contact_section">
                  <div className="add_contact_name_grid">
                    <InvFormField
                      id="add-inv-profile"
                      label="Profile"
                      Icon={IdCard}
                      tight
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-profile"
                        options={INVESTOR_PROFILE_SELECT_OPTIONS.filter(
                          (o) => o.value,
                        ).map((o) => ({ value: o.value, label: o.label }))}
                        value={form.profileId}
                        onChange={(v) => patch({ profileId: v })}
                        placeholder="Select"
                        ariaLabel="Profile"
                        triggerClassName={DROPDOWN_TRIGGER_PILL}
                      />
                    </InvFormField>

                    <InvFormField
                      id="add-inv-role"
                      label="Role"
                      Icon={Shield}
                      tight
                    >
                      <DropdownSelect
                        {...MODAL_DROPDOWN_SELECT_PROPS}
                        id="add-inv-role"
                        options={INVESTOR_ROLE_SELECT_OPTIONS.filter(
                          (o) => o.value,
                        ).map((o) => ({ value: o.value, label: o.label }))}
                        value={form.investorRole}
                        onChange={(v) => patch({ investorRole: v })}
                        placeholder="Select"
                        ariaLabel="Role"
                        triggerClassName={DROPDOWN_TRIGGER_PILL}
                      />
                    </InvFormField>
                  </div>

                  <InvFormField id="add-inv-status" label="Status" Icon={Activity}>
                    <DropdownSelect
                      {...MODAL_DROPDOWN_SELECT_PROPS}
                      id="add-inv-status"
                      options={INVESTMENT_STATUS_SELECT_OPTIONS.filter(
                        (o) => o.value,
                      ).map((o) => ({ value: o.value, label: o.label }))}
                      value={form.status}
                      onChange={(v) => patch({ status: v })}
                      placeholder="Select status"
                      ariaLabel="Status"
                      triggerClassName={DROPDOWN_TRIGGER_PILL}
                    />
                  </InvFormField>

                  <InvFormField
                    id="add-inv-class"
                    label="Investor class"
                    Icon={Tag}
                    labelSuffix={
                      noDealClasses ? (
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
                      options={investorClassOptions.filter((o) => o.value)}
                      value={form.investorClass}
                      disabled={
                        !investorClassesReady || dealClasses.length === 0
                      }
                      onChange={(v) => patch({ investorClass: v })}
                      placeholder={
                        !investorClassesReady
                          ? "Loading investor classes…"
                          : "Select investor class"
                      }
                      ariaLabel="Investor class"
                      ariaDescribedBy={
                        noDealClasses ? "add-inv-class-hint" : undefined
                      }
                      triggerClassName={DROPDOWN_TRIGGER_PILL}
                    />
                    {noDealClasses ? (
                      <p id="add-inv-class-hint" className="visually_hidden">
                        {INVESTOR_CLASS_UNAVAILABLE_HINT}
                      </p>
                    ) : null}
                  </InvFormField>

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
                        placeholder="Enter amount"
                        value={form.commitmentAmount}
                        onChange={(e) =>
                          patch({
                            commitmentAmount: moneyAmountOnChange(e.target.value),
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
                </div>
              </>
            ) : (
              <>
                <p className="add_contact_section_eyebrow add_contact_section_eyebrow_spaced">
                  Contributions &amp; document
                </p>
                <div className="add_contact_section">
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
                        placeholder="Enter amount"
                        value={amt}
                        onChange={(e) => {
                          const next = [...form.extraContributionAmounts]
                          next[idx] = moneyAmountOnChange(e.target.value)
                          patch({ extraContributionAmounts: next })
                        }}
                        onBlur={(e) => {
                          const next = [...form.extraContributionAmounts]
                          next[idx] = moneyAmountOnBlur(e.target.value)
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
                      <Plus size={16} strokeWidth={2} aria-hidden />
                      Add contribution
                    </button>
                  </div>

                  <div className="um_field deals_add_inv_doc_field">
                    <div className="um_field_label_row">
                      <Upload
                        className="um_field_label_icon"
                        size={17}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span id="add-inv-doc-label">
                        Signed subscription document
                      </span>
                    </div>
                    <input
                      ref={fileInputRef}
                      id="add-inv-doc-file"
                      type="file"
                      className="visually_hidden"
                      tabIndex={-1}
                      aria-labelledby="add-inv-doc-label"
                      onChange={(e) =>
                        handleFileChange(e.target.files?.[0] ?? null)
                      }
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      className={`deals_add_inv_dropzone deals_add_inv_dropzone_compact${dropFocus ? " deals_add_inv_dropzone_focus" : ""}`}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          fileInputRef.current?.click()
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDropFocus(true)
                      }}
                      onDragLeave={() => setDropFocus(false)}
                      onDrop={handleDrop}
                    >
                      <Upload
                        className="deals_add_inv_dropzone_lead_icon"
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div className="deals_add_inv_dropzone_text">
                        <span className="deals_add_inv_dropzone_hint">
                          Drop a file or click to browse
                        </span>
                        {form.documentFileName ? (
                          <span className="deals_add_inv_file_name">
                            {form.documentFileName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
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
              {step === 2 ? (
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                >
                  <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                  Back
                </button>
              ) : null}
              {step === 1 ? (
                <button type="submit" className="um_btn_primary">
                  Next
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              ) : (
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
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save size={16} strokeWidth={2} aria-hidden />
                      Save
                    </>
                  )}
                </button>
              )}
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
    </>
  )
}
