import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  FileText,
  Globe,
  Hash,
  Info,
  Save,
  MapPin,
  MapPinned,
  MessageSquare,
  X,
} from "lucide-react"
import { toast } from "@/common/components/Toast"
import { focusFirstFormErrorAfterUpdate } from "@/common/utils/scrollToFirstFormError"
import { getSessionUserDisplayName } from "@/common/auth/sessionUserDisplayName"
import { useUsCountriesNowLocations } from "@/modules/Syndication/Deals/hooks/useUsCountriesNowLocations"
import {
  getUsCitiesForStateCode,
  getUsStateDropdownOptions,
  isUnitedStatesCountry,
  resolveUsStateCodeForDraft,
} from "@/modules/Syndication/Deals/constants/usLocations"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import {
  COUNTRY_OPTIONS,
  DEFAULT_ASSET_COUNTRY,
} from "@/modules/Syndication/Deals/types/deals.types"
import { normalizeZipCodeDigits, zipCodeFieldError } from "@/modules/Syndication/Deals/utils/dealZipCode"
import type { AddressFormDraft, SavedAddress } from "./address.types"
import {
  ADDRESS_DUPLICATE_MESSAGE,
  hasActiveAddressDuplicate,
} from "./addressDuplicateCheck"
import { InvestingFormField } from "./InvestingFormField"
import "@/modules/Syndication/Deals/tabs/investors/add-investment-modal.css"
import "@/modules/Syndication/Deals/tabs/deal_members/add-investment/add_deal_modal.css"
import "@/modules/Syndication/contacts/contacts.css"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./add-investor-profile-modal.css"
import "./investing-profiles-form-modals.css"

const empty: AddressFormDraft = {
  fullNameOrCompany: "",
  country: DEFAULT_ASSET_COUNTRY,
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  checkMemo: "",
  distributionNote: "",
}

/** Match Add deal asset step: CountriesNow for US state/city when available, static JSON fallback. */
const US_LOCATION_SOURCE: "static" | "countriesNow" = "countriesNow"

const ADDR_FIELD_PILL = "deals_add_inv_field_pill"
const ADDR_INPUT_CLASS = `deals_add_inv_input deals_add_inv_field_control ${ADDR_FIELD_PILL}`
const ADDR_DROPDOWN_TRIGGER = `deals_add_inv_field_control ${ADDR_FIELD_PILL}`

const TOTAL_STEPS = 2
const STEPPER_LABELS = ["Address", "Check memo & distribution"] as const

type AddressFieldErrors = {
  fullNameOrCompany?: string
  street1?: string
  state?: string
  city?: string
  zip?: string
}

function addressFieldErrorsActive(errors: AddressFieldErrors): boolean {
  return Object.keys(errors).length > 0
}

function buildAddressStepFieldErrors(
  form: AddressFormDraft,
  isUs: boolean,
  usStateCode: string,
  usCityOptions: readonly string[],
): AddressFieldErrors {
  const errors: AddressFieldErrors = {}
  if (!form.fullNameOrCompany.trim()) {
    errors.fullNameOrCompany = "Enter a full name or company name."
  }
  if (!form.street1.trim()) {
    errors.street1 = "Enter street address line 1."
  }
  if (isUs) {
    if (!usStateCode) errors.state = "Select a state."
    if (!form.city.trim()) {
      errors.city = "Select or enter a city."
    } else if (
      usCityOptions.length > 0 &&
      !usCityOptions.includes(form.city.trim())
    ) {
      errors.city = "Choose a city from the list for the selected state."
    }
    if (!form.zip.trim()) {
      errors.zip = "Enter a 5-digit zip code."
    } else {
      const zipErr = zipCodeFieldError(form.zip)
      if (zipErr) errors.zip = zipErr
    }
  } else {
    if (!form.state.trim()) errors.state = "Enter state or region."
    if (!form.city.trim()) errors.city = "Enter city."
    if (!form.zip.trim()) errors.zip = "Enter zip or postal code."
  }
  return errors
}

