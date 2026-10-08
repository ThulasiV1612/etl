import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import { createPortal } from "react-dom"
import {
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  Mail,
  MapPin,
  Phone,
  Shield,
  Save,
  UserRound,
  X,
} from "lucide-react"
import { UsPhoneInput } from "@/common/components/UsPhoneInput"
import { toast } from "@/common/components/Toast"
import {
  national10ToE164,
  nationalDigitsFromStoredPhone,
  nationalTenDigitsFromRawInput,
} from "@/common/phone/usPhoneNumber"
import {
  getEmailFieldError,
  getUsPhoneFieldError,
} from "./profileContactValidation"
import { formatSavedAddressLabel, type AddressFormDraft, type SavedAddress } from "./address.types"
import {
  type BeneficiaryDuplicateRow,
  BENEFICIARY_DUPLICATE_MESSAGE,
  hasActiveBeneficiaryDuplicate,
} from "./beneficiaryDuplicateCheck"
import { AddAddressModal } from "./AddAddressModal"
import { InvestingFormField } from "./InvestingFormField"
import { postSavedAddress } from "./investingProfileBookApi"
import { SavedAddressSelect } from "./SavedAddressSelect"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import "@/modules/Syndication/Deals/tabs/investors/add-investment-modal.css"
import "@/modules/Syndication/Deals/tabs/deal_members/add-investment/add_deal_modal.css"
import "@/modules/Syndication/contacts/contacts.css"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./add-investor-profile-modal.css"
import "./investing-profiles-form-modals.css"

export type BeneficiaryDraft = {
  fullName: string
  relationship: string
  taxId: string
  phone: string
  email: string
  addressQuery: string
}

const empty: BeneficiaryDraft = {
  fullName: "",
  relationship: "",
  taxId: "",
  phone: "",
  email: "",
  addressQuery: "",
}

const RELATIONSHIP_OPTIONS = [
  "",
  "Spouse",
  "Child",
  "Parent",
  "Sibling",
  "Trust",
  "Other",
] as const

const BEN_FIELD_PILL = "deals_add_inv_field_pill"
const BEN_INPUT_CLASS = `deals_add_inv_input deals_add_inv_field_control ${BEN_FIELD_PILL}`
const BEN_DROPDOWN_TRIGGER = `deals_add_inv_field_control ${BEN_FIELD_PILL}`

interface AddBeneficiaryModalProps {
  open: boolean
  onClose: () => void
  onSave: (b: BeneficiaryDraft) => void
  initial?: BeneficiaryDraft | null
  /** "edit" shows save label and title for editing an existing row. */
  variant?: "add" | "edit"
  /** Address tab rows — used for the address dropdown (active only). */
  savedAddresses?: SavedAddress[]
  /** Called after a new address is saved from the address dropdown. */
  onAddressAdded?: (address: SavedAddress) => void
  /** Active beneficiaries used to block duplicate name + address on save. */
  existingBeneficiaries?: BeneficiaryDuplicateRow[]
  /** When editing, the row being updated (excluded from duplicate check). */
  excludeBeneficiaryId?: string
}

function findAddressIdByLabel(
  rows: SavedAddress[],
  addressQuery: string,
): string {
  const t = (addressQuery ?? "").trim()
  if (!t) return ""
  return rows.find((a) => formatSavedAddressLabel(a) === t)?.id ?? ""
}

