import {
  ArrowLeft,
  ChevronRight,
  FileText,
  List,
  Loader2,
  Mail,
  PenLine,
  Phone,
  Save,
  Search,
  Tag,
  User,
  Users,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SetStateAction,
} from "react"
import { UsPhoneInput } from "../../../../common/components/UsPhoneInput"
import {
  isValidUsNanp10,
  national10ToE164,
  nationalDigitsFromStoredPhone,
  nationalTenDigitsFromRawInput,
} from "../../../../common/phone/usPhoneNumber"
import { focusFirstFormErrorAfterUpdate, scrollMultiStepFormToTopAfterUpdate } from "../../../../common/utils/scrollToFirstFormError"
import { fetchMyProfile } from "../../../myaccount/accountApi"
import { getSessionUserDisplayName } from "../../../../common/auth/sessionUserDisplayName"
import type { ContactRow } from "../types/contact.types"
import "../../Deals/tabs/deal_members/add-investment/add_deal_modal.css"
import "../../usermanagement/user_management.css"
import "../contacts.css"

type AddContactPanelProps = {
  open: boolean
  onClose: () => void
  onSave: (contact: Omit<ContactRow, "id" | "createdByDisplayName">) => void | Promise<void>
  /** When set, panel edits this contact and calls `onUpdate` on save. */
  contactToEdit?: ContactRow | null
  onUpdate?: (
    id: string,
    contact: Omit<ContactRow, "id" | "createdByDisplayName">,
    editReason: string,
  ) => void | Promise<void>
  /** Contacts visible for this company (same list as the table); used to enforce unique email and phone within the company before save. */
  existingContacts?: ContactRow[]
  /**
   * Tag / list names from the Tags & Lists tabs (including unused catalog entries).
   * Merged into searchable dropdowns so pre-created labels appear when searching.
   */
  catalogTagNames?: string[] | undefined
  catalogListNames?: string[] | undefined
}

const NO_CATALOG_NAMES: string[] = []

function defaultOwnerChips(): string[] {
  const n = getSessionUserDisplayName().trim()
  return n ? [n] : ["User"]
}

function displayNameFromProfileUser(u: Record<string, unknown>): string {
  const first = String(u.firstName ?? "").trim()
  const last = String(u.lastName ?? "").trim()
  const full = [first, last].filter(Boolean).join(" ")
  if (full) return full
  const email = String(u.email ?? "").trim()
  if (email) return email
  const username = String(u.username ?? "").trim()
  if (username) return username
  return ""
}

function normalizeEmailForCompare(s: string): string {
  return String(s).trim().toLowerCase()
}

/** ASCII-oriented check suitable for CRM sign-up style addresses (not full RFC 5322). */
function isValidEmailFormat(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (s.length > 254) return false
  const parts = s.split("@")
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || local.length > 64 || !domain || domain.length > 253) return false
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false
  }
  if (!domain.includes(".")) return false
  if (
    !/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return false
  }
  const labels = domain.split(".")
  for (const label of labels) {
    if (
      !label ||
      label.length > 63 ||
      !/^[a-zA-Z0-9-]+$/.test(label) ||
      label.startsWith("-") ||
      label.endsWith("-")
    ) {
      return false
    }
  }
  const tld = labels[labels.length - 1] ?? ""
  return tld.length >= 2 && /[a-zA-Z]/.test(tld)
}