function addrInputClass(hasError: boolean): string {
  return hasError ? `${ADDR_INPUT_CLASS} um_field_input_invalid` : ADDR_INPUT_CLASS
}

function AddrFieldHelp({
  label,
  tooltip,
}: {
  label: string
  tooltip: string
}) {
  return (
    <button
      type="button"
      className="investing_field_hint"
      aria-label={`${label} — ${tooltip}`}
      title={tooltip}
    >
      <Info size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

interface AddAddressModalProps {
  open: boolean
  onClose: () => void
  onSave: (a: AddressFormDraft) => void
  /** Prefill (e.g. when editing a saved address). */
  initialDraft?: AddressFormDraft | null
  isEdit?: boolean
  /** Raise above Add beneficiary when opened from that flow. */
  stackAboveParent?: boolean
  /** Active saved addresses used to block duplicate physical locations. */
  existingAddresses?: SavedAddress[]
  /** When editing, the row being updated (excluded from duplicate check). */
  excludeAddressId?: string
}

export function AddAddressModal({
  open,
  onClose,
  onSave,
  initialDraft = null,
  isEdit = false,
  stackAboveParent = false,
  existingAddresses = [],
  excludeAddressId,
}: AddAddressModalProps) {
  const [form, setForm] = useState<AddressFormDraft>(empty)
  const [step, setStep] = useState(1)
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({})
  const formRef = useRef<HTMLFormElement>(null)

  const patch = useCallback((p: Partial<AddressFormDraft>) => {
    setForm((prev) => ({ ...prev, ...p }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      if ("fullNameOrCompany" in p) delete next.fullNameOrCompany
      if ("street1" in p) delete next.street1
      if ("state" in p) delete next.state
      if ("city" in p) delete next.city
      if ("zip" in p) delete next.zip
      return next
    })
  }, [])

  const isUs = isUnitedStatesCountry(form.country)
  const usStateCode = useMemo(
    () => (isUs ? resolveUsStateCodeForDraft(form.state) : ""),
    [isUs, form.state],
  )

  const countriesNow = useUsCountriesNowLocations({
    enabled: isUs && US_LOCATION_SOURCE === "countriesNow",
    selectedStateCode: usStateCode,
    selectedCity: form.city,
  })

  const usStateOptions = useMemo(() => {
    if (!isUs) return []
    if (US_LOCATION_SOURCE === "static") return getUsStateDropdownOptions()
    if (countriesNow.stateOptions.length > 0) return countriesNow.stateOptions
    return getUsStateDropdownOptions()
  }, [isUs, countriesNow.stateOptions])

  const usCityOptions = useMemo(() => {
    if (!isUs || !usStateCode) return []
    if (US_LOCATION_SOURCE === "static") {
      const list = getUsCitiesForStateCode(usStateCode)
      const c = form.city.trim()
      if (c && !list.includes(c)) return [...list, c].sort((a, b) => a.localeCompare(b))
      return list
    }
    return countriesNow.cityNames
  }, [isUs, usStateCode, US_LOCATION_SOURCE, countriesNow.cityNames, form.city])

  const usStatesLoading =
    isUs &&
    US_LOCATION_SOURCE === "countriesNow" &&
    countriesNow.statesLoading &&
    countriesNow.stateOptions.length === 0
  const usCitiesLoading =
    isUs && US_LOCATION_SOURCE === "countriesNow" && usStateCode && countriesNow.citiesLoading

  useEffect(() => {
    if (!isUs || !form.state?.trim()) return
    const code = resolveUsStateCodeForDraft(form.state)
    if (code && code !== form.state) patch({ state: code })
  }, [isUs, form.state, patch])

  const stepHeading = useMemo(
    () => (step === 1 ? "Address" : "Check memo & distribution"),
    [step],
  )

  useEffect(() => {
    if (!open) return
    if (initialDraft) {
      setForm({
        ...empty,
        ...initialDraft,
        country: (initialDraft.country || DEFAULT_ASSET_COUNTRY).trim() || DEFAULT_ASSET_COUNTRY,
      })
    } else {
      setForm({
        ...empty,
        fullNameOrCompany: getSessionUserDisplayName().trim(),
      })
    }
    setStep(1)
    setFieldErrors({})
  }, [open, initialDraft])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const applyAddressStepValidation = useCallback((): boolean => {
    const errors = buildAddressStepFieldErrors(
      form,
      isUs,
      usStateCode,
      usCityOptions,
    )
    if (addressFieldErrorsActive(errors)) {
      setFieldErrors(errors)
      focusFirstFormErrorAfterUpdate({ container: formRef.current })
      return false
    }
    setFieldErrors({})
    return true
  }, [form, isUs, usStateCode, usCityOptions])

  const goNext = useCallback(() => {
    if (step !== 1) return
    if (!applyAddressStepValidation()) return
    setStep(2)
  }, [step, applyAddressStepValidation])

  const goBack = useCallback(() => {
    setStep(1)
  }, [])

  function handleAdd() {
    if (!applyAddressStepValidation()) {
      if (step === 2) setStep(1)
      return
    }

    const draft: AddressFormDraft = {
      ...form,
      fullNameOrCompany: form.fullNameOrCompany.trim(),
      street1: form.street1.trim(),
      street2: form.street2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: isUs ? normalizeZipCodeDigits(form.zip) : form.zip.trim(),
      checkMemo: form.checkMemo.trim(),
      distributionNote: form.distributionNote.trim(),
    }
    if (hasActiveAddressDuplicate(existingAddresses, draft, excludeAddressId)) {
      toast.error("Duplicate address", ADDRESS_DUPLICATE_MESSAGE)
      setStep(1)
      return
    }
    onSave(draft)
    onClose()
  }

  if (!open) return null

  return createPortal(
    <div
      className={
        stackAboveParent
          ? "um_modal_overlay deals_add_inv_modal_overlay investing_ben_modal_overlay investing_nested_modal_overlay"
          : "um_modal_overlay deals_add_inv_modal_overlay investing_ben_modal_overlay"
      }
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel investing_add_profile_form_panel investing_add_address_form_panel investing_add_beneficiary_form_panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-address-title"
        aria-describedby="add-address-step-label"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="um_modal_head add_contact_modal_head">
          <div className="add_contact_modal_head_main">
            <h2
              id="add-address-title"
              className="um_modal_title add_contact_modal_title"
            >
              {isEdit ? "Edit address" : "Add address"}
            </h2>
            <div
              className="add_contact_stepper"
              role="group"
              aria-label="Form progress"
            >
              <p id="add-address-step-label" className="add_profile_sronly">
                Step {step} of {TOTAL_STEPS}: {stepHeading}
              </p>
              {STEPPER_LABELS.map((label, i) => {
                const n = i + 1
                const isActive = step === n
                const isDone = step > n
                return (
                  <Fragment key={n}>
                    {i > 0 ? (
                      <span
                        className={
                          step > i
                            ? "add_contact_step_line add_contact_step_line_active"
                            : "add_contact_step_line"
                        }
                        aria-hidden
                      />
                    ) : null}
                    <div
                      className={
                        isActive
                          ? "add_contact_step_node add_contact_step_node_active"
                          : isDone
                            ? "add_contact_step_node add_contact_step_node_done"
                            : "add_contact_step_node"
                      }
                    >
                      <span
                        className="add_contact_step_dot"
                        aria-current={isActive ? "step" : undefined}
                      >
                        {n}
                      </span>
                      <span className="add_contact_step_label">{label}</span>
                    </div>
                  </Fragment>
                )
              })}
            </div>
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
          ref={formRef}
          className="deals_add_inv_modal_form investing_pill_modal_form"
          onSubmit={(e) => {
            e.preventDefault()
            if (step === 1) {
              goNext()
              return
            }
            handleAdd()
          }}
          noValidate
        >
          <div className="deals_add_inv_modal_scroll">
            {step === 1 ? (
            <div className="add_contact_name_grid add_beneficiary_field_grid">
              <InvestingFormField
                id="addr-name"
                label={
                  <>
                    Full name/Company name{" "}
                    <span className="investing_form_req" aria-label="required">
                      *
                    </span>
                  </>
                }
                Icon={Building2}
                tight
                error={fieldErrors.fullNameOrCompany}
              >
                <input
                  id="addr-name"
                  className={addrInputClass(Boolean(fieldErrors.fullNameOrCompany))}
                  value={form.fullNameOrCompany}
                  onChange={(e) => patch({ fullNameOrCompany: e.target.value })}
                  placeholder="Enter full name or company name"
                  autoComplete="name"
                  aria-invalid={Boolean(fieldErrors.fullNameOrCompany)}
                  aria-describedby={
                    fieldErrors.fullNameOrCompany ? "addr-name-err" : undefined
                  }
                />
              </InvestingFormField>

              <InvestingFormField
                id="addr-country"
                label={
                  <>
                    Country{" "}
                    <span className="investing_form_req" aria-label="required">
                      *
                    </span>
                  </>
                }
                Icon={Globe}
                tight
              >
                <DealsCreateDropdownSelect
                  options={COUNTRY_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                  value={form.country}
                  onChange={(next) => {
                    const wasUs = isUnitedStatesCountry(form.country)
                    const nowUs = isUnitedStatesCountry(next)
                    if (!wasUs && nowUs) {
                      patch({
                        country: next,
                        state: resolveUsStateCodeForDraft(form.state) || "",
                        city: "",
                      })
                    } else {
                      patch({ country: next })
                    }
                  }}
                  searchable
                  searchPlaceholder="Search countries…"
                  searchAriaLabel="Filter country list"
                  searchShowOptionCountHint
                  triggerClassName={ADDR_DROPDOWN_TRIGGER}
                  placeholder="Select country"
                />
              </InvestingFormField>

              {isUs ? (
                <>
                  <InvestingFormField
                    id="addr-state"
                    label={
                      <>
                        State{" "}
                        <span className="investing_form_req" aria-label="required">
                          *
                        </span>
                      </>
                    }
                    Icon={MapPin}
                    tight
                    error={fieldErrors.state}
                  >
                    <DealsCreateDropdownSelect
                      options={[
                        {
                          value: "",
                          label: usStatesLoading ? "Loading states…" : "Select state",
                        },
                        ...usStateOptions,
                      ]}
                      value={usStateCode}
                      onChange={(v) => patch({ state: v, city: "" })}
                      disabled={usStatesLoading}
                      placeholder={usStatesLoading ? "Loading states…" : "Select state"}
                      searchable
                      searchPlaceholder="Search states…"
                      searchAriaLabel="Filter state list"
                      searchShowOptionCountHint
                      triggerClassName={ADDR_DROPDOWN_TRIGGER}
                      invalid={Boolean(fieldErrors.state)}
                      ariaDescribedBy={
                        fieldErrors.state ? "addr-state-err" : undefined
                      }
                    />
                    {US_LOCATION_SOURCE === "countriesNow" && countriesNow.statesError ? (
                      <p
                        className="investing_form_subline"
                        style={{ marginTop: "0.35em" }}
                        role="status"
                      >
                        Could not load states from the directory service. Using offline list.
                      </p>
                    ) : null}
                  </InvestingFormField>

                  <InvestingFormField
                    id="addr-city"
                    label={
                      <>
                        City{" "}
                        <span className="investing_form_req" aria-label="required">
                          *
                        </span>
                      </>
                    }
                    Icon={Building2}
                    tight
                    error={fieldErrors.city}
                  >
                    <DealsCreateDropdownSelect
                      options={[
                        {
                          value: "",
                          label: !usStateCode
                            ? "Select state first"
                            : usCitiesLoading
                              ? "Loading cities…"
                              : "Select city",
                        },
                        ...usCityOptions.map((name) => ({ value: name, label: name })),
                      ]}
                      value={
                        form.city && usCityOptions.includes(form.city.trim())
                          ? form.city.trim()
                          : ""
                      }
                      onChange={(v) => patch({ city: v })}
                      disabled={!usStateCode || Boolean(usCitiesLoading)}
                      placeholder={
                        !usStateCode
                          ? "Select state first"
                          : usCitiesLoading
                            ? "Loading cities…"
                            : "Select city"
                      }
                      searchable
                      searchPlaceholder="Search cities…"
                      searchAriaLabel="Filter city list"
                      searchShowOptionCountHint
                      triggerClassName={ADDR_DROPDOWN_TRIGGER}
                      invalid={Boolean(fieldErrors.city)}
                      ariaDescribedBy={
                        fieldErrors.city ? "addr-city-err" : undefined
                      }
                    />
                    {US_LOCATION_SOURCE === "countriesNow" && usStateCode && countriesNow.citiesError ? (
                      <p
                        className="investing_form_subline"
                        style={{ marginTop: "0.35em" }}
                        role="status"
                      >
                        Could not load cities from the directory service. Showing offline list for
                        this state.
                      </p>
                    ) : null}
                  </InvestingFormField>
                </>
              ) : (
                <>
                  <InvestingFormField
                    id="addr-state"
                    label={
                      <>
                        State / Province / Region{" "}
                        <span className="investing_form_req" aria-label="required">
                          *
                        </span>
                      </>
                    }
                    Icon={MapPin}
                    tight
                    error={fieldErrors.state}
                  >
                    <input
                      id="addr-state"
                      className={addrInputClass(Boolean(fieldErrors.state))}
                      value={form.state}
                      onChange={(e) => patch({ state: e.target.value })}
                      placeholder="Enter state or region"
                      autoComplete="address-level1"
                      aria-invalid={Boolean(fieldErrors.state)}
                      aria-describedby={
                        fieldErrors.state ? "addr-state-err" : undefined
                      }
                    />
                  </InvestingFormField>

                  <InvestingFormField
                    id="addr-city"
                    label={
                      <>
                        City{" "}
                        <span className="investing_form_req" aria-label="required">
                          *
                        </span>
                      </>
                    }
                    Icon={Building2}
                    tight
                    error={fieldErrors.city}
                  >
                    <input
                      id="addr-city"
                      className={addrInputClass(Boolean(fieldErrors.city))}
                      value={form.city}
                      onChange={(e) => patch({ city: e.target.value })}
                      placeholder="Enter city"
                      autoComplete="address-level2"
                      aria-invalid={Boolean(fieldErrors.city)}
                      aria-describedby={
                        fieldErrors.city ? "addr-city-err" : undefined
                      }
                    />
                  </InvestingFormField>
                </>
              )}

              <div className="add_beneficiary_field_grid__full">
                <InvestingFormField
                  id="addr-line1"
                  label={
                    <>
                      Street address line 1{" "}
                      <span className="investing_form_req" aria-label="required">
                        *
                      </span>
                    </>
                  }
                  Icon={MapPin}
                  error={fieldErrors.street1}
                >
                  <input
                    id="addr-line1"
                    className={addrInputClass(Boolean(fieldErrors.street1))}
                    value={form.street1}
                    onChange={(e) => patch({ street1: e.target.value })}
                    placeholder="Enter address line 1"
                    autoComplete="address-line1"
                    aria-invalid={Boolean(fieldErrors.street1)}
                    aria-describedby={
                      fieldErrors.street1 ? "addr-line1-err" : undefined
                    }
                  />
                </InvestingFormField>
              </div>

              <div className="add_beneficiary_field_grid__full">
                <InvestingFormField id="addr-line2" label="Street address line 2" Icon={MapPinned}>
                  <input
                    id="addr-line2"
                    className={ADDR_INPUT_CLASS}
                    value={form.street2}
                    onChange={(e) => patch({ street2: e.target.value })}
                    placeholder="Enter address line 2"
                    autoComplete="address-line2"
                  />
                </InvestingFormField>
              </div>
              <div className="add_beneficiary_field_grid__full add_address_zip_field">
                <InvestingFormField
                  id="addr-zip"
                  label={
                    <>
                      {isUs ? "Zip code" : "Zip / postal code"}{" "}
                      <span className="investing_form_req" aria-label="required">
                        *
                      </span>
                    </>
                  }
                  Icon={Hash}
                  tight
                  error={fieldErrors.zip}
                >
                  <input
                    id="addr-zip"
                    className={addrInputClass(Boolean(fieldErrors.zip))}
                    value={form.zip}
                    onChange={(e) =>
                      patch({
                        zip: isUs
                          ? normalizeZipCodeDigits(e.target.value)
                          : e.target.value,
                      })
                    }
                    placeholder={isUs ? "5-digit zip" : "Enter zip or postal code"}
                    autoComplete="postal-code"
                    inputMode={isUs ? "numeric" : undefined}
                    maxLength={isUs ? 5 : undefined}
                    aria-invalid={Boolean(fieldErrors.zip)}
                    aria-describedby={
                      fieldErrors.zip ? "addr-zip-err" : undefined
                    }
                  />
                </InvestingFormField>
              </div>
            </div>
            ) : (
            <div
              className="add_contact_section"
              aria-labelledby="addr-distribution-section-title"
            >
              <p
                id="addr-distribution-section-title"
                className="add_contact_section_eyebrow"
              >
                {"Check memo & distribution"}
              </p>
              <div className="add_contact_name_grid add_beneficiary_field_grid">
                <div className="add_beneficiary_field_grid__full">
                  <InvestingFormField
                    id="addr-check-memo"
                    label="Check memo"
                    Icon={FileText}
                    labelSuffix={
                      <AddrFieldHelp
                        label="Check memo"
                        tooltip="To be printed on the check"
                      />
                    }
                  >
                    <input
                      id="addr-check-memo"
                      className={ADDR_INPUT_CLASS}
                      value={form.checkMemo}
                      onChange={(e) => patch({ checkMemo: e.target.value })}
                      placeholder="Enter check memo"
                      autoComplete="off"
                    />
                  </InvestingFormField>
                </div>

                <div className="add_beneficiary_field_grid__full">
                  <InvestingFormField
                    id="addr-dist-note"
                    label="Distribution note"
                    Icon={MessageSquare}
                    labelSuffix={
                      <AddrFieldHelp
                        label="Distribution note"
                        tooltip="Additional notes for your sponsor"
                      />
                    }
                  >
                    <textarea
                      id="addr-dist-note"
                      className={`${ADDR_INPUT_CLASS} investing_note_textarea`}
                      value={form.distributionNote}
                      onChange={(e) => patch({ distributionNote: e.target.value })}
                      placeholder="Enter note"
                      rows={4}
                      autoComplete="off"
                    />
                  </InvestingFormField>
                </div>
              </div>
            </div>
            )}
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
              {step > 1 ? (
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={goBack}
                >
                  <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                  Back
                </button>
              ) : null}
              {step < TOTAL_STEPS ? (
                <button type="submit" className="um_btn_primary">
                  Next
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              ) : (
              <button type="submit" className="um_btn_primary">
                <Save size={16} strokeWidth={2} aria-hidden />
                Save
              </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