function FieldLabelHint({ title: hintTitle, label }: { title: string; label: string }) {
  return (
    <button
      type="button"
      className="investing_field_hint"
      title={hintTitle}
      aria-label={label}
    >
      <Info size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

export function AddBeneficiaryModal({
  open,
  onClose,
  onSave,
  initial = null,
  variant = "add",
  savedAddresses = [],
  onAddressAdded,
  existingBeneficiaries = [],
  excludeBeneficiaryId,
}: AddBeneficiaryModalProps) {
  const [d, setD] = useState<BeneficiaryDraft>(empty)
  const [taxVisible, setTaxVisible] = useState(false)
  const [phoneNationalDigits, setPhoneNationalDigits] = useState("")
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [addAddressOpen, setAddAddressOpen] = useState(false)
  const isEdit = variant === "edit"
  const activeSavedAddresses = useMemo(
    () => savedAddresses.filter((a) => !a.archived),
    [savedAddresses],
  )
  const selectedAddressId = useMemo(
    () => findAddressIdByLabel(activeSavedAddresses, d.addressQuery),
    [activeSavedAddresses, d.addressQuery],
  )
  const hasUnmatchedAddressQuery = Boolean(
    d.addressQuery.trim() && !selectedAddressId,
  )

  useEffect(() => {
    if (!open) return
    setD(initial && Object.keys(initial).length ? { ...empty, ...initial } : { ...empty })
    setPhoneNationalDigits(
      nationalDigitsFromStoredPhone(initial?.phone ?? ""),
    )
    setTaxVisible(false)
    setPhoneError(null)
    setEmailError(null)
    setAddAddressOpen(false)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (addAddressOpen) {
          setAddAddressOpen(false)
          return
        }
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, addAddressOpen])

  const patch = useCallback((p: Partial<BeneficiaryDraft>) => {
    setD((prev) => ({ ...prev, ...p }))
    if (Object.prototype.hasOwnProperty.call(p, "email")) setEmailError(null)
  }, [])

  const handleAddressSave = useCallback(
    (draft: AddressFormDraft) => {
      void (async () => {
        try {
          const row = await postSavedAddress(draft)
          onAddressAdded?.(row)
          patch({ addressQuery: formatSavedAddressLabel(row) })
          toast.success("Address added", "Your address was saved.")
          setAddAddressOpen(false)
        } catch (e) {
          toast.error(
            "Could not save address",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    },
    [onAddressAdded, patch],
  )

  function handleAdd() {
    if (!d.fullName.trim()) {
      toast.error("Name required", "Enter the full name of the individual or entity.")
      return
    }
    const pd = nationalTenDigitsFromRawInput(phoneNationalDigits)
    const pErr = getUsPhoneFieldError(phoneNationalDigits) ?? null
    const eErr = getEmailFieldError(d.email) ?? null
    setPhoneError(pErr)
    setEmailError(eErr)
    if (pErr || eErr) {
      const first = pErr || eErr || ""
      toast.error("Check contact details", first)
      return
    }
    const fullName = d.fullName.trim()
    const addressQuery = d.addressQuery.trim()
    if (
      hasActiveBeneficiaryDuplicate(
        existingBeneficiaries,
        fullName,
        addressQuery,
        excludeBeneficiaryId,
      )
    ) {
      toast.error("Duplicate beneficiary", BENEFICIARY_DUPLICATE_MESSAGE)
      return
    }
    const phoneE164 =
      pd.length === 0 ? "" : national10ToE164(phoneNationalDigits) ?? ""
    onSave({ ...d, fullName, addressQuery, phone: phoneE164 })
    onClose()
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault()
    handleAdd()
  }

  if (!open) return null

  return createPortal(
    <Fragment>
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay investing_ben_modal_overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel investing_add_beneficiary_form_panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-beneficiary-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head add_contact_modal_head">
          <div className="add_contact_modal_head_main">
            <h2
              id="add-beneficiary-title"
              className="um_modal_title add_contact_modal_title"
            >
              {isEdit ? "Edit beneficiary" : "Add beneficiary"}
            </h2>
          </div>
          <button
            type="button"
            className="um_modal_close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <form
          className="deals_add_inv_modal_form investing_pill_modal_form"
          onSubmit={onFormSubmit}
          noValidate
        >
          <div className="deals_add_inv_modal_scroll">
            <div
              className="add_contact_name_grid add_beneficiary_field_grid"
            >
            <InvestingFormField
              id="ben-fullname"
              label={
                <>
                  Full name of individual or entity{" "}
                  <span className="investing_form_req" aria-label="required">
                    *
                  </span>
                </>
              }
              Icon={UserRound}
              tight
            >
              <input
                id="ben-fullname"
                className={BEN_INPUT_CLASS}
                value={d.fullName}
                onChange={(e) => patch({ fullName: e.target.value })}
                autoComplete="name"
                placeholder="Enter name"
              />
            </InvestingFormField>

            <InvestingFormField
              id="ben-rel"
              label="Relationship to profile holder"
              Icon={HelpCircle}
              tight
            >
              <DealsCreateDropdownSelect
                id="ben-rel"
                options={RELATIONSHIP_OPTIONS.filter(Boolean).map((o) => ({
                  value: o,
                  label: o,
                }))}
                value={d.relationship}
                onChange={(v) => patch({ relationship: v })}
                placeholder="Select"
                ariaLabel="Relationship to profile holder"
                triggerClassName={BEN_DROPDOWN_TRIGGER}
              />
            </InvestingFormField>

            <div className="add_beneficiary_field_grid__full">
              <InvestingFormField
                id="ben-tax"
                label="Tax ID"
                Icon={Shield}
                labelSuffix={
                  <FieldLabelHint
                    title="EIN, SSN, or other tax identifier for the beneficiary or entity"
                    label="Tax ID — more information"
                  />
                }
              >
                <div className="add_profile_input_wrap">
                  <input
                    id="ben-tax"
                    className={BEN_INPUT_CLASS}
                    type={taxVisible ? "text" : "password"}
                    value={d.taxId}
                    onChange={(e) => patch({ taxId: e.target.value })}
                    autoComplete="off"
                    placeholder="Tax ID"
                    aria-label="Tax ID"
                  />
                  <button
                    type="button"
                    className="add_profile_ssn_toggle"
                    onClick={() => setTaxVisible((v) => !v)}
                    aria-label={taxVisible ? "Hide tax ID" : "Show tax ID"}
                  >
                    {taxVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </InvestingFormField>
            </div>

            <InvestingFormField
              id="ben-phone"
              label="Phone number"
              Icon={Phone}
              tight
            >
              <UsPhoneInput
                id="ben-phone"
                name="phone"
                nationalDigits={phoneNationalDigits}
                onNationalDigitsChange={(next) => {
                  setPhoneNationalDigits(next)
                  setPhoneError(null)
                }}
                className={BEN_INPUT_CLASS}
                autoComplete="tel"
                aria-invalid={Boolean(phoneError)}
                aria-describedby={phoneError ? "ben-phone-err" : undefined}
                error={phoneError}
              />
            </InvestingFormField>

            <InvestingFormField
              id="ben-email"
              label="Email"
              Icon={Mail}
              tight
              error={emailError ?? undefined}
            >
              <input
                id="ben-email"
                className={BEN_INPUT_CLASS}
                type="email"
                inputMode="email"
                value={d.email}
                onChange={(e) => patch({ email: e.target.value })}
                autoComplete="email"
                placeholder="name@example.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "ben-email-err" : undefined}
              />
            </InvestingFormField>

            <div className="add_beneficiary_field_grid__full">
              <InvestingFormField id="ben-addr" label="Address" Icon={MapPin}>
                {hasUnmatchedAddressQuery ? (
                  <p className="add_profile_sub" style={{ marginBottom: "0.35em" }} role="status">
                    Address on file does not match a saved row:{" "}
                    <span className="um_field_hint" style={{ display: "block", marginTop: "0.2em" }}>
                      {d.addressQuery}
                    </span>{" "}
                    Choose a saved address below to replace it.
                  </p>
                ) : null}
                <SavedAddressSelect
                  id="ben-addr"
                  value={selectedAddressId}
                  onChange={(id) => {
                    if (!id) {
                      patch({ addressQuery: "" })
                      return
                    }
                    const row = activeSavedAddresses.find((a) => a.id === id)
                    patch({ addressQuery: row ? formatSavedAddressLabel(row) : "" })
                  }}
                  savedAddresses={activeSavedAddresses}
                  emptyLabel="No address (optional)"
                  ariaLabel="Mailing or legal address — choose a saved address"
                  triggerClassName={BEN_DROPDOWN_TRIGGER}
                  onAddNew={() => setAddAddressOpen(true)}
                />
              </InvestingFormField>
            </div>
            </div>
          </div>

          <div className="um_modal_actions add_contact_modal_actions">
            <button
              type="button"
              className="um_btn_secondary add_contact_modal_actions_leading"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} aria-hidden />
              Close
            </button>
            <div className="add_contact_modal_actions_trailing">
              <button type="submit" className="um_btn_primary">
                <Save size={16} strokeWidth={2} aria-hidden />
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
    <AddAddressModal
      open={addAddressOpen}
      onClose={() => setAddAddressOpen(false)}
      onSave={handleAddressSave}
      stackAboveParent
      existingAddresses={savedAddresses}
    />
    </Fragment>,
    document.body,
  )
}