function ChipRow({
  items,
  onRemove,
  ariaLabel,
  className,
}: {
  items: string[]
  onRemove: (index: number) => void
  ariaLabel: string
  className?: string
}) {
  if (items.length === 0) return null
  return (
    <div
      className={["contacts_chip_row", className].filter(Boolean).join(" ")}
      role="list"
      aria-label={ariaLabel}
    >
      {items.map((t, i) => (
        <span key={`${t}-${i}`} className="contacts_chip" role="listitem">
          <span className="contacts_chip_label">{t}</span>
          <button
            type="button"
            className="contacts_chip_remove"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${t}`}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </span>
      ))}
    </div>
  )
}

function mergeUniqueStringsFromContacts(
  existingContacts: ContactRow[],
  field: "tags" | "lists",
  currentSelection: string[],
): string[] {
  const byLower = new Map<string, string>()
  for (const c of existingContacts) {
    for (const raw of c[field]) {
      const t = raw.trim()
      if (!t) continue
      const lk = t.toLowerCase()
      if (!byLower.has(lk)) byLower.set(lk, t)
    }
  }
  for (const raw of currentSelection) {
    const t = raw.trim()
    if (!t) continue
    const lk = t.toLowerCase()
    if (!byLower.has(lk)) byLower.set(lk, t)
  }
  return Array.from(byLower.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )
}

/** Union of catalog names and contact-derived pool (deduped by case-insensitive key). */
function mergeCatalogIntoOptionPool(
  fromContacts: string[],
  catalogNames: string[],
): string[] {
  const byLower = new Map<string, string>()
  for (const raw of catalogNames) {
    const t = raw.trim()
    if (!t) continue
    const lk = t.toLowerCase()
    if (!byLower.has(lk)) byLower.set(lk, t)
  }
  for (const raw of fromContacts) {
    const t = raw.trim()
    if (!t) continue
    const lk = t.toLowerCase()
    if (!byLower.has(lk)) byLower.set(lk, t)
  }
  return Array.from(byLower.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )
}

type SearchableMultiSelectFieldProps = {
  label: string
  Icon: LucideIcon
  inputId: string
  listboxId: string
  selected: string[]
  onToggle: (canonicalValue: string) => void
  onAddUnique: (value: string) => void
  options: string[]
  search: string
  onSearchChange: (s: string) => void
  open: boolean
  onOpenChange: (next: boolean) => void
  fieldRef: RefObject<HTMLDivElement | null>
  placeholder: string
  emptyHint: string
  onFocusOpen: () => void
}

function SearchableMultiSelectField({
  label,
  Icon,
  inputId,
  listboxId,
  selected,
  onToggle,
  onAddUnique,
  options,
  search,
  onSearchChange,
  open,
  onOpenChange,
  fieldRef,
  placeholder,
  emptyHint,
  onFocusOpen,
}: SearchableMultiSelectFieldProps) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, search])

  const qTrim = search.trim()
  const exactInPool = options.some((o) => o.toLowerCase() === qTrim.toLowerCase())
  const showCreate = qTrim.length > 0 && !exactInPool

  useEffect(() => {
    if (!open) return
    function onPtr(e: PointerEvent) {
      const el = fieldRef.current
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return
      onOpenChange(false)
    }
    document.addEventListener("pointerdown", onPtr, true)
    return () => document.removeEventListener("pointerdown", onPtr, true)
  }, [open, onOpenChange, fieldRef])

  function itemSelected(name: string) {
    return selected.some((t) => t.toLowerCase() === name.toLowerCase())
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (!qTrim) return
      if (showCreate) {
        onAddUnique(qTrim)
        onSearchChange("")
        return
      }
      const exact = options.find((o) => o.toLowerCase() === qTrim.toLowerCase())
      onAddUnique(exact ?? qTrim)
      onSearchChange("")
    }
    if (e.key === "Escape") {
      e.preventDefault()
      onOpenChange(false)
    }
  }

  return (
    <div className="um_field add_contact_multiselect_field" ref={fieldRef}>
      <label htmlFor={inputId} className="um_field_label_row">
        <Icon className="um_field_label_icon" size={17} strokeWidth={2} aria-hidden />
        <span>{label}</span>
      </label>
      <ChipRow
        items={selected}
        onRemove={(i) => onToggle(selected[i] ?? "")}
        ariaLabel={`Selected ${label.toLowerCase()}`}
      />
      <div className="add_contact_multiselect_dropdown_wrap">
        <div className="add_contact_multiselect_control">
          <Search
            className="add_contact_multiselect_search_icon"
            size={18}
            strokeWidth={2}
            aria-hidden
          />
          <input
            id={inputId}
            type="search"
            className="add_contact_multiselect_search_input deals_add_inv_input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            placeholder={placeholder}
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value)
              onOpenChange(true)
            }}
            onFocus={() => {
              onFocusOpen()
              onOpenChange(true)
            }}
            onKeyDown={handleSearchKeyDown}
            autoComplete="off"
          />
        </div>
        {open ? (
          <div
            id={listboxId}
            className="add_contact_multiselect_panel"
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
          >
            {showCreate ? (
              <button
                type="button"
                className="add_contact_multiselect_create"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAddUnique(qTrim)
                  onSearchChange("")
                }}
              >
                Create &quot;{qTrim}&quot;
              </button>
            ) : null}
            {filtered.length === 0 && !showCreate ? (
              <p className="add_contact_multiselect_empty">{emptyHint}</p>
            ) : null}
            {filtered.map((opt) => {
              const checked = itemSelected(opt)
              return (
                <label
                  key={opt}
                  className="add_contact_multiselect_row"
                  role="option"
                  aria-selected={checked}
                >
                  <input
                    type="checkbox"
                    className="add_contact_multiselect_checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt)}
                  />
                  <span className="add_contact_multiselect_row_label">{opt}</span>
                </label>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AddContactPanel({
  open,
  onClose,
  onSave,
  contactToEdit = null,
  onUpdate,
  existingContacts = [],
  catalogTagNames,
  catalogListNames,
}: AddContactPanelProps) {
  const catalogTagPool = catalogTagNames ?? NO_CATALOG_NAMES
  const catalogListPool = catalogListNames ?? NO_CATALOG_NAMES
  const titleId = useId()
  const tagListboxId = useId()
  const listListboxId = useId()
  const tagFieldRef = useRef<HTMLDivElement>(null)
  const listFieldRef = useRef<HTMLDivElement>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [lists, setLists] = useState<string[]>([])
  const [owners, setOwners] = useState<string[]>(() => defaultOwnerChips())
  const [tagInput, setTagInput] = useState("")
  const [listInput, setListInput] = useState("")
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [listPickerOpen, setListPickerOpen] = useState(false)
  const [ownerInput, setOwnerInput] = useState("")
  const ownerComboboxRef = useRef<HTMLInputElement>(null)
  const contactFormRef = useRef<HTMLFormElement>(null)
  const stepScrollBootRef = useRef(true)
  const [editReason, setEditReason] = useState("")
  const [fieldError, setFieldError] = useState<{
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    editReason?: string
  }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  const reset = useCallback(() => {
    setFirstName("")
    setLastName("")
    setEmail("")
    setPhone("")
    setNote("")
    setTags([])
    setLists([])
    setOwners([])
    setTagInput("")
    setListInput("")
    setTagPickerOpen(false)
    setListPickerOpen(false)
    setOwnerInput("")
    setEditReason("")
    setFieldError({})
    setSubmitError(null)
    setSubmitting(false)
    setStep(1)
  }, [])

  const handleCancel = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  useLayoutEffect(() => {
    if (!open) return
    if (contactToEdit) {
      setFirstName(contactToEdit.firstName)
      setLastName(contactToEdit.lastName)
      setEmail(contactToEdit.email)
      setPhone(nationalDigitsFromStoredPhone(contactToEdit.phone))
      setNote(contactToEdit.note)
      setTags([...contactToEdit.tags])
      setLists([...contactToEdit.lists])
      setOwners([...contactToEdit.owners])
      setTagInput("")
      setListInput("")
      setTagPickerOpen(false)
      setListPickerOpen(false)
      setOwnerInput("")
      setEditReason("")
      setFieldError({})
      setSubmitError(null)
      setSubmitting(false)
      setStep(1)
      stepScrollBootRef.current = true
    } else {
      reset()
    }
  }, [open, contactToEdit?.id, reset, contactToEdit])

  useEffect(() => {
    if (stepScrollBootRef.current) {
      stepScrollBootRef.current = false
      return
    }
    scrollMultiStepFormToTopAfterUpdate({ container: contactFormRef.current })
  }, [step])

  useEffect(() => {
    if (!open || contactToEdit) return
    let cancelled = false
    void (async () => {
      const profile = await fetchMyProfile()
      if (cancelled) return
      const name = profile
        ? displayNameFromProfileUser(profile).trim()
        : ""
      setOwners(name ? [name] : defaultOwnerChips())
    })()
    return () => {
      cancelled = true
    }
  }, [open, contactToEdit])

  const tagOptionPool = useMemo(
    () =>
      mergeCatalogIntoOptionPool(
        mergeUniqueStringsFromContacts(existingContacts, "tags", tags),
        catalogTagPool,
      ),
    [existingContacts, tags, catalogTagPool],
  )

  const listOptionPool = useMemo(
    () =>
      mergeCatalogIntoOptionPool(
        mergeUniqueStringsFromContacts(existingContacts, "lists", lists),
        catalogListPool,
      ),
    [existingContacts, lists, catalogListPool],
  )

  const toggleTagValue = useCallback((canonical: string) => {
    const t = canonical.trim()
    if (!t) return
    setTags((prev) => {
      const i = prev.findIndex((x) => x.toLowerCase() === t.toLowerCase())
      if (i >= 0) return prev.filter((_, idx) => idx !== i)
      return [...prev, t]
    })
  }, [])

  const toggleListValue = useCallback((canonical: string) => {
    const t = canonical.trim()
    if (!t) return
    setLists((prev) => {
      const i = prev.findIndex((x) => x.toLowerCase() === t.toLowerCase())
      if (i >= 0) return prev.filter((_, idx) => idx !== i)
      return [...prev, t]
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") handleCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, handleCancel])

  function addFromInput(
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) {
    const v = value.trim()
    if (!v) return
    setter((prev) => (prev.includes(v) ? prev : [...prev, v]))
  }

  function handleOwnerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      addFromInput(ownerInput, setOwners)
      setOwnerInput("")
    }
  }

  function validateStep1(): boolean {
    const err: typeof fieldError = {}
    if (!firstName.trim()) err.firstName = "This field is required."
    if (!lastName.trim()) err.lastName = "This field is required."
    if (!email.trim()) {
      err.email = "This field is required."
    } else if (!isValidEmailFormat(email)) {
      err.email = "Enter a valid email address (e.g. name@company.com)."
    } else {
      const emailNorm = normalizeEmailForCompare(email)
      const dupEmail = existingContacts.some(
        (c) =>
          c.id !== contactToEdit?.id &&
          normalizeEmailForCompare(c.email) === emailNorm,
      )
      if (dupEmail) {
        err.email =
          "This email is already used by another contact in your company."
      }
    }
    const phoneD = nationalTenDigitsFromRawInput(phone)
    if (phoneD.length > 0) {
      if (phoneD.length < 10 || !isValidUsNanp10(phoneD)) {
        err.phone =
          "Enter a valid 10-digit U.S. phone number, or leave blank."
      } else {
        const dupPhone = existingContacts.some(
          (c) =>
            c.id !== contactToEdit?.id &&
            nationalDigitsFromStoredPhone(c.phone) === phoneD,
        )
        if (dupPhone) {
          err.phone =
            "This phone number is already used by another contact in your company."
        }
      }
    }
    setFieldError(err)
    const ok = Object.keys(err).length === 0
    if (!ok) {
      focusFirstFormErrorAfterUpdate({ container: contactFormRef.current })
    }
    return ok
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    if (step === 1) {
      if (validateStep1()) setStep(2)
      return
    }
    void performSave()
  }

  async function performSave() {
    if (!validateStep1()) {
      setStep(1)
      return
    }

    setSubmitError(null)
    if (contactToEdit) {
      const er = editReason.trim()
      if (!er) {
        setFieldError((f) => ({
          ...f,
          editReason: "Enter a reason for this change.",
        }))
        focusFirstFormErrorAfterUpdate({ container: contactFormRef.current })
        return
      }
      setFieldError((f) => ({ ...f, editReason: undefined }))
    }
    setSubmitting(true)
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone:
          nationalTenDigitsFromRawInput(phone).length === 0
            ? ""
            : national10ToE164(phone) ?? "",
        note: note.trim(),
        tags: [...tags],
        lists: [...lists],
        owners: contactToEdit
          ? [...owners]
          : owners.length > 0
            ? [...owners]
            : defaultOwnerChips(),
      }
      if (contactToEdit) {
        if (!onUpdate) throw new Error("Update handler is not configured.")
        await onUpdate(contactToEdit.id, payload, editReason.trim())
      } else {
        await onSave(payload)
      }
      reset()
      onClose()
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Could not save contact. Try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
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
              {contactToEdit ? "Edit contact" : "Add contact"}
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
                <span className="add_contact_step_label">Organize</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="um_modal_close"
            onClick={handleCancel}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <form
          ref={contactFormRef}
          className="deals_add_inv_modal_form"
          onSubmit={handleFormSubmit}
          noValidate
        >
          <div className="deals_add_inv_modal_scroll">
            {submitError ? (
              <p className="um_msg_error um_modal_form_error" role="alert">
                {submitError}
              </p>
            ) : null}

            {step === 1 ? (
              <>
                <div className="add_contact_section">
                  <div className="add_contact_name_grid">
                    <div className="um_field add_contact_field_tight">
                      <label
                        htmlFor="contact-first"
                        className="um_field_label_row"
                      >
                        <User
                          className="um_field_label_icon"
                          size={17}
                          aria-hidden
                        />
                        <span>
                          First name{" "}
                          <span className="contacts_required" aria-hidden>
                            *
                          </span>
                        </span>
                      </label>
                      <input
                        id="contact-first"
                        type="text"
                        className={
                          fieldError.firstName
                            ? "um_field_input_invalid"
                            : undefined
                        }
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value)
                          if (fieldError.firstName)
                            setFieldError((f) => ({
                              ...f,
                              firstName: undefined,
                            }))
                        }}
                        autoComplete="given-name"
                        placeholder="e.g. Jordan"
                        aria-invalid={Boolean(fieldError.firstName)}
                        aria-describedby={
                          fieldError.firstName ? "contact-first-err" : undefined
                        }
                      />
                      {fieldError.firstName ? (
                        <p
                          id="contact-first-err"
                          className="um_field_hint um_field_hint_error"
                        >
                          {fieldError.firstName}
                        </p>
                      ) : null}
                    </div>

                    <div className="um_field add_contact_field_tight">
                      <label
                        htmlFor="contact-last"
                        className="um_field_label_row"
                      >
                        <User
                          className="um_field_label_icon"
                          size={17}
                          aria-hidden
                        />
                        <span>
                          Last name{" "}
                          <span className="contacts_required" aria-hidden>
                            *
                          </span>
                        </span>
                      </label>
                      <input
                        id="contact-last"
                        type="text"
                        className={
                          fieldError.lastName
                            ? "um_field_input_invalid"
                            : undefined
                        }
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value)
                          if (fieldError.lastName)
                            setFieldError((f) => ({
                              ...f,
                              lastName: undefined,
                            }))
                        }}
                        autoComplete="family-name"
                        placeholder="e.g. Lee"
                        aria-invalid={Boolean(fieldError.lastName)}
                        aria-describedby={
                          fieldError.lastName ? "contact-last-err" : undefined
                        }
                      />
                      {fieldError.lastName ? (
                        <p
                          id="contact-last-err"
                          className="um_field_hint um_field_hint_error"
                        >
                          {fieldError.lastName}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="add_contact_name_grid add_contact_contact_grid">
                    <div className="um_field add_contact_field_tight">
                      <label
                        htmlFor="contact-email"
                        className="um_field_label_row"
                      >
                        <Mail
                          className="um_field_label_icon"
                          size={17}
                          aria-hidden
                        />
                        <span>
                          Email{" "}
                          <span className="contacts_required" aria-hidden>
                            *
                          </span>
                        </span>
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        className={
                          fieldError.email ? "um_field_input_invalid" : undefined
                        }
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (fieldError.email)
                            setFieldError((f) => ({ ...f, email: undefined }))
                        }}
                        autoComplete="email"
                        placeholder="name@company.com"
                        aria-invalid={Boolean(fieldError.email)}
                        aria-describedby={
                          fieldError.email ? "contact-email-err" : undefined
                        }
                      />
                      {fieldError.email ? (
                        <p
                          id="contact-email-err"
                          className="um_field_hint um_field_hint_error"
                        >
                          {fieldError.email}
                        </p>
                      ) : null}
                    </div>

                    <div className="um_field add_contact_field_tight">
                      <label
                        htmlFor="contact-phone"
                        className="um_field_label_row"
                      >
                        <Phone
                          className="um_field_label_icon"
                          size={17}
                          aria-hidden
                        />
                        <span>Phone</span>
                      </label>
                      <UsPhoneInput
                        id="contact-phone"
                        name="phone"
                        nationalDigits={phone}
                        onNationalDigitsChange={(next) => {
                          setPhone(next)
                          if (fieldError.phone)
                            setFieldError((f) => ({ ...f, phone: undefined }))
                        }}
                        className="um_field_input"
                        invalidClassName="um_field_input_invalid"
                        autoComplete="tel"
                        aria-invalid={Boolean(fieldError.phone)}
                        error={fieldError.phone ?? null}
                      />
                    </div>
                  </div>
                </div>

                <hr className="add_contact_section_rule" />

                <div className="add_contact_section">
                  <div className="um_field">
                    <label
                      htmlFor="contact-note"
                      className="um_field_label_row"
                    >
                      <FileText
                        className="um_field_label_icon"
                        size={17}
                        aria-hidden
                      />
                      <span>Note</span>
                    </label>
                    <textarea
                      id="contact-note"
                      className="um_field_textarea add_contact_note_textarea"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Context for your team (visible internally)"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="add_contact_section_eyebrow add_contact_section_eyebrow_spaced">
                  Tags &amp; lists
                </p>
            <SearchableMultiSelectField
              label="Tags"
              Icon={Tag}
              inputId="contact-tags-search"
              listboxId={tagListboxId}
              selected={tags}
              onToggle={toggleTagValue}
              onAddUnique={(v) => addFromInput(v, setTags)}
              options={tagOptionPool}
              search={tagInput}
              onSearchChange={setTagInput}
              open={tagPickerOpen}
              onOpenChange={setTagPickerOpen}
              fieldRef={tagFieldRef}
              placeholder="Search or add a tag…"
              emptyHint="No matches. Type a new name and press Enter, or use Create. Names from the Tags tab appear here."
              onFocusOpen={() => setListPickerOpen(false)}
            />

            <SearchableMultiSelectField
              label="Lists"
              Icon={List}
              inputId="contact-lists-search"
              listboxId={listListboxId}
              selected={lists}
              onToggle={toggleListValue}
              onAddUnique={(v) => addFromInput(v, setLists)}
              options={listOptionPool}
              search={listInput}
              onSearchChange={setListInput}
              open={listPickerOpen}
              onOpenChange={setListPickerOpen}
              fieldRef={listFieldRef}
              placeholder="Search or add a list…"
              emptyHint="No matches. Type a new name and press Enter, or use Create. Names from the Lists tab appear here."
              onFocusOpen={() => setTagPickerOpen(false)}
            />

            <div className="um_field add_contact_owners_field">
              <label
                htmlFor="contact-owners-input"
                className="um_field_label_row"
              >
                <Users className="um_field_label_icon" size={17} aria-hidden />
                <span>Owners</span>
              </label>
              <p id="contact-owners-hint" className="add_contact_owners_hint">
                Team members responsible for this contact.
              </p>
              <div
                className="contacts_chips_combobox add_contact_owners_combobox"
                role="group"
                aria-label="Owners"
                onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
                  const t = e.target as HTMLElement
                  if (t.closest("button") || t.closest("input")) return
                  ownerComboboxRef.current?.focus()
                }}
              >
                <ChipRow
                  className="contacts_chips_combobox_chips"
                  items={owners}
                  onRemove={(i) =>
                    setOwners((prev) => prev.filter((_, j) => j !== i))
                  }
                  ariaLabel="Selected owners"
                />
                <input
                  ref={ownerComboboxRef}
                  id="contact-owners-input"
                  type="text"
                  className="contacts_chips_combobox_input"
                  placeholder={
                    owners.length === 0 ? "Type a name to add" : "Add another"
                  }
                  value={ownerInput}
                  onChange={(e) => setOwnerInput(e.target.value)}
                  onKeyDown={handleOwnerKeyDown}
                  autoComplete="off"
                  aria-describedby="contact-owners-hint"
                />
              </div>
            </div>

            {contactToEdit ? (
              <div className="um_field um_field_reason_change">
                <label
                  htmlFor="contact-edit-reason"
                  className="um_field_label_row"
                >
                  <PenLine
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span>
                    Reason for this change{" "}
                    <span className="contacts_required" aria-hidden>
                      *
                    </span>
                  </span>
                </label>
                <textarea
                  id="contact-edit-reason"
                  className="um_field_textarea add_contact_note_textarea"
                  value={editReason}
                  onChange={(e) => {
                    setEditReason(e.target.value)
                    if (fieldError.editReason)
                      setFieldError((f) => ({ ...f, editReason: undefined }))
                  }}
                  rows={3}
                  placeholder="Why are you updating this contact?"
                  aria-invalid={Boolean(fieldError.editReason)}
                  aria-describedby={
                    fieldError.editReason ? "contact-edit-reason-err" : undefined
                  }
                />
                {fieldError.editReason ? (
                  <p
                    id="contact-edit-reason-err"
                    className="um_field_hint um_field_hint_error"
                  >
                    {fieldError.editReason}
                  </p>
                ) : null}
              </div>
            ) : null}
              </>
            )}
          </div>

          <div className="um_modal_actions add_contact_modal_actions">
            <button
              type="button"
              className="um_btn_secondary add_contact_modal_actions_leading"
              onClick={handleCancel}
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
  )
}
