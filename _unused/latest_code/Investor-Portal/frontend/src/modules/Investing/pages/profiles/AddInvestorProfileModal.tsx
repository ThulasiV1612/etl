import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Building2,
  CircleDollarSign,
  FileText,
  Eye,
  EyeOff,
  Fingerprint,
  HelpCircle,
  IdCard,
  Info,
  LandPlot,
  Mail,
  MapPin,
  Phone,
  Search,
  UserPlus,
  UserRound,
  X,
  Save,
} from "lucide-react"
import { FormHeadingWithInfo } from "@/common/components/form-heading/FormHeadingWithInfo"
import { scrollMultiStepFormToTopAfterUpdate } from "@/common/utils/scrollToFirstFormError"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"
import {
  abaRoutingNumberFieldError,
  digitsFromAbaRoutingInput,
} from "@/common/bank/usAbaRoutingNumber"
import { UsPhoneInput } from "@/common/components/UsPhoneInput"
import { toast } from "@/common/components/Toast"
import {
  national10ToE164,
  nationalDigitsFromStoredPhone,
  nationalTenDigitsFromRawInput,
} from "@/common/phone/usPhoneNumber"
import { AddAddressModal } from "./AddAddressModal"
import type { BeneficiaryDraft } from "./AddBeneficiaryModal"
import { AddBeneficiaryModal } from "./AddBeneficiaryModal"
import {
  type ProfileBookSnapshot,
  postBeneficiary,
  postInvestorProfile,
  postSavedAddress,
  putInvestorProfile,
} from "./investingProfileBookApi"
import {
  ADD_PROFILE_WIZARD_STEP_KEY,
  addProfileDraftHasContent,
  AUTOSAVE_DEFAULT_PROFILE_NAME,
  clearAddProfileDraft,
  loadAddProfileDraft,
  notifyProfileBookRefetch,
  readWizardStepFromSavedForm,
  saveAddProfileDraft,
} from "./addProfileFormDraftStorage"
import type { AddressFormDraft } from "./address.types"
import {
  getEmailFieldError,
  getUsPhoneFieldError,
} from "./profileContactValidation"
import { BENEFICIARY_LEGAL_DISCLAIMER } from "./beneficiary-legal"
import { formatSsnItinInput, ssnItinFieldError } from "@/common/tax/usSsnItin"
import { SsnItinMaskedInput } from "@/common/components/SsnItinMaskedInput"
import { ssnFromAnyInvestorProfile } from "@/modules/Investing/pages/invest/investNowW9FormUtils"
import { InvestingFormField } from "./InvestingFormField"
import { SavedAddressSelect } from "./SavedAddressSelect"
import { YesNoCardRadioGroup } from "@/common/components/YesNoCardRadioGroup/YesNoCardRadioGroup"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import type { SavedAddress } from "./address.types"
import type {
  InvestorProfileDistributionBank,
  InvestorProfileListRow,
  NewInvestorProfilePayload,
  UpdateInvestorProfilePayload,
} from "./investor-profiles.types"
import {
  hasActiveProfileDuplicate,
  PROFILE_DUPLICATE_MESSAGE,
} from "./profileDuplicateCheck"
import "@/modules/Syndication/Deals/tabs/deal_members/add-investment/add_deal_modal.css"
import "@/modules/Syndication/Deals/deals-create.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/contacts/contacts.css"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./add-investor-profile-modal.css"
import "./investing-profiles-form-modals.css"

/* @refresh reset */

const PROFILE_TYPE_INDIVIDUAL = "Individual"
const PROFILE_TYPE_JOINT_TENANCY = "Joint tenancy"
const PROFILE_TYPE_ENTITY = "Entity"
const PROFILE_TYPE_ENTITY_CUSTODIAN = "__entity_custodian_ira_401k__"
const PROFILE_TYPE_ENTITY_LLC_CORP_TRUST = "__entity_llc_corp_trust_etc__"

/**
 * Add flow: steps 1–4 are Profile type, Details, Distributions, Address.
 * **Individual** adds step 5 (optional Beneficiary). Joint and Entity have no beneficiary step.
 * Edit appends a last step for the audit “reason for change.”
 */
const ADD_PROFILE_WIZARD_STEPS_NO_BENEFICIARY: readonly string[] = [
  "Profile type",
  "Profile details",
  "Distributions",
  "Address",
] as const
const BENEFICIARY_WIZARD_STEP_LABEL = "Beneficiary" as const
const ADD_PROFILE_WIZARD_STEP_LABELS: readonly string[] = [
  ...ADD_PROFILE_WIZARD_STEPS_NO_BENEFICIARY,
  BENEFICIARY_WIZARD_STEP_LABEL,
] as const
/** Last add-flow step when profile is Individual (includes optional beneficiary). */
const ADD_LAST_STEP_WITH_BENEFICIARY = ADD_PROFILE_WIZARD_STEP_LABELS.length
/** Last add-flow step for Joint or Entity (no beneficiary step). */
const ADD_LAST_STEP_NO_BENEFICIARY = ADD_PROFILE_WIZARD_STEPS_NO_BENEFICIARY.length

const ENTITY_SUBTYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "llc", label: "LLC" },
  { value: "corporation", label: "Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust", label: "Trust" },
  { value: "ira", label: "IRA" },
  { value: "401k", label: "401(k)" },
]

const FEDERAL_TAX_CLASSIFICATION_OPTIONS: { value: string; label: string }[] = [
  {
    value: "individual_sole_smllc",
    label: "Individual/sole proprietor or single-member LLC (Most common)",
  },
  { value: "c_corp", label: "C Corporation" },
  { value: "s_corp", label: "S Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust_estate", label: "Trust/estate" },
  { value: "llc_excluding_smlc", label: "LLC (excluding single-member LLC)" },
]

type DistributionMethod = "ach" | "check" | "other"

const ACH_BANK_ACCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
]

const initialState = {
  profileType: "",
  firstName: "",
  middleName: "",
  lastName: "",
  email1: "",
  ssn: "",
  firstName2: "",
  middleName2: "",
  lastName2: "",
  email2: "",
  phone2: "",
  spouseSsn: "",
  distributionMethod: "ach" as DistributionMethod,
  bankAccountQuery: "",
  /** ACH distribution bank account (required when `distributionMethod` is `ach`). */
  achRoutingNumber: "",
  achAccountNumber: "",
  achBankAddress: "",
  achBankName: "",
  achBankAccountType: "",
  /** When method is check: payee name + saved mailing address (separate from ACH/other free text). */
  checkPayeeName: "",
  checkMailingAddressId: "",
  taxAddressId: "",
  mailingAddressId: "",
  /** "add_new" = separate mailing row; "same_as_tax" = mailingAddressId mirrors taxAddressId. */
  mailingAddressMode: "add_new" as "add_new" | "same_as_tax",
  /** Entity / retirement: subtype (e.g. llc, ira) and display name. */
  entitySubType: "",
  entityLegalName: "",
  /**
   * Shown when entity + **not** custodian-based IRA: full legal / tax profile
   * (jurisdiction, formation, ownership, SMLLC rules, EIN, etc.). Persisted in `form_snapshot`.
   */
  entityJurisdictionOfRegistration: "",
  /** YYYY-MM-DD, optional. */
  entityDateFormed: "",
  /** Distinct from custodian-based IRA question; for non-custodian entity path. */
  entityOwnedByIra401k: "" as "" | "yes" | "no",
  entityMemberCount: "",
  /** Single-member / disregarded status for the entity. */
  entityDisregarded: "" as "" | "yes" | "no",
  /** Legal entity or plan EIN (non-custodian path). */
  entityEin: "",
  entityEinVisible: false,
  /** 3rd profile type (entity): custodian path for IRA/401(k). */
  custodianIra: "" as "" | "yes" | "no",
  legalIraName: "",
  iraCompany: "",
  federalTaxClassification: "",
  iraPartnerEin: "",
  iraCustodianEin: "",
  iraPartnerEinVisible: false,
  iraCustodianEinVisible: false,
  beneficiary: null as BeneficiaryDraft | null,
  /** When set, `beneficiary` was chosen from `savedBeneficiaries` by id. */
  beneficiaryPickId: "",
}

type FormState = typeof initialState

function mergeKnownSsnIntoForm(
  form: FormState,
  existingProfiles: InvestorProfileListRow[],
): FormState {
  if (form.ssn.trim()) return form
  const knownSsn = ssnFromAnyInvestorProfile(existingProfiles)
  if (!knownSsn) return form
  return { ...form, ssn: knownSsn }
}

function addProfileFormWithKnownSsn(
  existingProfiles: InvestorProfileListRow[],
): FormState {
  return mergeKnownSsnIntoForm(initialState, existingProfiles)
}

const FORM_STATE_KEYS = Object.keys(initialState) as (keyof FormState)[]

function formToJsonSnapshot(f: FormState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(f)) as Record<string, unknown>
}

function profileWizardStateForPersist(
  f: FormState,
  wizardStep: number,
): Record<string, unknown> {
  return {
    ...formToJsonSnapshot(normalizeFormPhonesForPersist(f)),
    [ADD_PROFILE_WIZARD_STEP_KEY]: wizardStep,
  }
}

/** Persist U.S. phones as E.164 in wizard JSON (`phone2`, `beneficiary.phone`). */
function normalizeFormPhonesForPersist(f: FormState): FormState {
  const p2d = nationalTenDigitsFromRawInput(f.phone2)
  const phone2 = p2d.length === 0 ? "" : national10ToE164(f.phone2) ?? ""
  if (!f.beneficiary) return { ...f, phone2 }
  const benDigits = nationalDigitsFromStoredPhone(f.beneficiary.phone)
  const benNational = nationalTenDigitsFromRawInput(benDigits)
  const benPhone =
    benNational.length === 0
      ? ""
      : national10ToE164(benDigits) ?? ""
  return { ...f, phone2, beneficiary: { ...f.beneficiary, phone: benPhone } }
}

function profileTypeSelectValue(f: FormState): string {
  if (f.profileType !== PROFILE_TYPE_ENTITY) return f.profileType
  if (f.custodianIra === "yes") return PROFILE_TYPE_ENTITY_CUSTODIAN
  return PROFILE_TYPE_ENTITY_LLC_CORP_TRUST
}

function parseSavedWizardObject(raw: unknown): Record<string, unknown> | null {
  let v: unknown = raw
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return null
    try {
      v = JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null
  const rec = v as Record<string, unknown>
  const inner = rec.form
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const formRec = inner as Record<string, unknown>
    if (
      "firstName" in formRec ||
      "first_name" in formRec ||
      "profileType" in formRec ||
      "profile_type" in formRec ||
      "entityLegalName" in formRec ||
      "legalIraName" in formRec
    ) {
      if (
        ADD_PROFILE_WIZARD_STEP_KEY in rec &&
        !(ADD_PROFILE_WIZARD_STEP_KEY in formRec)
      ) {
        return {
          ...formRec,
          [ADD_PROFILE_WIZARD_STEP_KEY]: rec[ADD_PROFILE_WIZARD_STEP_KEY],
        }
      }
      return formRec
    }
  }
  return rec
}

function wizardFieldValue(
  src: Record<string, unknown>,
  camelKey: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(src, camelKey)) return src[camelKey]
  const snake = camelKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  if (snake !== camelKey && Object.prototype.hasOwnProperty.call(src, snake)) {
    return src[snake]
  }
  return undefined
}

function coerceFormString(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "boolean") return v ? "yes" : "no"
  return ""
}

function isPresentFormValue(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  if (typeof v === "boolean" || typeof v === "number") return true
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return true
  return false
}

function normalizeDistributionMethodValue(v: unknown): DistributionMethod | "" {
  const t = coerceFormString(v).trim().toLowerCase()
  if (t === "ach" || t === "check" || t === "other") return t
  return ""
}

function normalizeMailingAddressModeValue(
  v: unknown,
): FormState["mailingAddressMode"] | "" {
  const t = coerceFormString(v).trim()
  if (t === "add_new" || t === "same_as_tax") return t
  return ""
}

function normalizeYesNoValue(v: unknown): "" | "yes" | "no" {
  const t = coerceFormString(v).trim().toLowerCase()
  if (t === "yes" || t === "true" || t === "1") return "yes"
  if (t === "no" || t === "false" || t === "0") return "no"
  return ""
}

function normalizeDateInputValue(v: unknown): string {
  const t = coerceFormString(v).trim()
  if (!t) return ""
  const isoDay = t.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDay) return isoDay[1]!
  const ms = Date.parse(t)
  if (Number.isNaN(ms)) return t
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function restoreBeneficiaryDraft(raw: unknown): BeneficiaryDraft | null {
  if (raw == null) return null
  if (typeof raw !== "object" || Array.isArray(raw)) return null
  const b = raw as Record<string, unknown>
  const phoneRaw = coerceFormString(b.phone ?? b.phone_number)
  return {
    fullName: coerceFormString(b.fullName ?? b.full_name),
    relationship: coerceFormString(b.relationship),
    taxId: formatSsnItinInput(coerceFormString(b.taxId ?? b.tax_id)),
    phone: nationalDigitsFromStoredPhone(phoneRaw),
    email: coerceFormString(b.email),
    addressQuery: coerceFormString(b.addressQuery ?? b.address_query),
  }
}

/**
 * Merge saved `profile_wizard_state` (same shape as `FormState`) into a partial.
 * Parses JSON strings, nested `{ form }` wrappers, and snake_case keys. Empty
 * strings are omitted so list-row seed / defaults can fill gaps.
 */
function partialFormFromSavedWizard(raw: unknown): Partial<FormState> {
  const src = parseSavedWizardObject(raw)
  if (!src) return {}
  const out: Partial<FormState> = {}
  for (const k of FORM_STATE_KEYS) {
    const v = wizardFieldValue(src, k as string)
    if (v === undefined) continue
    if (k === "beneficiary") {
      if (v == null) continue
      const restored = restoreBeneficiaryDraft(v)
      if (restored) out.beneficiary = restored
      continue
    }
    if (k === "phone2") {
      const digits = nationalDigitsFromStoredPhone(coerceFormString(v))
      if (digits) out.phone2 = digits
      continue
    }
    if (k === "distributionMethod") {
      const method = normalizeDistributionMethodValue(v)
      if (method) out.distributionMethod = method
      continue
    }
    if (k === "mailingAddressMode") {
      const mode = normalizeMailingAddressModeValue(v)
      if (mode) out.mailingAddressMode = mode
      continue
    }
    if (
      k === "entityOwnedByIra401k" ||
      k === "entityDisregarded" ||
      k === "custodianIra"
    ) {
      const yn = normalizeYesNoValue(v)
      if (yn) (out as Record<string, unknown>)[k] = yn
      continue
    }
    if (k === "entityDateFormed") {
      const day = normalizeDateInputValue(v)
      if (day) out.entityDateFormed = day
      continue
    }
    if (k === "ssn" || k === "spouseSsn") {
      const formatted = formatSsnItinInput(coerceFormString(v))
      if (formatted) (out as Record<string, unknown>)[k] = formatted
      continue
    }
    if (k === "entityEinVisible" || k === "iraPartnerEinVisible" || k === "iraCustodianEinVisible") {
      if (typeof v === "boolean") (out as Record<string, unknown>)[k] = v
      continue
    }
    if (!isPresentFormValue(v)) continue
    if (typeof v === "string" || typeof v === "number") {
      (out as Record<string, unknown>)[k] = coerceFormString(v)
    } else {
      (out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

function normalizeProfileTypeFromListRow(raw: string): Partial<FormState> {
  const t = raw.trim()
  if (!t) return {}
  if (t === PROFILE_TYPE_INDIVIDUAL) {
    return { profileType: PROFILE_TYPE_INDIVIDUAL }
  }
  if (t === PROFILE_TYPE_JOINT_TENANCY) {
    return { profileType: PROFILE_TYPE_JOINT_TENANCY }
  }
  if (t === PROFILE_TYPE_ENTITY) {
    return { profileType: PROFILE_TYPE_ENTITY }
  }
  const lower = t.toLowerCase()
  if (lower.includes("custodian")) {
    return { profileType: PROFILE_TYPE_ENTITY, custodianIra: "yes" }
  }
  if (lower.includes("joint")) {
    return { profileType: PROFILE_TYPE_JOINT_TENANCY }
  }
  if (
    lower.includes("llc") ||
    lower.includes("corp") ||
    lower.includes("partnership") ||
    lower.includes("trust") ||
    lower.includes("checkbook")
  ) {
    return { profileType: PROFILE_TYPE_ENTITY, custodianIra: "no" }
  }
  return { profileType: t }
}

function mergeDistributionBankIntoForm(
  form: FormState,
  bank: InvestorProfileDistributionBank | undefined,
): FormState {
  if (!bank) return form
  const method =
    normalizeDistributionMethodValue(form.distributionMethod) ||
    normalizeDistributionMethodValue(bank.distributionMethod)
  return {
    ...form,
    distributionMethod: method || form.distributionMethod,
    achRoutingNumber:
      form.achRoutingNumber.trim() || bank.achRoutingNumber || form.achRoutingNumber,
    achAccountNumber:
      form.achAccountNumber.trim() || bank.achAccountNumber || form.achAccountNumber,
    achBankAddress:
      form.achBankAddress.trim() || bank.achBankAddress || form.achBankAddress,
    achBankName: form.achBankName.trim() || bank.achBankName || form.achBankName,
    achBankAccountType:
      form.achBankAccountType.trim() ||
      bank.achBankAccountType ||
      form.achBankAccountType,
    bankAccountQuery:
      form.bankAccountQuery.trim() || bank.bankAccountQuery || form.bankAccountQuery,
    checkPayeeName:
      form.checkPayeeName.trim() || bank.checkPayeeName || form.checkPayeeName,
    checkMailingAddressId:
      form.checkMailingAddressId.trim() ||
      bank.checkMailingAddressId ||
      form.checkMailingAddressId,
  }
}

function formStateFromProfileRow(row: InvestorProfileListRow): FormState {
  const fromWizard = partialFormFromSavedWizard(row.profileWizardState ?? null)
  const typePatch = normalizeProfileTypeFromListRow(row.profileType)
  const seeded = seedFormFromListRow(row)
  let next: FormState = {
    ...initialState,
    ...seeded,
    ...typePatch,
    ...fromWizard,
  }
  next = mergeDistributionBankIntoForm(next, row.distributionBank)
  const profileType =
    (next.profileType || typePatch.profileType || row.profileType || "").trim()
  next = { ...next, profileType }

  if (next.profileType === PROFILE_TYPE_ENTITY && !next.custodianIra) {
    if (next.legalIraName.trim() || next.iraCompany.trim()) {
      next = { ...next, custodianIra: "yes" }
    } else if (next.entityLegalName.trim() || next.entitySubType.trim()) {
      next = { ...next, custodianIra: "no" }
    }
  }

  if (
    next.mailingAddressMode !== "same_as_tax" &&
    next.taxAddressId.trim() &&
    next.mailingAddressId.trim() &&
    next.taxAddressId === next.mailingAddressId
  ) {
    next = { ...next, mailingAddressMode: "same_as_tax" }
  }

  if (
    next.profileType === PROFILE_TYPE_JOINT_TENANCY ||
    next.profileType === PROFILE_TYPE_ENTITY
  ) {
    next = { ...next, beneficiary: null, beneficiaryPickId: "" }
  }
  return next
}

const REQUIRED_MSG = "This field is required."

type AddProfileFieldErrorKey =
  | "profileType"
  | "entitySubType"
  | "entityLegalName"
  | "entityJurisdictionOfRegistration"
  | "entityDisregarded"
  | "entityEin"
  | "custodianIra"
  | "legalIraName"
  | "iraCompany"
  | "iraPartnerEin"
  | "iraCustodianEin"
  | "federalTaxClassification"
  | "firstName"
  | "lastName"
  | "email1"
  | "firstName2"
  | "lastName2"
  | "email2"
  | "phone2"
  | "ssn"
  | "spouseSsn"
  | "bankAccountQuery"
  | "achRoutingNumber"
  | "achAccountNumber"
  | "achBankAddress"
  | "achBankName"
  | "achBankAccountType"
  | "checkPayeeName"
  | "checkMailingAddressId"
  | "taxAddressId"
  | "mailingAddressId"

type AddProfileFieldErrors = Partial<Record<AddProfileFieldErrorKey, string>>

/** `um_field_input_invalid` (same as Add contact) when `hasError`. */
function invClass(base: string, hasError: boolean) {
  return hasError ? `${base} um_field_input_invalid` : base
}

function achRoutingNumberError(raw: string): string | undefined {
  return abaRoutingNumberFieldError(raw, { required: true }) ?? undefined
}

function achAccountNumberError(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return REQUIRED_MSG
  if (trimmed.replace(/\D/g, "").length < 4) {
    return "Enter a valid account number (at least 4 digits)."
  }
  return undefined
}

function hasDistributionFieldErrors(err: AddProfileFieldErrors): boolean {
  return Boolean(
    err.bankAccountQuery ||
      err.achRoutingNumber ||
      err.achAccountNumber ||
      err.achBankAddress ||
      err.achBankName ||
      err.achBankAccountType ||
      err.checkPayeeName ||
      err.checkMailingAddressId,
  )
}

/** Required distribution fields: check uses payee + saved address; ACH uses bank fields; other uses free text. */
function applyRequiredSsnItinFieldError(
  raw: string,
  into: AddProfileFieldErrors,
  key: "ssn" = "ssn",
) {
  const msg = ssnItinFieldError(raw, {
    required: true,
    requiredMessage: REQUIRED_MSG,
  })
  if (msg) into[key] = msg
}

function applyOptionalSsnItinFieldError(
  raw: string,
  into: AddProfileFieldErrors,
  key: "spouseSsn",
) {
  if (!raw.trim()) return
  const msg = ssnItinFieldError(raw, { required: false })
  if (msg) into[key] = msg
}

function applyRequiredEmailFieldError(
  raw: string,
  into: AddProfileFieldErrors,
  key: "email1" | "email2",
) {
  const msg = getEmailFieldError(raw, { required: true })
  if (msg) into[key] = msg
}

function applyOptionalUsPhoneFieldError(
  raw: string,
  into: AddProfileFieldErrors,
  key: "phone2",
) {
  const msg = getUsPhoneFieldError(raw, { required: false })
  if (msg) into[key] = msg
}

function addDistributionValidationErrors(
  f: FormState,
  into: AddProfileFieldErrors,
) {
  if (f.distributionMethod === "check") {
    if (!f.checkPayeeName.trim()) into.checkPayeeName = REQUIRED_MSG
    if (!f.checkMailingAddressId.trim()) {
      into.checkMailingAddressId =
        "Select a check mailing address from your saved addresses, or add one in the Address tab first."
    }
  } else if (f.distributionMethod === "ach") {
    const routingErr = achRoutingNumberError(f.achRoutingNumber)
    if (routingErr) into.achRoutingNumber = routingErr
    const accountErr = achAccountNumberError(f.achAccountNumber)
    if (accountErr) into.achAccountNumber = accountErr
    if (!f.achBankAddress.trim()) into.achBankAddress = REQUIRED_MSG
    if (!f.achBankName.trim()) into.achBankName = REQUIRED_MSG
    if (!f.achBankAccountType.trim()) into.achBankAccountType = REQUIRED_MSG
  } else if (!f.bankAccountQuery.trim()) {
    into.bankAccountQuery =
      "Enter distribution instructions for your selected method."
  }
}

function distributionDetailsLabel(m: DistributionMethod): string {
  switch (m) {
    case "ach":
      return "Distribution bank account"
    case "check":
      return "Check payee and mailing"
    case "other":
      return "Distribution instructions"
    default:
      return "Distribution details"
  }
}

function distributionDetailsHint(m: DistributionMethod): string {
  switch (m) {
    case "ach":
      return "This is used for receiving ACH distributions"
    case "check":
      return "Enter the payee name, then select where checks should be mailed from your saved addresses"
    case "other":
      return "How you or your entity will receive distributions (contact your fund admin if unsure)"
    default:
      return ""
  }
}

function distributionDetailsPlaceholder(m: DistributionMethod): string {
  if (m === "ach") return "Enter bank account details"
  if (m === "check") return "Search or enter payee and address"
  if (m === "other") return "Enter details"
  return "Enter details"
}

function distributionDetailsInputAria(m: DistributionMethod): string {
  if (m === "ach") return "Search distribution bank account"
  if (m === "check") return "Check payee and mailing details"
  if (m === "other") return "Other distribution instructions"
  return "Distribution details"
}

const EDIT_WIZARD_REASON_LABEL = "Reason for change" as const

type AchDistributionBankFieldsProps = {
  form: FormState
  fieldError: AddProfileFieldErrors
  patch: (
    partial: Partial<FormState>,
    clearFieldErrors?: AddProfileFieldErrorKey | AddProfileFieldErrorKey[],
  ) => void
  invClass: (base: string, hasError: boolean) => string
}

function AchDistributionBankFields({
  form,
  fieldError,
  patch,
  invClass,
}: AchDistributionBankFieldsProps) {
  return (
    <>
      <p className="add_contact_section_eyebrow" style={{ marginTop: 0 }}>
        {distributionDetailsLabel("ach")}{" "}
        <span className="contacts_required" aria-hidden>*</span>
      </p>
      <InvestingFormField
        id="ap-ach-bank"
        label={
          <>
            Bank <span className="contacts_required" aria-hidden>*</span>
          </>
        }
        Icon={Building2}
        error={fieldError.achBankName}
      >
        <input
          id="ap-ach-bank"
          className={invClass(
            "deals_add_inv_input deals_add_inv_field_control",
            Boolean(fieldError.achBankName),
          )}
          value={form.achBankName}
          onChange={(e) => patch({ achBankName: e.target.value }, "achBankName")}
          autoComplete="organization"
          placeholder="Bank name"
          aria-invalid={Boolean(fieldError.achBankName)}
          aria-describedby={fieldError.achBankName ? "ap-ach-bank-err" : undefined}
        />
      </InvestingFormField>
      <InvestingFormField
        id="ap-ach-type"
        label={
          <>
            Type of bank account <span className="contacts_required" aria-hidden>*</span>
          </>
        }
        Icon={CircleDollarSign}
        error={fieldError.achBankAccountType}
        tight
      >
        <DealsCreateDropdownSelect
          id="ap-ach-type"
          options={ACH_BANK_ACCOUNT_TYPE_OPTIONS}
          value={form.achBankAccountType}
          onChange={(v) => patch({ achBankAccountType: v }, "achBankAccountType")}
          placeholder="Select account type"
          invalid={Boolean(fieldError.achBankAccountType)}
          ariaLabel="Type of bank account"
          ariaDescribedBy={
            fieldError.achBankAccountType ? "ap-ach-type-err" : undefined
          }
          triggerClassName="deals_add_inv_field_control"
        />
      </InvestingFormField>
      <div className="add_contact_name_grid">
        <InvestingFormField
          id="ap-ach-routing"
          label={
            <>
              Routing number <span className="contacts_required" aria-hidden>*</span>
            </>
          }
          Icon={Fingerprint}
          error={fieldError.achRoutingNumber}
          tight
        >
          <input
            id="ap-ach-routing"
            className={invClass(
              "deals_add_inv_input deals_add_inv_field_control",
              Boolean(fieldError.achRoutingNumber),
            )}
            value={form.achRoutingNumber}
            onChange={(e) =>
              patch(
                {
                  achRoutingNumber: digitsFromAbaRoutingInput(e.target.value),
                },
                "achRoutingNumber",
              )
            }
            inputMode="numeric"
            autoComplete="off"
            placeholder="9-digit routing number"
            aria-invalid={Boolean(fieldError.achRoutingNumber)}
            aria-describedby={
              fieldError.achRoutingNumber ? "ap-ach-routing-err" : undefined
            }
          />
        </InvestingFormField>
        <InvestingFormField
          id="ap-ach-account"
          label={
            <>
              Account number <span className="contacts_required" aria-hidden>*</span>
            </>
          }
          Icon={IdCard}
          error={fieldError.achAccountNumber}
          tight
        >
          <input
            id="ap-ach-account"
            className={invClass(
              "deals_add_inv_input deals_add_inv_field_control add_profile_account_number",
              Boolean(fieldError.achAccountNumber),
            )}
            value={form.achAccountNumber}
            onChange={(e) => patch({ achAccountNumber: e.target.value }, "achAccountNumber")}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Account number"
            aria-invalid={Boolean(fieldError.achAccountNumber)}
            aria-describedby={
              fieldError.achAccountNumber ? "ap-ach-account-err" : undefined
            }
          />
        </InvestingFormField>
      </div>
      <InvestingFormField
        id="ap-ach-address"
        label={
          <>
            Bank address <span className="contacts_required" aria-hidden>*</span>
          </>
        }
        Icon={MapPin}
        error={fieldError.achBankAddress}
      >
        <textarea
          id="ap-ach-address"
          className={invClass(
            "deals_add_inv_input deals_add_inv_field_control",
            Boolean(fieldError.achBankAddress),
          )}
          value={form.achBankAddress}
          onChange={(e) => patch({ achBankAddress: e.target.value }, "achBankAddress")}
          rows={3}
          autoComplete="street-address"
          placeholder="Street, city, state, ZIP"
          aria-invalid={Boolean(fieldError.achBankAddress)}
          aria-describedby={
            fieldError.achBankAddress ? "ap-ach-address-err" : undefined
          }
        />
      </InvestingFormField>
    </>
  )
}

interface AddInvestorProfileModalProps {
  open: boolean
  onClose: () => void
  /** Saved addresses from the Address tab, shown in tax / mailing dropdowns. */
  savedAddresses?: SavedAddress[]
  /** Saved beneficiaries; only the Individual path shows the beneficiary step (a dropdown, no inline add). */
  savedBeneficiaries?: ProfileBookSnapshot["beneficiaries"]
  /** Active profile list used to block duplicate name + type on save. */
  existingProfiles?: InvestorProfileListRow[]
  /** Called after a new address is saved from the profile wizard dropdown. */
  onAddressAdded?: (address: SavedAddress) => void
  /** Called after a new beneficiary is saved from the profile wizard dropdown. */
  onBeneficiaryAdded?: (row: ProfileBookSnapshot["beneficiaries"][number]) => void
  /**
   * `add` (default): 4 or 5 content steps (5 only for Individual, includes optional Beneficiary), then save. `edit`: same, then a final step for the audit reason, then `onProfileUpdated`.
   */
  mode?: "add" | "edit"
  /**
   * When `mode=edit`, the profile list row (includes `profileWizardState` when saved) and `id` for the PUT.
   * Wizard JSON is merged with list fields and distribution-bank columns so prior values prefill the form.
   */
  editTarget?: InvestorProfileListRow | null
  /** Fired with display fields after validation; parent may persist the profile. May return a Promise. */
  onProfileCreated?: (
    p: NewInvestorProfilePayload,
    opts?: { existingId?: string },
  ) => void | Promise<void>
  onProfileUpdated?: (id: string, p: UpdateInvestorProfilePayload) => void | Promise<void>
  /**
   * Fresh `/investing/profiles/add` without `resume=1`: empty form; session draft stays for the list row.
   * With `resume=1`, restore session (or `resumeFromProfile` when the API row exists but session was cleared).
   */
  resumeDraft?: boolean
  resumeFromProfile?: InvestorProfileListRow | null
  /**
   * `inline`: in-tab panel. `page`: full-page like Create deal (parent supplies shell).
   * @default "modal"
   */
  variant?: "modal" | "inline" | "page"
}

function FieldHelp({
  label,
  tooltip,
}: {
  label: string
  /** Native tooltip; use for a short field description. */
  tooltip?: string
}) {
  const tip = tooltip?.trim() || "More information"
  const aria = tooltip?.trim() || `${label} — more information`
  return (
    <button
      type="button"
      className="investing_field_hint"
      aria-label={aria}
      title={tip}
    >
      <Info size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

function MailingAddressFields({
  idPrefix,
  label,
  taxAddressId,
  mailingAddressId,
  mailingAddressMode,
  mailingError,
  savedAddresses,
  onPatch,
  onOpenAddMailing,
  emptyLabel,
}: {
  idPrefix: string
  label: ReactNode
  taxAddressId: string
  mailingAddressId: string
  mailingAddressMode: FormState["mailingAddressMode"]
  mailingError?: string
  savedAddresses: SavedAddress[]
  onPatch: (
    partial: Partial<FormState>,
    clearFieldErrors?: AddProfileFieldErrorKey | AddProfileFieldErrorKey[],
  ) => void
  onOpenAddMailing: () => void
  emptyLabel: string
}) {
  const sameAsTax = mailingAddressMode === "same_as_tax"
  const displayMailingId = sameAsTax ? taxAddressId : mailingAddressId

  return (
    <InvestingFormField
      id={`${idPrefix}-mail-addr`}
      fieldClassName="um_field add_profile_mailing_field"
      label={label}
      Icon={MapPin}
      error={mailingError}
      labelSuffix={
        <label className="add_profile_same_as_tax" htmlFor={`${idPrefix}-mail-same`}>
          <input
            id={`${idPrefix}-mail-same`}
            type="checkbox"
            className="add_profile_same_as_tax_checkbox"
            checked={sameAsTax}
            onChange={(e) => {
              if (e.target.checked) {
                onPatch(
                  {
                    mailingAddressMode: "same_as_tax",
                    mailingAddressId: taxAddressId,
                  },
                  "mailingAddressId",
                )
              } else {
                onPatch({ mailingAddressMode: "add_new" }, "mailingAddressId")
              }
            }}
          />
          <span className="add_profile_same_as_tax_text">Same as tax address</span>
        </label>
      }
    >
      <SavedAddressSelect
        id={`${idPrefix}-mail-addr`}
        value={displayMailingId}
        onChange={(v) => {
          if (!sameAsTax) onPatch({ mailingAddressId: v }, "mailingAddressId")
        }}
        savedAddresses={savedAddresses}
        emptyLabel={
          sameAsTax && !taxAddressId.trim()
            ? "Select tax address first"
            : emptyLabel
        }
        ariaLabel={
          sameAsTax
            ? "Mailing address — same as tax address"
            : "Mailing address — select a saved address"
        }
        disabled={sameAsTax}
        invalid={Boolean(mailingError)}
        onAddNew={sameAsTax ? undefined : onOpenAddMailing}
      />
    </InvestingFormField>
  )
}

function beneficiaryToDraft(
  row: BeneficiaryDraft & { id: string },
): BeneficiaryDraft {
  return {
    fullName: row.fullName,
    relationship: row.relationship,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    addressQuery: row.addressQuery,
  }
}

function formatSavedBeneficiaryLabel(
  row: BeneficiaryDraft & { id: string },
): string {
  const name = row.fullName?.trim() || "—"
  const rel = row.relationship?.trim()
  return rel ? `${name} (${rel})` : name
}

function SavedBeneficiarySelect({
  id,
  value,
  onChange,
  rows,
  emptyLabel,
  ariaLabel,
  onAddNew,
}: {
  id: string
  value: string
  onChange: (nextId: string) => void
  rows: (BeneficiaryDraft & { id: string })[]
  emptyLabel: string
  ariaLabel: string
  onAddNew?: () => void
}) {
  const noRows = rows.length === 0
  const canAddFromDropdown = Boolean(onAddNew)
  const options = useMemo(
    () => [
      { value: "", label: emptyLabel },
      ...rows.map((r) => ({
        value: r.id,
        label: formatSavedBeneficiaryLabel(r),
      })),
    ],
    [rows, emptyLabel],
  )
  return (
    <>
      {noRows && !canAddFromDropdown ? (
        <p className="add_profile_sub" style={{ marginBottom: "0.35em" }}>
          Add at least one beneficiary in the <strong>Beneficiaries</strong> tab, then return
          here to select one. You can also continue without a beneficiary.
        </p>
      ) : null}
      <DealsCreateDropdownSelect
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={emptyLabel}
        ariaLabel={ariaLabel}
        disabled={noRows && !canAddFromDropdown}
        triggerClassName="deals_add_inv_field_control"
        panelClassName="deals_create_dropdown_panel"
        header={
          canAddFromDropdown
            ? { label: "+ Add Beneficiary", onClick: onAddNew! }
            : undefined
        }
      />
    </>
  )
}

function buildDisplayProfileName(f: FormState): string {
  if (f.profileType === PROFILE_TYPE_ENTITY) {
    if (f.custodianIra === "yes" && f.legalIraName.trim()) {
      return f.legalIraName.trim()
    }
    const name = f.entityLegalName.trim()
    const sub = ENTITY_SUBTYPE_OPTIONS.find((o) => o.value === f.entitySubType)
    const kind = sub?.label ?? f.entitySubType.trim()
    if (name && kind) return `${name} (${kind})`
    return name || kind || "—"
  }
  if (f.profileType === PROFILE_TYPE_JOINT_TENANCY) {
    const a = [f.firstName, f.middleName, f.lastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
    const b = [f.firstName2, f.middleName2, f.lastName2]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
    if (a && b) return `${a} & ${b}`
    return a || b || "—"
  }
  return [f.firstName, f.middleName, f.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
}

function buildProfileNameForPersist(f: FormState): string {
  const name = buildDisplayProfileName(f)
  return name === "—" ? AUTOSAVE_DEFAULT_PROFILE_NAME : name
}

/**
 * Best-effort seed of wizard fields from API list row when wizard JSON is missing
 * or incomplete. Fills name splits and normalizes stored profile-type labels.
 */
function seedFormFromListRow(row: { profileName: string; profileType: string }): Partial<FormState> {
  const typePatch = normalizeProfileTypeFromListRow(row.profileType)
  const t = (typePatch.profileType || row.profileType || "").trim()
  const out: Partial<FormState> = { ...typePatch, profileType: t }
  const name = (row.profileName || "").trim()
  if (!name || name === "—") return out
  if (t === PROFILE_TYPE_ENTITY) {
    const paren = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (paren) {
      const inner = paren[2]!.trim()
      const sub = ENTITY_SUBTYPE_OPTIONS.find(
        (o) => o.label === inner || inner.includes(o.label) || o.label.includes(inner),
      )
      return {
        ...out,
        entityLegalName: paren[1]!.trim(),
        ...(sub ? { entitySubType: sub.value } : {}),
      }
    }
    return { ...out, entityLegalName: name }
  }
  if (t === PROFILE_TYPE_JOINT_TENANCY) {
    const m = name.match(/^(.*)\s+&\s+(.*)$/)
    if (m) {
      const left = m[1]!.trim().split(/\s+/)
      const right = m[2]!.trim().split(/\s+/)
      return {
        ...out,
        firstName: left[0] || "",
        lastName: left.length > 1 ? left[left.length - 1]! : "",
        middleName: left.length > 2 ? left.slice(1, -1).join(" ") : "",
        firstName2: right[0] || "",
        lastName2: right.length > 1 ? right[right.length - 1]! : "",
        middleName2: right.length > 2 ? right.slice(1, -1).join(" ") : "",
      }
    }
    return out
  }
  if (t === PROFILE_TYPE_INDIVIDUAL) {
    const p = name.split(/\s+/).filter(Boolean)
    if (p.length === 0) return out
    if (p.length === 1) return { ...out, firstName: p[0]! }
    return {
      ...out,
      firstName: p[0]!,
      lastName: p[p.length - 1]!,
      middleName: p.length > 2 ? p.slice(1, -1).join(" ") : "",
    }
  }
  return out
}

type AddressPickField = "taxAddressId" | "mailingAddressId" | "checkMailingAddressId"

export function AddInvestorProfileModal({
  open,
  onClose,
  savedAddresses = [],
  savedBeneficiaries = [] as ProfileBookSnapshot["beneficiaries"],
  existingProfiles = [],
  onAddressAdded,
  onBeneficiaryAdded,
  mode = "add",
  editTarget = null,
  onProfileCreated,
  onProfileUpdated,
  variant = "modal",
  resumeDraft = false,
  resumeFromProfile = null,
}: AddInvestorProfileModalProps) {
  const isListInline = variant === "inline"
  const isPage = variant === "page"
  const isNonModalLayout = isListInline || isPage
  const isEdit = mode === "edit"
  const enableAddDraftAutosave = isPage && !isEdit
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && editTarget
      ? formStateFromProfileRow(editTarget)
      : initialState,
  )
  const [fieldError, setFieldError] = useState<AddProfileFieldErrors>({})
  const [step, setStep] = useState(1)
  const profileFormRef = useRef<HTMLFormElement>(null)
  const stepScrollBootRef = useRef(true)
  const [lastEditReason, setLastEditReason] = useState("")
  const [lastEditReasonError, setLastEditReasonError] = useState<string | null>(null)
  const [backendProfileId, setBackendProfileId] = useState<string | null>(null)
  const backendProfileIdRef = useRef<string | null>(null)
  const createPostInFlightRef = useRef(false)
  const backendAutosaveInFlightRef = useRef(false)
  const addProfileDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backendAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestAddProfileDraftRef = useRef({
    form: initialState,
    step: 1,
    backendProfileId: null as string | null,
  })
  const skipOverwriteEmptySessionDraftRef = useRef(false)
  const lastEditPrefillIdRef = useRef<string | null>(null)

  const activeSavedBeneficiaries = useMemo(
    () => savedBeneficiaries.filter((b) => !b.archived),
    [savedBeneficiaries],
  )
  const activeSavedAddresses = useMemo(
    () => savedAddresses.filter((a) => !a.archived),
    [savedAddresses],
  )

  const [addAddressOpen, setAddAddressOpen] = useState(false)
  const [addBeneficiaryOpen, setAddBeneficiaryOpen] = useState(false)
  const [ssnVisible, setSsnVisible] = useState(false)
  const [spouseSsnVisible, setSpouseSsnVisible] = useState(false)
  const [addressPickField, setAddressPickField] = useState<AddressPickField | null>(
    null,
  )

  const openAddAddressModal = useCallback((field: AddressPickField) => {
    setAddressPickField(field)
    setAddAddressOpen(true)
  }, [])

  const closeAddAddressModal = useCallback(() => {
    setAddAddressOpen(false)
    setAddressPickField(null)
  }, [])

  const closeAddBeneficiaryModal = useCallback(() => {
    setAddBeneficiaryOpen(false)
  }, [])

  const addProfilePageTitleId = useId()
  const isIndividual = form.profileType === PROFILE_TYPE_INDIVIDUAL
  const isJointTenancy = form.profileType === PROFILE_TYPE_JOINT_TENANCY
  const isEntity = form.profileType === PROFILE_TYPE_ENTITY
  const hasBeneficiaryStep = !isJointTenancy && !isEntity
  const addFlowLastContentStep = hasBeneficiaryStep
    ? ADD_LAST_STEP_WITH_BENEFICIARY
    : ADD_LAST_STEP_NO_BENEFICIARY
  const stepperLabels = useMemo(
    () => {
      const addLabels = (hasBeneficiaryStep
        ? ADD_PROFILE_WIZARD_STEP_LABELS
        : ADD_PROFILE_WIZARD_STEPS_NO_BENEFICIARY) as string[]
      return (isEdit ? [...addLabels, EDIT_WIZARD_REASON_LABEL] : addLabels) as string[]
    },
    [isEdit, hasBeneficiaryStep],
  )
  const totalSteps = stepperLabels.length
  const effectiveMaxStep = totalSteps

  const stepHeading = useMemo(() => {
    if (step >= 1 && step <= totalSteps) {
      return stepperLabels[step - 1] ?? (isEdit ? "Edit profile" : "Add profile")
    }
    return isEdit ? "Edit profile" : "Add profile"
  }, [step, totalSteps, stepperLabels, isEdit])

  const addProfilePageSubtitle = useMemo(() => {
    if (isEdit && step === totalSteps) {
      return "Describe why you are updating this profile. This is stored in the audit trail."
    }
    if (step === 1) {
      return isEdit
        ? "Update details using the same steps as when the profile was added. Then confirm your change reason."
        : "Select how this profile will be registered."
    }
    if (isJointTenancy) {
      if (step === 2) return "Names, emails, and tax ID for both joint owners."
      if (step === 3) return "How you want to receive distributions."
      if (step === 4) return "Tax and mailing address for this profile."
    }
    if (isEntity) {
      if (step === 2) return "Entity or plan name, EIN, and account information."
      if (step === 3) return "How you want to receive distributions."
      if (step === 4) return "Mailing and legal address for this profile."
    }
    if (isIndividual) {
      if (step === 2)
        return "Legal name, SSN or TIN, and contact information."
      if (step === 3) return "How you want to receive distributions."
      if (step === 4) return "Mailing and legal address for this profile."
      if (step === 5) return "Optional designated beneficiary for this account."
    }
    return "Set up a profile for investments and distributions."
  }, [step, isEdit, isJointTenancy, isEntity, isIndividual, totalSteps])

  useEffect(() => {
    latestAddProfileDraftRef.current = { form, step, backendProfileId }
  }, [form, step, backendProfileId])

  const persistAddProfileDraftNow = useCallback(() => {
    if (!enableAddDraftAutosave) return
    const { form: f, step: st, backendProfileId: bid } =
      latestAddProfileDraftRef.current
    const payload = {
      form: profileWizardStateForPersist(f, st),
      step: st,
      ...(bid ? { backendProfileId: bid } : {}),
    }
    if (
      skipOverwriteEmptySessionDraftRef.current &&
      !addProfileDraftHasContent(payload)
    ) {
      return
    }
    skipOverwriteEmptySessionDraftRef.current = false
    saveAddProfileDraft(payload)
  }, [enableAddDraftAutosave])

  const handleClose = useCallback(() => {
    persistAddProfileDraftNow()
    onClose()
  }, [persistAddProfileDraftNow, onClose])

  useEffect(() => {
    if (!open) {
      lastEditPrefillIdRef.current = null
      return
    }
    if (isEdit && editTarget) {
      if (lastEditPrefillIdRef.current === editTarget.id) return
      lastEditPrefillIdRef.current = editTarget.id
      setFieldError({})
      setSsnVisible(false)
      setSpouseSsnVisible(false)
      setLastEditReason("")
      setLastEditReasonError(null)
      stepScrollBootRef.current = true
      setStep(1)
      setForm(formStateFromProfileRow(editTarget))
      setBackendProfileId(null)
      backendProfileIdRef.current = null
      skipOverwriteEmptySessionDraftRef.current = false
      return
    }
    lastEditPrefillIdRef.current = null
    setFieldError({})
    setSsnVisible(false)
    setSpouseSsnVisible(false)
    setLastEditReason("")
    setLastEditReasonError(null)
    stepScrollBootRef.current = true
    if (!isEdit && enableAddDraftAutosave && resumeDraft) {
      skipOverwriteEmptySessionDraftRef.current = false
      const restored = loadAddProfileDraft()
      const apiProfileId = resumeFromProfile?.id?.trim() ?? ""

      if (apiProfileId && resumeFromProfile) {
        if (
          restored &&
          addProfileDraftHasContent(restored) &&
          restored.backendProfileId?.trim() === apiProfileId
        ) {
          const fromWizard = partialFormFromSavedWizard(restored.form)
          const restoredStep =
            restored.step >= 1
              ? restored.step
              : readWizardStepFromSavedForm(restored.form) ?? 1
          setForm(mergeKnownSsnIntoForm({ ...initialState, ...fromWizard }, existingProfiles))
          setStep(restoredStep)
          setBackendProfileId(apiProfileId)
          backendProfileIdRef.current = apiProfileId
          return
        }
        const nextForm = formStateFromProfileRow(resumeFromProfile)
        const sessionForApi = loadAddProfileDraft()
        const stepFromSession =
          sessionForApi?.backendProfileId?.trim() === resumeFromProfile.id &&
          sessionForApi.step >= 1
            ? sessionForApi.step
            : null
        const stepFromWizard =
          readWizardStepFromSavedForm(
            parseSavedWizardObject(resumeFromProfile.profileWizardState) ?? undefined,
          )
        const nextStep = stepFromSession ?? stepFromWizard ?? 1
        setForm(mergeKnownSsnIntoForm(nextForm, existingProfiles))
        setStep(nextStep)
        setBackendProfileId(resumeFromProfile.id)
        backendProfileIdRef.current = resumeFromProfile.id
        saveAddProfileDraft({
          form: profileWizardStateForPersist(nextForm, nextStep),
          step: nextStep,
          backendProfileId: resumeFromProfile.id,
        })
        return
      }

      if (restored && addProfileDraftHasContent(restored)) {
        const fromWizard = partialFormFromSavedWizard(restored.form)
        const restoredStep =
          restored.step >= 1
            ? restored.step
            : readWizardStepFromSavedForm(restored.form) ?? 1
        setForm(mergeKnownSsnIntoForm({ ...initialState, ...fromWizard }, existingProfiles))
        setStep(restoredStep)
        const bid = restored.backendProfileId?.trim()
        if (bid) {
          setBackendProfileId(bid)
          backendProfileIdRef.current = bid
        } else {
          setBackendProfileId(null)
          backendProfileIdRef.current = null
        }
        return
      }
      setForm(addProfileFormWithKnownSsn(existingProfiles))
      setStep(1)
      setBackendProfileId(null)
      backendProfileIdRef.current = null
      return
    }
    if (!isEdit && enableAddDraftAutosave) {
      skipOverwriteEmptySessionDraftRef.current = true
    }
    setStep(1)
    setForm(addProfileFormWithKnownSsn(existingProfiles))
    setBackendProfileId(null)
    backendProfileIdRef.current = null
  }, [open, isEdit, editTarget, enableAddDraftAutosave, resumeDraft, resumeFromProfile, existingProfiles])

  /** Autosave add-profile wizard draft in sessionStorage (page add flow only). */
  useEffect(() => {
    if (!open || !enableAddDraftAutosave) {
      if (addProfileDraftTimerRef.current) {
        clearTimeout(addProfileDraftTimerRef.current)
        addProfileDraftTimerRef.current = null
      }
      return
    }
    if (addProfileDraftTimerRef.current) clearTimeout(addProfileDraftTimerRef.current)
    addProfileDraftTimerRef.current = setTimeout(() => {
      addProfileDraftTimerRef.current = null
      const { form: f, step: st, backendProfileId: bid } =
        latestAddProfileDraftRef.current
      const payload = {
        form: profileWizardStateForPersist(f, st),
        step: st,
        ...(bid ? { backendProfileId: bid } : {}),
      }
      if (
        skipOverwriteEmptySessionDraftRef.current &&
        !addProfileDraftHasContent(payload)
      ) {
        return
      }
      skipOverwriteEmptySessionDraftRef.current = false
      saveAddProfileDraft(payload)
    }, 500)
    return () => {
      if (addProfileDraftTimerRef.current) {
        clearTimeout(addProfileDraftTimerRef.current)
        addProfileDraftTimerRef.current = null
      }
      const { form: f, step: st, backendProfileId: bid } =
        latestAddProfileDraftRef.current
      const payload = {
        form: profileWizardStateForPersist(f, st),
        step: st,
        ...(bid ? { backendProfileId: bid } : {}),
      }
      if (
        skipOverwriteEmptySessionDraftRef.current &&
        !addProfileDraftHasContent(payload)
      ) {
        return
      }
      skipOverwriteEmptySessionDraftRef.current = false
      saveAddProfileDraft(payload)
    }
  }, [open, enableAddDraftAutosave, form, step, backendProfileId])

  /** Debounced POST (first save) or PUT — persists wizard progress for the profiles table. */
  useEffect(() => {
    if (!getApiV1Base() || !open || !enableAddDraftAutosave) {
      if (backendAutosaveTimerRef.current) {
        clearTimeout(backendAutosaveTimerRef.current)
        backendAutosaveTimerRef.current = null
      }
      return
    }
    if (backendAutosaveTimerRef.current) clearTimeout(backendAutosaveTimerRef.current)
    backendAutosaveTimerRef.current = setTimeout(() => {
      backendAutosaveTimerRef.current = null
      void (async () => {
        const { form: f, step: st } = latestAddProfileDraftRef.current
        const draftCheck = {
          form: profileWizardStateForPersist(f, st),
          step: st,
        }
        if (!addProfileDraftHasContent(draftCheck)) return

        const profileName = buildProfileNameForPersist(f)
        const profileType = f.profileType.trim() || "—"
        const profileWizardState = profileWizardStateForPersist(f, st)
        const persistedId = backendProfileIdRef.current

        if (persistedId) {
          if (backendAutosaveInFlightRef.current) return
          backendAutosaveInFlightRef.current = true
          try {
            await putInvestorProfile(persistedId, {
              profileName,
              profileType,
              profileWizardState,
              autosave: true,
            })
          } catch (e) {
            if (import.meta.env.DEV) {
              console.warn(
                "[Add profile] Autosave failed:",
                e instanceof Error ? e.message : e,
              )
            }
          } finally {
            backendAutosaveInFlightRef.current = false
          }
          return
        }

        if (createPostInFlightRef.current) return
        createPostInFlightRef.current = true
        backendAutosaveInFlightRef.current = true
        try {
          const row = await postInvestorProfile({
            profileName,
            profileType,
            profileWizardState,
            autosave: true,
          })
          backendProfileIdRef.current = row.id
          setBackendProfileId(row.id)
          saveAddProfileDraft({
            form: profileWizardState,
            step: st,
            backendProfileId: row.id,
          })
          notifyProfileBookRefetch()
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn(
              "[Add profile] Autosave failed:",
              e instanceof Error ? e.message : e,
            )
          }
        } finally {
          createPostInFlightRef.current = false
          backendAutosaveInFlightRef.current = false
        }
      })()
    }, 1200)
    return () => {
      if (backendAutosaveTimerRef.current) {
        clearTimeout(backendAutosaveTimerRef.current)
        backendAutosaveTimerRef.current = null
      }
    }
  }, [open, enableAddDraftAutosave, form, step, backendProfileId])

  useEffect(() => {
    if (!isIndividual && !isJointTenancy && !isEntity && step > 1) setStep(1)
  }, [isIndividual, isJointTenancy, isEntity, step])

  useEffect(() => {
    if (stepScrollBootRef.current) {
      stepScrollBootRef.current = false
      return
    }
    scrollMultiStepFormToTopAfterUpdate({ container: profileFormRef.current })
  }, [step])

  /** Keep mailing id aligned when “same as tax” (incl. profiles saved before id was mirrored). */
  useEffect(() => {
    if (
      form.mailingAddressMode !== "same_as_tax" ||
      !form.taxAddressId.trim() ||
      form.mailingAddressId === form.taxAddressId
    ) {
      return
    }
    setForm((prev) => ({ ...prev, mailingAddressId: prev.taxAddressId }))
  }, [form.mailingAddressMode, form.taxAddressId, form.mailingAddressId])

  useEffect(() => {
    setStep((s) => (s > totalSteps ? totalSteps : s))
  }, [totalSteps])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleClose])

  useEffect(() => {
    if (!open || isNonModalLayout) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, isNonModalLayout])

  const patch = useCallback(
    (
      partial: Partial<FormState>,
      clearFieldErrors?: AddProfileFieldErrorKey | AddProfileFieldErrorKey[],
    ) => {
      setForm((prev) => ({ ...prev, ...partial }))
      if (clearFieldErrors) {
        const keys = (Array.isArray(clearFieldErrors) ? clearFieldErrors : [clearFieldErrors]) as AddProfileFieldErrorKey[]
        setFieldError((f) => {
          let next = f
          for (const k of keys) {
            if (f[k]) {
              if (next === f) next = { ...f }
              next[k] = undefined
            }
          }
          return next
        })
      }
    },
    [],
  )

  const handleProfileBookAddressSave = useCallback(
    (draft: AddressFormDraft) => {
      const field = addressPickField
      void (async () => {
        try {
          const row = await postSavedAddress(draft)
          onAddressAdded?.(row)
          if (field) {
            patch({ [field]: row.id }, field)
          }
          toast.success("Address added", "Your address was saved.")
          closeAddAddressModal()
        } catch (e) {
          toast.error(
            "Could not save address",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    },
    [addressPickField, closeAddAddressModal, onAddressAdded, patch],
  )

  const handleProfileBookBeneficiarySave = useCallback(
    (draft: BeneficiaryDraft) => {
      void (async () => {
        try {
          const row = await postBeneficiary(draft)
          onBeneficiaryAdded?.(row)
          patch({
            beneficiary: beneficiaryToDraft(row),
            beneficiaryPickId: row.id,
          })
          toast.success("Beneficiary added", "Your beneficiary was saved.")
          closeAddBeneficiaryModal()
        } catch (e) {
          toast.error(
            "Could not save beneficiary",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    },
    [closeAddBeneficiaryModal, onBeneficiaryAdded, patch],
  )

  const profileBookModals = (
    <>
      <AddAddressModal
        open={addAddressOpen}
        onClose={closeAddAddressModal}
        onSave={handleProfileBookAddressSave}
        existingAddresses={activeSavedAddresses}
      />
      <AddBeneficiaryModal
        open={addBeneficiaryOpen}
        onClose={closeAddBeneficiaryModal}
        onSave={handleProfileBookBeneficiarySave}
        savedAddresses={activeSavedAddresses}
        existingBeneficiaries={savedBeneficiaries}
        onAddressAdded={onAddressAdded}
      />
    </>
  )

  const validateStepFor = useCallback((stepNum: number): boolean => {
    const noErr: AddProfileFieldErrors = {}
    if (stepNum === 1) {
      const err: AddProfileFieldErrors = {}
      if (!form.profileType.trim()) {
        err.profileType = REQUIRED_MSG
      } else if (!isIndividual && !isJointTenancy && !isEntity) {
        err.profileType =
          "Choose Individual, Joint tenancy, or an entity or plan type."
      }
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (stepNum === 2 && isEntity) {
      const err: AddProfileFieldErrors = {}
      if (!form.custodianIra) {
        err.custodianIra = REQUIRED_MSG
      } else if (form.custodianIra === "yes") {
        if (!form.legalIraName.trim()) err.legalIraName = REQUIRED_MSG
        if (!form.iraCompany.trim()) err.iraCompany = REQUIRED_MSG
        if (!form.iraCustodianEin.trim()) {
          err.iraCustodianEin = REQUIRED_MSG
        }
      } else {
        if (!form.entityLegalName.trim()) {
          err.entityLegalName = "Enter the legal name of the entity."
        }
        if (!form.entityJurisdictionOfRegistration.trim()) {
          err.entityJurisdictionOfRegistration = REQUIRED_MSG
        }
        if (!form.entitySubType.trim()) err.entitySubType = REQUIRED_MSG
        if (!form.federalTaxClassification.trim()) {
          err.federalTaxClassification = REQUIRED_MSG
        }
        if (!form.entityDisregarded) {
          err.entityDisregarded = REQUIRED_MSG
        }
        if (!form.entityEin.trim()) err.entityEin = REQUIRED_MSG
      }
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (stepNum === 2 && isJointTenancy) {
      const err: AddProfileFieldErrors = {}
      if (!form.firstName.trim()) err.firstName = REQUIRED_MSG
      if (!form.lastName.trim()) err.lastName = REQUIRED_MSG
      applyRequiredEmailFieldError(form.email1, err, "email1")
      if (!form.firstName2.trim()) err.firstName2 = REQUIRED_MSG
      if (!form.lastName2.trim()) err.lastName2 = REQUIRED_MSG
      applyRequiredEmailFieldError(form.email2, err, "email2")
      applyOptionalUsPhoneFieldError(form.phone2, err, "phone2")
      applyRequiredSsnItinFieldError(form.ssn, err)
      applyOptionalSsnItinFieldError(form.spouseSsn, err, "spouseSsn")
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (stepNum === 2 && isIndividual) {
      const err: AddProfileFieldErrors = {}
      if (!form.firstName.trim()) err.firstName = REQUIRED_MSG
      if (!form.lastName.trim()) err.lastName = REQUIRED_MSG
      applyRequiredSsnItinFieldError(form.ssn, err)
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (
      stepNum === 3 &&
      (isIndividual || isJointTenancy || isEntity)
    ) {
      const err: AddProfileFieldErrors = {}
      addDistributionValidationErrors(form, err)
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (stepNum === 4 && (isIndividual || isEntity)) {
      const err: AddProfileFieldErrors = {}
      if (!form.taxAddressId.trim()) {
        err.taxAddressId = "Select a tax address, or add one in the Address tab first."
      }
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (stepNum === 4 && isJointTenancy) {
      const err: AddProfileFieldErrors = {}
      if (!form.taxAddressId.trim()) {
        err.taxAddressId = "Select a tax address, or add one in the Address tab first."
      }
      if (form.mailingAddressMode === "add_new" && !form.mailingAddressId.trim()) {
        err.mailingAddressId =
          "Select a saved mailing address, or check Same as tax address."
      }
      setFieldError(err)
      return Object.keys(err).length === 0
    }
    if (stepNum === 5 && hasBeneficiaryStep) {
      setFieldError(noErr)
      return true
    }
    if (isEdit && stepNum === totalSteps) {
      setFieldError(noErr)
      return true
    }
    setFieldError(noErr)
    return true
  }, [
    form,
    isIndividual,
    isJointTenancy,
    isEntity,
    hasBeneficiaryStep,
    isEdit,
    totalSteps,
  ])

  const validateStep = useCallback(
    () => validateStepFor(step),
    [validateStepFor, step],
  )

  const goToStep = useCallback(
    (target: number) => {
      if (target < 1 || target > totalSteps || target === step) return

      if (target < step) {
        setFieldError({})
        setStep(target)
        return
      }

      let current = step
      while (current < target) {
        if (!validateStepFor(current)) {
          setStep(current)
          return
        }
        current += 1
      }
      setStep(target)
    },
    [step, totalSteps, validateStepFor],
  )

  const goNext = useCallback(() => {
    if (!validateStep()) return
    const nextStep = Math.min(effectiveMaxStep, step + 1)
    latestAddProfileDraftRef.current = {
      ...latestAddProfileDraftRef.current,
      form,
      step: nextStep,
    }
    setStep(nextStep)
    if (enableAddDraftAutosave) {
      persistAddProfileDraftNow()
    }
  }, [
    validateStep,
    effectiveMaxStep,
    step,
    form,
    enableAddDraftAutosave,
    persistAddProfileDraftNow,
  ])

  const goBack = useCallback(() => {
    setFieldError({})
    setStep((s) => Math.max(1, s - 1))
  }, [])

  function handleProfileTypeChange(value: string) {
    const isCustodianEntity = value === PROFILE_TYPE_ENTITY_CUSTODIAN
    const isLlcCorpTrustEntity = value === PROFILE_TYPE_ENTITY_LLC_CORP_TRUST
    const nextProfileType =
      isCustodianEntity || isLlcCorpTrustEntity ? PROFILE_TYPE_ENTITY : value
    const nextCustodianIra = isCustodianEntity
      ? ("yes" as const)
      : isLlcCorpTrustEntity
        ? ("no" as const)
        : ("" as const)

    setForm((prev) => ({
      ...prev,
      profileType: nextProfileType,
      ...(nextProfileType === PROFILE_TYPE_JOINT_TENANCY ||
      nextProfileType === PROFILE_TYPE_ENTITY
        ? { beneficiary: null, beneficiaryPickId: "" as const }
        : {}),
      ...(nextProfileType !== PROFILE_TYPE_ENTITY
        ? {
            entitySubType: "",
            entityLegalName: "",
            entityJurisdictionOfRegistration: "",
            entityDateFormed: "",
            entityOwnedByIra401k: "" as const,
            entityMemberCount: "",
            entityDisregarded: "" as const,
            entityEin: "",
            entityEinVisible: false,
            custodianIra: "" as const,
            legalIraName: "",
            iraCompany: "",
            federalTaxClassification: "",
            iraPartnerEin: "",
            iraCustodianEin: "",
            iraPartnerEinVisible: false,
            iraCustodianEinVisible: false,
          }
        : { custodianIra: nextCustodianIra }),
    }))
    setFieldError((f) => (f.profileType ? { ...f, profileType: undefined } : f))
    if (
      nextProfileType !== PROFILE_TYPE_INDIVIDUAL &&
      nextProfileType !== PROFILE_TYPE_JOINT_TENANCY &&
      nextProfileType !== PROFILE_TYPE_ENTITY
    ) {
      setStep(1)
    }
  }

  function runFullFormValidationForSave(): boolean {
    if (isJointTenancy) {
      const err: AddProfileFieldErrors = {}
      if (!form.firstName.trim()) err.firstName = REQUIRED_MSG
      if (!form.lastName.trim()) err.lastName = REQUIRED_MSG
      applyRequiredEmailFieldError(form.email1, err, "email1")
      if (!form.firstName2.trim()) err.firstName2 = REQUIRED_MSG
      if (!form.lastName2.trim()) err.lastName2 = REQUIRED_MSG
      applyRequiredEmailFieldError(form.email2, err, "email2")
      applyOptionalUsPhoneFieldError(form.phone2, err, "phone2")
      applyRequiredSsnItinFieldError(form.ssn, err)
      applyOptionalSsnItinFieldError(form.spouseSsn, err, "spouseSsn")
      addDistributionValidationErrors(form, err)
      if (!form.taxAddressId.trim()) {
        err.taxAddressId = "Select a tax address, or add one in the Address tab first."
      }
      if (form.mailingAddressMode === "add_new" && !form.mailingAddressId.trim()) {
        err.mailingAddressId =
          "Select a saved mailing address, or check Same as tax address."
      }
      setFieldError(err)
      if (Object.keys(err).length > 0) {
        if (
          err.firstName ||
          err.lastName ||
          err.email1 ||
          err.firstName2 ||
          err.lastName2 ||
          err.email2 ||
          err.phone2 ||
          err.ssn ||
          err.spouseSsn
        ) {
          setStep(2)
        } else if (hasDistributionFieldErrors(err)) {
          setStep(3)
        } else if (err.taxAddressId || err.mailingAddressId) {
          setStep(4)
        }
        return false
      }
      return true
    }
    if (isIndividual) {
      const err: AddProfileFieldErrors = {}
      if (!form.firstName.trim()) err.firstName = REQUIRED_MSG
      if (!form.lastName.trim()) err.lastName = REQUIRED_MSG
      applyRequiredSsnItinFieldError(form.ssn, err)
      addDistributionValidationErrors(form, err)
      if (!form.taxAddressId.trim()) {
        err.taxAddressId = "Select a tax address, or add one in the Address tab first."
      }
      setFieldError(err)
      if (Object.keys(err).length > 0) {
        if (err.firstName || err.lastName || err.ssn) setStep(2)
        else if (hasDistributionFieldErrors(err)) setStep(3)
        else if (err.taxAddressId) setStep(4)
        return false
      }
      return true
    }
    if (isEntity) {
      const err: AddProfileFieldErrors = {}
      if (!form.custodianIra) {
        err.custodianIra = REQUIRED_MSG
      } else if (form.custodianIra === "yes") {
        if (!form.legalIraName.trim()) err.legalIraName = REQUIRED_MSG
        if (!form.iraCompany.trim()) err.iraCompany = REQUIRED_MSG
        if (!form.iraCustodianEin.trim()) {
          err.iraCustodianEin = REQUIRED_MSG
        }
      } else {
        if (!form.entityLegalName.trim()) {
          err.entityLegalName = "Enter the legal name of the entity."
        }
        if (!form.entityJurisdictionOfRegistration.trim()) {
          err.entityJurisdictionOfRegistration = REQUIRED_MSG
        }
        if (!form.entitySubType.trim()) err.entitySubType = REQUIRED_MSG
        if (!form.federalTaxClassification.trim()) {
          err.federalTaxClassification = REQUIRED_MSG
        }
        if (!form.entityDisregarded) {
          err.entityDisregarded = REQUIRED_MSG
        }
        if (!form.entityEin.trim()) err.entityEin = REQUIRED_MSG
      }
      addDistributionValidationErrors(form, err)
      if (!form.taxAddressId.trim()) {
        err.taxAddressId = "Select a tax address, or add one in the Address tab first."
      }
      setFieldError(err)
      if (Object.keys(err).length > 0) {
        if (
          err.custodianIra ||
          err.legalIraName ||
          err.iraCompany ||
          err.iraCustodianEin ||
          err.entitySubType ||
          err.entityLegalName ||
          err.entityJurisdictionOfRegistration ||
          err.federalTaxClassification ||
          err.entityDisregarded ||
          err.entityEin
        ) {
          setStep(2)
        } else if (hasDistributionFieldErrors(err)) {
          setStep(3)
        } else if (err.taxAddressId) {
          setStep(4)
        }
        return false
      }
      return true
    }
    setFieldError({
      profileType: "Choose a profile type to continue.",
    })
    return false
  }

  function rejectDuplicateProfile(profileName: string, profileType: string): boolean {
    const excludeId =
      isEdit && editTarget
        ? editTarget.id
        : backendProfileIdRef.current?.trim() || undefined
    if (
      hasActiveProfileDuplicate(
        existingProfiles,
        profileName,
        profileType,
        excludeId,
      )
    ) {
      toast.error("Duplicate profile", PROFILE_DUPLICATE_MESSAGE)
      setStep(1)
      return true
    }
    return false
  }

  function handleSubmit() {
    if (isEdit) return
    if (step !== addFlowLastContentStep) return
    if (!runFullFormValidationForSave()) return
    const profileName = buildDisplayProfileName(form)
    const profileType = form.profileType
    if (rejectDuplicateProfile(profileName, profileType)) return
    const payload: NewInvestorProfilePayload = {
      profileName,
      profileType,
      profileWizardState: profileWizardStateForPersist(form, step),
    }
    const existingId = backendProfileIdRef.current?.trim() || undefined
    if (onProfileCreated) {
      void (async () => {
        try {
          await onProfileCreated(payload, existingId ? { existingId } : undefined)
          if (enableAddDraftAutosave) clearAddProfileDraft()
          onClose()
        } catch (e) {
          toast.error(
            "Could not save profile",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    } else {
      toast.success(
        "Profile added",
        "Your new profile was saved. (No handler — data not persisted.)",
      )
      if (enableAddDraftAutosave) clearAddProfileDraft()
      onClose()
    }
  }

  function handleEditSave() {
    if (!isEdit || !editTarget) return
    if (step !== totalSteps) return
    if (!lastEditReason.trim()) {
      setLastEditReasonError("This field is required for the audit log.")
      toast.error("Reason required", "Describe why you are making this change.")
      return
    }
    setLastEditReasonError(null)
    if (!runFullFormValidationForSave()) {
      return
    }
    const profileName = buildDisplayProfileName(form)
    const profileType = form.profileType
    if (rejectDuplicateProfile(profileName, profileType)) return
    const payload: UpdateInvestorProfilePayload = {
      profileName,
      profileType,
      lastEditReason: lastEditReason.trim(),
      profileWizardState: profileWizardStateForPersist(form, step),
    }
    if (onProfileUpdated) {
      void (async () => {
        try {
          await onProfileUpdated(editTarget.id, payload)
          onClose()
        } catch (e) {
          toast.error(
            "Could not save profile",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    } else {
      onClose()
    }
  }

  if (!open) return null

  function stepperGroup() {
    return (
      <>
        <p id="add-profile-step-label" className="add_profile_sronly">
          Step {step} of {totalSteps}: {stepHeading}
        </p>
        {stepperLabels.map((label, i) => {
          const n = i + 1
          const isActive = step === n
          const isDone = step > n
          const nodeClass = [
            "add_contact_step_node",
            isActive ? "add_contact_step_node_active" : "",
            isDone ? "add_contact_step_node_done" : "",
            !isActive ? "add_contact_step_node_clickable" : "",
          ]
            .filter(Boolean)
            .join(" ")
          const nodeContent = (
            <>
              <span className="add_contact_step_dot">{n}</span>
              <span className="add_contact_step_label">{label}</span>
            </>
          )
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
              {isActive ? (
                <div className={nodeClass} aria-current="step">
                  {nodeContent}
                </div>
              ) : (
                <button
                  type="button"
                  className={`${nodeClass} add_contact_step_node_btn`}
                  onClick={() => goToStep(n)}
                  aria-label={`Go to step ${n}: ${label}`}
                >
                  {nodeContent}
                </button>
              )}
            </Fragment>
          )
        })}
      </>
    )
  }

  function renderFormPanel() {
    const formNode = (
        <form
          ref={profileFormRef}
          className={
            isPage ? "deals_add_deal_asset_form" : "deals_add_inv_modal_form"
          }
          onSubmit={(e) => e.preventDefault()}
          noValidate
          aria-labelledby={
            isPage ? addProfilePageTitleId : "add-profile-modal-title"
          }
          aria-describedby="add-profile-step-label"
        >
          <div
            className={
              isPage
                ? "deals_add_deal_asset_form_scroll deals_add_profile_wizard_scroll"
                : "deals_add_inv_modal_scroll"
            }
          >
            {step === 1 && (
            <div className="add_contact_section" aria-labelledby="ap-s1">
              <p id="ap-s1" className="add_contact_section_eyebrow">
                Profile type
              </p>
              <InvestingFormField
                id="ap-profile-type"
                label={<>Profile type <span className="contacts_required" aria-hidden>*</span></>}
                Icon={IdCard}
                labelSuffix={
                  <FieldHelp label="Profile type" tooltip="Type of profile" />
                }
                error={fieldError.profileType}
              >
                <DealsCreateDropdownSelect
                  id="ap-profile-type"
                  options={[
                    { value: PROFILE_TYPE_INDIVIDUAL, label: "Individual" },
                    {
                      value: PROFILE_TYPE_ENTITY_CUSTODIAN,
                      label: "Custodian IRA or custodian based 401(k)",
                    },
                    {
                      value: PROFILE_TYPE_JOINT_TENANCY,
                      label: "Joint tenancy",
                    },
                    {
                      value: PROFILE_TYPE_ENTITY_LLC_CORP_TRUST,
                      label:
                        "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
                    },
                  ]}
                  value={profileTypeSelectValue(form)}
                  onChange={handleProfileTypeChange}
                  placeholder="Select profile type"
                  invalid={Boolean(fieldError.profileType)}
                  ariaLabel="Profile type"
                  ariaDescribedBy={
                    fieldError.profileType ? "ap-profile-type-err" : undefined
                  }
                  triggerClassName="deals_add_inv_field_control"
                />
              </InvestingFormField>
            </div>
          )}

          {step === 2 && isEntity && (
            <div className="add_contact_section" aria-labelledby="ap-entity-s2">
              <p id="ap-entity-s2" className="add_contact_section_eyebrow">
                Profile details
              </p>
              <InvestingFormField
                id="ap-entity-custodian"
                label={
                  <>
                    Is this a custodian based IRA or 401(k)?{" "}
                    <span className="contacts_required" aria-hidden>*</span>
                  </>
                }
                Icon={HelpCircle}
                labelSuffix={
                  <FieldHelp
                    label="Is this a custodian based IRA or 401(k)?"
                    tooltip='Choose "yes" if a custodian needs to sign, and "no" if only the investor needs to sign. Choose "no" if this is not an IRA or 401(k).'
                  />
                }
                error={fieldError.custodianIra}
              >
                <YesNoCardRadioGroup
                  name="ap-entity-custodian"
                  value={form.custodianIra}
                  onChange={(v) => {
                    if (v === "yes") {
                      patch(
                        {
                          custodianIra: v,
                          entitySubType: "",
                          entityLegalName: "",
                          entityJurisdictionOfRegistration: "",
                          entityDateFormed: "",
                          entityOwnedByIra401k: "" as const,
                          entityMemberCount: "",
                          entityDisregarded: "" as const,
                          entityEin: "",
                          entityEinVisible: false,
                        },
                        "custodianIra",
                      )
                    } else {
                      patch(
                        {
                          custodianIra: v,
                          legalIraName: "",
                          iraCompany: "",
                          federalTaxClassification: "",
                          iraPartnerEin: "",
                          iraCustodianEin: "",
                          iraPartnerEinVisible: false,
                          iraCustodianEinVisible: false,
                        },
                        [
                          "custodianIra",
                          "legalIraName",
                          "iraCompany",
                          "iraPartnerEin",
                          "iraCustodianEin",
                        ],
                      )
                    }
                  }}
                  disabled={false}
                  ariaLabel="Is this a custodian based IRA or 401(k)"
                />
              </InvestingFormField>

              {form.custodianIra === "yes" ? (
                <>
                  <InvestingFormField
                    id="ap-ent-legal-ira"
                    label={
                      <>
                        Legal IRA name <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={Building2}
                    error={fieldError.legalIraName}
                  >
                    <input
                      id="ap-ent-legal-ira"
                      className={invClass(
                        "deals_add_inv_input deals_add_inv_field_control",
                        Boolean(fieldError.legalIraName),
                      )}
                      value={form.legalIraName}
                      onChange={(e) =>
                        patch({ legalIraName: e.target.value }, "legalIraName")
                      }
                      placeholder="Quest Trust Company FBO John Smith IRA # 1234567"
                      autoComplete="organization"
                      aria-invalid={Boolean(fieldError.legalIraName)}
                      aria-describedby={
                        fieldError.legalIraName ? "ap-ent-legal-ira-err" : undefined
                      }
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-ent-ira-co"
                    label={
                      <>
                        IRA company <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={Building2}
                    error={fieldError.iraCompany}
                  >
                    <input
                      id="ap-ent-ira-co"
                      className={invClass(
                        "deals_add_inv_input deals_add_inv_field_control",
                        Boolean(fieldError.iraCompany),
                      )}
                      value={form.iraCompany}
                      onChange={(e) => patch({ iraCompany: e.target.value }, "iraCompany")}
                      placeholder="IRA company name"
                      autoComplete="organization"
                      aria-invalid={Boolean(fieldError.iraCompany)}
                      aria-describedby={
                        fieldError.iraCompany ? "ap-ent-ira-co-err" : undefined
                      }
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-ent-federal-tax"
                    label="Federal tax classification"
                    Icon={FileText}
                  >
                    <DealsCreateDropdownSelect
                      id="ap-ent-federal-tax"
                      options={FEDERAL_TAX_CLASSIFICATION_OPTIONS}
                      value={form.federalTaxClassification}
                      onChange={(v) => patch({ federalTaxClassification: v })}
                      placeholder="Select"
                      ariaLabel="Federal tax classification"
                      triggerClassName="deals_add_inv_field_control"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-ent-ira-partner-ein"
                    label="IRA partner EIN"
                    Icon={Fingerprint}
                    labelSuffix={
                      <FieldHelp
                        label="IRA partner EIN"
                        tooltip="Unique EIN of your IRA account. Needed to issue your Schedule K-1."
                      />
                    }
                  >
                    <div className="add_profile_input_wrap">
                      <input
                        id="ap-ent-ira-partner-ein"
                        className="deals_add_inv_input deals_add_inv_field_control"
                        type={form.iraPartnerEinVisible ? "text" : "password"}
                        value={form.iraPartnerEin}
                        onChange={(e) => patch({ iraPartnerEin: e.target.value })}
                        autoComplete="off"
                        placeholder="EIN"
                        aria-label="IRA partner EIN"
                      />
                      <button
                        type="button"
                        className="add_profile_ssn_toggle"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            iraPartnerEinVisible: !prev.iraPartnerEinVisible,
                          }))
                        }
                        aria-label={
                          form.iraPartnerEinVisible
                            ? "Hide IRA partner EIN"
                            : "Show IRA partner EIN"
                        }
                      >
                        {form.iraPartnerEinVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </div>
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-ent-ira-cust-ein"
                    label={
                      <>
                        IRA custodian EIN <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={Fingerprint}
                    labelSuffix={
                      <FieldHelp
                        label="IRA custodian EIN"
                        tooltip="Usually this is the custodian or plan entity EIN for your IRA, not your personal SSN. Enter the EIN of the financial institution that holds the account, when required for your tax forms."
                      />
                    }
                    error={fieldError.iraCustodianEin}
                  >
                    <div className="add_profile_input_wrap">
                      <input
                        id="ap-ent-ira-cust-ein"
                        className={invClass(
                          "deals_add_inv_input deals_add_inv_field_control",
                          Boolean(fieldError.iraCustodianEin),
                        )}
                        type={form.iraCustodianEinVisible ? "text" : "password"}
                        value={form.iraCustodianEin}
                        onChange={(e) =>
                          patch({ iraCustodianEin: e.target.value }, "iraCustodianEin")
                        }
                        autoComplete="off"
                        placeholder="EIN"
                        aria-invalid={Boolean(fieldError.iraCustodianEin)}
                        aria-describedby={
                          fieldError.iraCustodianEin ? "ap-ent-ira-cust-ein-err" : undefined
                        }
                        aria-label="IRA custodian EIN"
                      />
                      <button
                        type="button"
                        className="add_profile_ssn_toggle"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            iraCustodianEinVisible: !prev.iraCustodianEinVisible,
                          }))
                        }
                        aria-label={
                          form.iraCustodianEinVisible
                            ? "Hide IRA custodian EIN"
                            : "Show IRA custodian EIN"
                        }
                      >
                        {form.iraCustodianEinVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </div>
                  </InvestingFormField>
                </>
              ) : null}

              {form.custodianIra === "no" ? (
                <>
                  <InvestingFormField
                    id="ap-entity-legal"
                    label={
                      <>
                        Entity name <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={Building2}
                    error={fieldError.entityLegalName}
                  >
                    <input
                      id="ap-entity-legal"
                      className={invClass(
                        "deals_add_inv_input deals_add_inv_field_control",
                        Boolean(fieldError.entityLegalName),
                      )}
                      value={form.entityLegalName}
                      onChange={(e) =>
                        patch({ entityLegalName: e.target.value }, "entityLegalName")
                      }
                      placeholder="Registered legal name of the entity or plan"
                      autoComplete="organization"
                      aria-invalid={Boolean(fieldError.entityLegalName)}
                      aria-describedby={
                        fieldError.entityLegalName ? "ap-entity-legal-err" : undefined
                      }
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-jurisdiction"
                    label={
                      <>
                        Jurisdiction of registration <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={LandPlot}
                    error={fieldError.entityJurisdictionOfRegistration}
                  >
                    <input
                      id="ap-entity-jurisdiction"
                      className={invClass(
                        "deals_add_inv_input deals_add_inv_field_control",
                        Boolean(fieldError.entityJurisdictionOfRegistration),
                      )}
                      value={form.entityJurisdictionOfRegistration}
                      onChange={(e) =>
                        patch(
                          { entityJurisdictionOfRegistration: e.target.value },
                          "entityJurisdictionOfRegistration",
                        )
                      }
                      placeholder="State is sufficient, e.g. 'WA'"
                      autoComplete="off"
                      aria-invalid={Boolean(fieldError.entityJurisdictionOfRegistration)}
                      aria-describedby={
                        fieldError.entityJurisdictionOfRegistration
                          ? "ap-entity-jurisdiction-err"
                          : undefined
                      }
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-date-formed"
                    label="Date formed"
                    Icon={Calendar}
                  >
                    <input
                      id="ap-entity-date-formed"
                      type="date"
                      className="deals_add_inv_input deals_add_inv_field_control"
                      value={form.entityDateFormed}
                      onChange={(e) =>
                        patch({ entityDateFormed: e.target.value })
                      }
                      aria-label="Date formed"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-owned-ira"
                    label="Is this entity owned by an IRA or 401(k)?"
                    Icon={HelpCircle}
                    labelSuffix={
                      <FieldHelp
                        label="Is this entity owned by an IRA or 401(k)?"
                        tooltip="Indicate if an IRA, solo 401(k), or other retirement account owns this entity (separate from custodian signing for investments)."
                      />
                    }
                  >
                    <YesNoCardRadioGroup
                      name="ap-entity-owned-ira"
                      value={form.entityOwnedByIra401k}
                      onChange={(v) =>
                        patch({ entityOwnedByIra401k: v })
                      }
                      ariaLabel="Is this entity owned by an IRA or 401(k)?"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-member-count"
                    label="Number of members"
                    Icon={UserPlus}
                  >
                    <input
                      id="ap-entity-member-count"
                      className="deals_add_inv_input deals_add_inv_field_control"
                      inputMode="numeric"
                      value={form.entityMemberCount}
                      onChange={(e) => patch({ entityMemberCount: e.target.value })}
                      placeholder="Enter number of members in the entity"
                      autoComplete="off"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-type"
                    label={
                      <>
                        Type <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={IdCard}
                    labelSuffix={
                      <FieldHelp
                        label="Type"
                        tooltip="LLC, corporation, partnership, trust, IRA, or 401(k) plan"
                      />
                    }
                    error={fieldError.entitySubType}
                  >
                    <DealsCreateDropdownSelect
                      id="ap-entity-type"
                      options={ENTITY_SUBTYPE_OPTIONS}
                      value={form.entitySubType}
                      onChange={(v) => patch({ entitySubType: v }, "entitySubType")}
                      placeholder="Select"
                      invalid={Boolean(fieldError.entitySubType)}
                      ariaLabel="Entity, trust, or plan type"
                      ariaDescribedBy={
                        fieldError.entitySubType ? "ap-entity-type-err" : undefined
                      }
                      triggerClassName="deals_add_inv_field_control"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-ent-federal-no"
                    label={
                      <>
                        Federal tax classification <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={FileText}
                    error={fieldError.federalTaxClassification}
                  >
                    <DealsCreateDropdownSelect
                      id="ap-ent-federal-no"
                      options={FEDERAL_TAX_CLASSIFICATION_OPTIONS}
                      value={form.federalTaxClassification}
                      onChange={(v) =>
                        patch(
                          { federalTaxClassification: v },
                          "federalTaxClassification",
                        )
                      }
                      placeholder="Select"
                      invalid={Boolean(fieldError.federalTaxClassification)}
                      ariaLabel="Federal tax classification"
                      triggerClassName="deals_add_inv_field_control"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-disregarded"
                    label={
                      <>
                        Is this a disregarded entity? <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={HelpCircle}
                    labelSuffix={
                      <FieldHelp
                        label="Is this a disregarded entity?"
                        tooltip="For example, a single-member LLC default classification for federal tax. Choose “Yes” or “No” to match your entity’s federal filing status."
                      />
                    }
                    error={fieldError.entityDisregarded}
                  >
                    <YesNoCardRadioGroup
                      name="ap-entity-disregarded"
                      value={form.entityDisregarded}
                      onChange={(v) =>
                        patch({ entityDisregarded: v }, "entityDisregarded")
                      }
                      ariaLabel="Is this a disregarded entity"
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-entity-ein"
                    label={
                      <>
                        EIN/Tax ID of entity <span className="contacts_required" aria-hidden>*</span>
                      </>
                    }
                    Icon={Fingerprint}
                    labelSuffix={
                      <FieldHelp
                        label="EIN/Tax ID of entity"
                        tooltip="Employer Identification Number (EIN) of this entity, not a personal SSN, unless the entity is a single-member sole prop reported under your SSN and your team instructs you to use it here."
                      />
                    }
                    error={fieldError.entityEin}
                  >
                    <div className="add_profile_input_wrap">
                      <input
                        id="ap-entity-ein"
                        className={invClass(
                          "deals_add_inv_input deals_add_inv_field_control",
                          Boolean(fieldError.entityEin),
                        )}
                        type={form.entityEinVisible ? "text" : "password"}
                        value={form.entityEin}
                        onChange={(e) => patch({ entityEin: e.target.value }, "entityEin")}
                        autoComplete="off"
                        placeholder="EIN or tax ID"
                        aria-invalid={Boolean(fieldError.entityEin)}
                        aria-label="EIN or tax ID of entity"
                      />
                      <button
                        type="button"
                        className="add_profile_ssn_toggle"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            entityEinVisible: !prev.entityEinVisible,
                          }))
                        }
                        aria-label={
                          form.entityEinVisible ? "Hide EIN" : "Show EIN"
                        }
                      >
                        {form.entityEinVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </div>
                  </InvestingFormField>
                </>
              ) : null}

            </div>
          )}

          {step === 2 && isJointTenancy && (
            <div className="add_contact_section" aria-labelledby="ap-jt-heading">
              <p id="ap-jt-heading" className="add_contact_section_eyebrow">
                Profile details
              </p>
              <div className="um_field">
                <div className="um_field_label_row">
                  <IdCard
                    className="um_field_label_icon"
                    size={17}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="mail_text_label" id="ap-jt-type-lbl">
                    Profile type <span className="contacts_required" aria-hidden>*</span>
                  </span>
                  <FieldHelp label="Profile type" tooltip="Type of profile" />
                </div>
                <div
                  className="add_profile_readonly_type"
                  aria-labelledby="ap-jt-type-lbl"
                >
                  {PROFILE_TYPE_JOINT_TENANCY}
                </div>
              </div>

              <p className="add_contact_section_eyebrow add_contact_section_eyebrow_spaced">
                Investor 1
              </p>
              <div className="add_contact_name_grid">
                <InvestingFormField
                  id="ap-jt-1-first"
                  label={<>First name <span className="contacts_required" aria-hidden>*</span></>}
                  Icon={UserRound}
                  tight
                  error={fieldError.firstName}
                >
                  <input
                    id="ap-jt-1-first"
                    className={invClass(
                      "deals_add_inv_input deals_add_inv_field_control",
                      Boolean(fieldError.firstName),
                    )}
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => patch({ firstName: e.target.value }, "firstName")}
                    placeholder="e.g. Jordan"
                    aria-invalid={Boolean(fieldError.firstName)}
                    aria-describedby={
                      fieldError.firstName ? "ap-jt-1-first-err" : undefined
                    }
                  />
                </InvestingFormField>
                <InvestingFormField
                  id="ap-jt-1-last"
                  label={<>Last name <span className="contacts_required" aria-hidden>*</span></>}
                  Icon={UserRound}
                  tight
                  error={fieldError.lastName}
                >
                  <input
                    id="ap-jt-1-last"
                    className={invClass(
                      "deals_add_inv_input deals_add_inv_field_control",
                      Boolean(fieldError.lastName),
                    )}
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(e) => patch({ lastName: e.target.value }, "lastName")}
                    placeholder="e.g. Lee"
                    aria-invalid={Boolean(fieldError.lastName)}
                    aria-describedby={
                      fieldError.lastName ? "ap-jt-1-last-err" : undefined
                    }
                  />
                </InvestingFormField>
              </div>
              <InvestingFormField
                id="ap-jt-1-middle"
                label="Middle name"
                Icon={UserRound}
                tight
              >
                <input
                  id="ap-jt-1-middle"
                  className="deals_add_inv_input deals_add_inv_field_control"
                  value={form.middleName}
                  onChange={(e) => patch({ middleName: e.target.value })}
                  placeholder="Middle name"
                />
              </InvestingFormField>
              <InvestingFormField
                id="ap-jt-1-email"
                label={<>Email address 1 <span className="contacts_required" aria-hidden>*</span></>}
                Icon={Mail}
                tight
                error={fieldError.email1}
              >
                <input
                  id="ap-jt-1-email"
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(fieldError.email1),
                  )}
                  type="email"
                  autoComplete="email"
                  value={form.email1}
                  onChange={(e) => patch({ email1: e.target.value }, "email1")}
                  placeholder="Email"
                  aria-invalid={Boolean(fieldError.email1)}
                  aria-describedby={
                    fieldError.email1 ? "ap-jt-1-email-err" : undefined
                  }
                />
              </InvestingFormField>

              <p className="add_contact_section_eyebrow add_contact_section_eyebrow_spaced">
                Investor 2
              </p>
              <div className="add_contact_name_grid">
                <InvestingFormField
                  id="ap-jt-2-first"
                  label={<>First name 2 <span className="contacts_required" aria-hidden>*</span></>}
                  Icon={UserRound}
                  tight
                  error={fieldError.firstName2}
                >
                  <input
                    id="ap-jt-2-first"
                    className={invClass(
                      "deals_add_inv_input deals_add_inv_field_control",
                      Boolean(fieldError.firstName2),
                    )}
                    value={form.firstName2}
                    onChange={(e) => patch({ firstName2: e.target.value }, "firstName2")}
                    placeholder="e.g. Jordan"
                    aria-invalid={Boolean(fieldError.firstName2)}
                    aria-describedby={
                      fieldError.firstName2 ? "ap-jt-2-first-err" : undefined
                    }
                  />
                </InvestingFormField>
                <InvestingFormField
                  id="ap-jt-2-last"
                  label={<>Last name 2 <span className="contacts_required" aria-hidden>*</span></>}
                  Icon={UserRound}
                  tight
                  error={fieldError.lastName2}
                >
                  <input
                    id="ap-jt-2-last"
                    className={invClass(
                      "deals_add_inv_input deals_add_inv_field_control",
                      Boolean(fieldError.lastName2),
                    )}
                    value={form.lastName2}
                    onChange={(e) => patch({ lastName2: e.target.value }, "lastName2")}
                    placeholder="e.g. Lee"
                    aria-invalid={Boolean(fieldError.lastName2)}
                    aria-describedby={
                      fieldError.lastName2 ? "ap-jt-2-last-err" : undefined
                    }
                  />
                </InvestingFormField>
              </div>
              <InvestingFormField
                id="ap-jt-2-middle"
                label="Middle name 2"
                Icon={UserRound}
                tight
              >
                <input
                  id="ap-jt-2-middle"
                  className="deals_add_inv_input deals_add_inv_field_control"
                  value={form.middleName2}
                  onChange={(e) => patch({ middleName2: e.target.value })}
                  placeholder="Middle name"
                />
              </InvestingFormField>
              <InvestingFormField
                id="ap-jt-2-email"
                label={<>Email address 2 <span className="contacts_required" aria-hidden>*</span></>}
                Icon={Mail}
                tight
                error={fieldError.email2}
              >
                <input
                  id="ap-jt-2-email"
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(fieldError.email2),
                  )}
                  type="email"
                  value={form.email2}
                  onChange={(e) => patch({ email2: e.target.value }, "email2")}
                  placeholder="Email"
                  aria-invalid={Boolean(fieldError.email2)}
                  aria-describedby={
                    fieldError.email2 ? "ap-jt-2-email-err" : undefined
                  }
                />
              </InvestingFormField>
              <InvestingFormField
                id="ap-jt-2-phone"
                label="Phone number 2"
                Icon={Phone}
                tight
              >
                <UsPhoneInput
                  id="ap-jt-2-phone"
                  name="phone2"
                  nationalDigits={form.phone2}
                  onNationalDigitsChange={(next) =>
                    patch({ phone2: next }, "phone2")
                  }
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(fieldError.phone2),
                  )}
                  invalidClassName="um_field_input_invalid"
                  autoComplete="tel"
                  aria-invalid={Boolean(fieldError.phone2)}
                  error={fieldError.phone2 ?? null}
                />
              </InvestingFormField>

              <p className="add_contact_section_eyebrow add_contact_section_eyebrow_spaced">
                Additional details
              </p>
              <InvestingFormField
                id="ap-jt-ssn"
                label={<>SSN <span className="contacts_required" aria-hidden>*</span></>}
                Icon={Fingerprint}
                error={fieldError.ssn}
              >
                <SsnItinMaskedInput
                  id="ap-jt-ssn"
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(fieldError.ssn),
                  )}
                  value={form.ssn}
                  onValueChange={(ssn) => patch({ ssn }, "ssn")}
                  revealed={ssnVisible}
                  onRevealedChange={setSsnVisible}
                  showToggle
                  revealLabel="Show SSN"
                  hideLabel="Hide SSN"
                  placeholder="___-__-____"
                  aria-invalid={Boolean(fieldError.ssn)}
                  aria-describedby={
                    fieldError.ssn ? "ap-jt-ssn-err" : undefined
                  }
                />
              </InvestingFormField>
              <InvestingFormField
                id="ap-jt-spouse-ssn"
                label="Spouse SSN"
                Icon={Fingerprint}
                error={fieldError.spouseSsn}
              >
                <SsnItinMaskedInput
                  id="ap-jt-spouse-ssn"
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(fieldError.spouseSsn),
                  )}
                  value={form.spouseSsn}
                  onValueChange={(spouseSsn) =>
                    patch({ spouseSsn }, "spouseSsn")
                  }
                  revealed={spouseSsnVisible}
                  onRevealedChange={setSpouseSsnVisible}
                  showToggle
                  revealLabel="Show spouse SSN"
                  hideLabel="Hide spouse SSN"
                  placeholder="___-__-____"
                  aria-invalid={Boolean(fieldError.spouseSsn)}
                  aria-describedby={
                    fieldError.spouseSsn ? "ap-jt-spouse-ssn-err" : undefined
                  }
                />
              </InvestingFormField>
            </div>
          )}

          {step === 4 && isJointTenancy && (
            <div className="add_contact_section" aria-labelledby="ap-jt-s4">
              <p id="ap-jt-s4" className="add_contact_section_eyebrow">
                Address
              </p>
              <InvestingFormField
                id="ap-jt-tax"
                label={<>Tax address <span className="contacts_required" aria-hidden>*</span></>}
                Icon={MapPin}
                error={fieldError.taxAddressId}
              >
                <SavedAddressSelect
                  id="ap-jt-tax"
                  value={form.taxAddressId}
                  onChange={(v) => {
                    const partial: Partial<FormState> = { taxAddressId: v }
                    if (form.mailingAddressMode === "same_as_tax") {
                      partial.mailingAddressId = v
                    }
                    patch(partial, "taxAddressId")
                  }}
                  savedAddresses={activeSavedAddresses}
                  emptyLabel="Select a saved address"
                  ariaLabel="Tax address — select a saved address"
                  invalid={Boolean(fieldError.taxAddressId)}
                  onAddNew={() => openAddAddressModal("taxAddressId")}
                />
              </InvestingFormField>
              <MailingAddressFields
                idPrefix="ap-jt"
                label="Mailing address"
                taxAddressId={form.taxAddressId}
                mailingAddressId={form.mailingAddressId}
                mailingAddressMode={form.mailingAddressMode}
                mailingError={fieldError.mailingAddressId}
                savedAddresses={activeSavedAddresses}
                onPatch={patch}
                onOpenAddMailing={() => openAddAddressModal("mailingAddressId")}
                emptyLabel="Select a saved mailing address"
              />
            </div>
          )}

          {step === 2 && isIndividual && (
            <div className="add_contact_section" aria-labelledby="ap-s2">
              <p id="ap-s2" className="add_contact_section_eyebrow">
                Profile details
              </p>
              <div className="add_contact_name_grid">
                <InvestingFormField
                  id="ap-first"
                  label={<>First name <span className="contacts_required" aria-hidden>*</span></>}
                  Icon={UserRound}
                  tight
                  error={fieldError.firstName}
                >
                  <input
                    id="ap-first"
                    className={invClass(
                      "deals_add_inv_input deals_add_inv_field_control",
                      Boolean(fieldError.firstName),
                    )}
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => patch({ firstName: e.target.value }, "firstName")}
                    placeholder="e.g. Jordan"
                    aria-invalid={Boolean(fieldError.firstName)}
                    aria-describedby={fieldError.firstName ? "ap-first-err" : undefined}
                  />
                </InvestingFormField>
                <InvestingFormField
                  id="ap-last"
                  label={<>Last name <span className="contacts_required" aria-hidden>*</span></>}
                  Icon={UserRound}
                  tight
                  error={fieldError.lastName}
                >
                  <input
                    id="ap-last"
                    className={invClass(
                      "deals_add_inv_input deals_add_inv_field_control",
                      Boolean(fieldError.lastName),
                    )}
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(e) => patch({ lastName: e.target.value }, "lastName")}
                    placeholder="e.g. Lee"
                    aria-invalid={Boolean(fieldError.lastName)}
                    aria-describedby={fieldError.lastName ? "ap-last-err" : undefined}
                  />
                </InvestingFormField>
              </div>
              <InvestingFormField id="ap-middle" label="Middle name" Icon={UserRound}>
                <input
                  id="ap-middle"
                  className="deals_add_inv_input deals_add_inv_field_control"
                  autoComplete="additional-name"
                  value={form.middleName}
                  onChange={(e) => patch({ middleName: e.target.value })}
                  placeholder="Middle name"
                />
              </InvestingFormField>
              <InvestingFormField
                id="ap-ssn"
                label={<>SSN or ITIN <span className="contacts_required" aria-hidden>*</span></>}
                Icon={Fingerprint}
                error={fieldError.ssn}
              >
                <SsnItinMaskedInput
                  id="ap-ssn"
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(fieldError.ssn),
                  )}
                  value={form.ssn}
                  onValueChange={(ssn) => patch({ ssn }, "ssn")}
                  revealed={ssnVisible}
                  onRevealedChange={setSsnVisible}
                  showToggle
                  revealLabel="Show SSN or ITIN"
                  hideLabel="Hide SSN or ITIN"
                  placeholder="___-__-____"
                  aria-invalid={Boolean(fieldError.ssn)}
                  aria-describedby={
                    fieldError.ssn ? "ap-ssn-err" : undefined
                  }
                />
              </InvestingFormField>
            </div>
          )}

          {step === 3 &&
            (isIndividual || isJointTenancy || isEntity) && (
            <div className="add_contact_section" aria-labelledby="ap-s3">
              <p id="ap-s3" className="add_contact_section_eyebrow">
                Distributions
              </p>
              <InvestingFormField
                id="ap-dm"
                label={<>Distribution method <span className="contacts_required" aria-hidden>*</span></>}
                Icon={CircleDollarSign}
                labelSuffix={
                  <FieldHelp
                    label="Distribution method"
                    tooltip={
                      distributionDetailsHint(form.distributionMethod) ||
                      "Select how you want to receive distributions."
                    }
                  />
                }
              >
                <DealsCreateDropdownSelect
                  id="ap-dm"
                  options={[
                    { value: "ach", label: "ACH (recommended)" },
                    { value: "check", label: "Check" },
                    { value: "other", label: "Other" },
                  ]}
                  value={form.distributionMethod}
                  onChange={(next) => {
                    const v = next as DistributionMethod
                    const clearedAch = {
                      achRoutingNumber: "",
                      achAccountNumber: "",
                      achBankAddress: "",
                      achBankName: "",
                      achBankAccountType: "",
                    }
                    patch(
                      {
                        distributionMethod: v,
                        ...(v === "check"
                          ? { bankAccountQuery: "", ...clearedAch }
                          : v === "ach"
                            ? {
                                bankAccountQuery: "",
                                checkPayeeName: "",
                                checkMailingAddressId: "",
                              }
                            : {
                                ...clearedAch,
                                checkPayeeName: "",
                                checkMailingAddressId: "",
                              }),
                      },
                      v === "check"
                        ? ([
                            "bankAccountQuery",
                            "achRoutingNumber",
                            "achAccountNumber",
                            "achBankAddress",
                            "achBankName",
                            "achBankAccountType",
                          ] as const)
                        : v === "ach"
                          ? (["checkPayeeName", "checkMailingAddressId", "bankAccountQuery"] as const)
                          : ([
                              "checkPayeeName",
                              "checkMailingAddressId",
                              "achRoutingNumber",
                              "achAccountNumber",
                              "achBankAddress",
                              "achBankName",
                              "achBankAccountType",
                            ] as const),
                    )
                  }}
                  ariaLabel="Distribution method"
                  triggerClassName="deals_add_inv_field_control"
                />
              </InvestingFormField>
              {form.distributionMethod === "check" ? (
                <>
                  <InvestingFormField
                    id="ap-check-payee"
                    label={<>Payee name <span className="contacts_required" aria-hidden>*</span></>}
                    Icon={UserRound}
                    error={fieldError.checkPayeeName}
                  >
                    <input
                      id="ap-check-payee"
                      className={invClass(
                        "deals_add_inv_input deals_add_inv_field_control",
                        Boolean(fieldError.checkPayeeName),
                      )}
                      value={form.checkPayeeName}
                      onChange={(e) =>
                        patch({ checkPayeeName: e.target.value }, "checkPayeeName")
                      }
                      autoComplete="name"
                      placeholder="Name on the check"
                      aria-invalid={Boolean(fieldError.checkPayeeName)}
                      aria-describedby={
                        fieldError.checkPayeeName ? "ap-check-payee-err" : undefined
                      }
                    />
                  </InvestingFormField>
                  <InvestingFormField
                    id="ap-check-mail"
                    label={
                      <>Check mailing address <span className="contacts_required" aria-hidden>*</span></>
                    }
                    Icon={MapPin}
                    error={fieldError.checkMailingAddressId}
                  >
                    <SavedAddressSelect
                      id="ap-check-mail"
                      value={form.checkMailingAddressId}
                      onChange={(v) =>
                        patch({ checkMailingAddressId: v }, "checkMailingAddressId")
                      }
                      savedAddresses={activeSavedAddresses}
                      emptyLabel="Select a saved address for check mailing"
                      ariaLabel="Check mailing address — select a saved address"
                      invalid={Boolean(fieldError.checkMailingAddressId)}
                      onAddNew={() => openAddAddressModal("checkMailingAddressId")}
                    />
                  </InvestingFormField>
                </>
              ) : form.distributionMethod === "ach" ? (
                <AchDistributionBankFields
                  form={form}
                  fieldError={fieldError}
                  patch={patch}
                  invClass={invClass}
                />
              ) : (
                <InvestingFormField
                  id="ap-bank"
                  label={
                    <>
                      {distributionDetailsLabel(form.distributionMethod)}{" "}
                      <span className="contacts_required" aria-hidden>*</span>
                    </>
                  }
                  Icon={Search}
                  error={fieldError.bankAccountQuery}
                >
                  <div className="add_profile_search_wrap">
                    <input
                      id="ap-bank"
                      className={invClass(
                        "deals_add_inv_input deals_add_inv_field_control add_profile_search add_profile_search_no_icon",
                        Boolean(fieldError.bankAccountQuery),
                      )}
                      value={form.bankAccountQuery}
                      onChange={(e) =>
                        patch({ bankAccountQuery: e.target.value }, "bankAccountQuery")
                      }
                      placeholder={distributionDetailsPlaceholder(
                        form.distributionMethod,
                      )}
                      autoComplete="off"
                      aria-label={distributionDetailsInputAria(form.distributionMethod)}
                      aria-invalid={Boolean(fieldError.bankAccountQuery)}
                      aria-describedby={
                        fieldError.bankAccountQuery ? "ap-bank-err" : undefined
                      }
                    />
                  </div>
                </InvestingFormField>
              )}
            </div>
          )}

          {step === 4 && (isIndividual || isEntity) && (
            <div className="add_contact_section" aria-labelledby="ap-s4">
              <p id="ap-s4" className="add_contact_section_eyebrow">
                Address
              </p>
              <InvestingFormField
                id="ap-tax-addr"
                label={<>Tax address <span className="contacts_required" aria-hidden>*</span></>}
                Icon={MapPin}
                error={fieldError.taxAddressId}
              >
                <SavedAddressSelect
                  id="ap-tax-addr"
                  value={form.taxAddressId}
                  onChange={(v) => {
                    const partial: Partial<FormState> = { taxAddressId: v }
                    if (form.mailingAddressMode === "same_as_tax") {
                      partial.mailingAddressId = v
                    }
                    patch(partial, "taxAddressId")
                  }}
                  savedAddresses={activeSavedAddresses}
                  emptyLabel="Select a saved address"
                  ariaLabel="Tax address — select a saved address"
                  invalid={Boolean(fieldError.taxAddressId)}
                  onAddNew={() => openAddAddressModal("taxAddressId")}
                />
              </InvestingFormField>
              <MailingAddressFields
                idPrefix="ap"
                label="Mailing address"
                taxAddressId={form.taxAddressId}
                mailingAddressId={form.mailingAddressId}
                mailingAddressMode={form.mailingAddressMode}
                savedAddresses={activeSavedAddresses}
                onPatch={patch}
                onOpenAddMailing={() => openAddAddressModal("mailingAddressId")}
                emptyLabel="Optional — select a saved address"
              />
            </div>
          )}

          {step === 5 && hasBeneficiaryStep && (
            <div className="add_contact_section" aria-labelledby="ap-s5">
              <p id="ap-s5" className="add_contact_section_eyebrow">
                Beneficiary info
              </p>
              <p className="add_profile_sub add_profile_ben_lead">
                Choose a saved beneficiary from the list, add a new one from the dropdown, or
                continue without one.
              </p>
              <div className="um_field">
                <div className="um_field_label_row" style={{ alignItems: "center" }}>
                  <UserPlus
                    className="um_field_label_icon"
                    size={17}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="mail_text_label" id="ap-ben-label">
                    Beneficiary
                  </span>
                  <FieldHelp
                    label="Beneficiary"
                    tooltip={BENEFICIARY_LEGAL_DISCLAIMER}
                  />
                </div>
                <SavedBeneficiarySelect
                  id="ap-ben-saved"
                  value={form.beneficiaryPickId}
                  onChange={(nextId) => {
                    if (!nextId) {
                      patch({ beneficiary: null, beneficiaryPickId: "" })
                      return
                    }
                    const row = activeSavedBeneficiaries.find((b) => b.id === nextId)
                    if (row) {
                      patch({
                        beneficiary: beneficiaryToDraft(row),
                        beneficiaryPickId: nextId,
                      })
                    }
                  }}
                  rows={activeSavedBeneficiaries}
                  emptyLabel="No beneficiary (optional)"
                  ariaLabel="Designated beneficiary — choose a saved beneficiary"
                  onAddNew={() => setAddBeneficiaryOpen(true)}
                />
                {form.beneficiary ? (
                  <p
                    className="add_profile_ben_sub"
                    style={{ marginTop: "0.45em" }}
                    aria-live="polite"
                  >
                    {[form.beneficiary.email, form.beneficiary.phone]
                      .map((s) => String(s ?? "").trim())
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {isEdit && step === totalSteps && (
            <div className="add_contact_section" aria-labelledby="ap-s6-reason">
              <p id="ap-s6-reason" className="add_contact_section_eyebrow">
                {EDIT_WIZARD_REASON_LABEL}
              </p>
              <p className="add_profile_sub" style={{ marginBottom: "0.65em" }}>
                Required. This note is stored on the profile for the audit log.
              </p>
              <div className="um_field">
                <label className="um_field_label_row" htmlFor="ap-reason-ta">
                  <FileText
                    className="um_field_label_icon"
                    size={17}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span>Change notes</span>
                </label>
                <textarea
                  id="ap-reason-ta"
                  className={invClass(
                    "deals_add_inv_input deals_add_inv_field_control",
                    Boolean(lastEditReasonError),
                  )}
                  rows={5}
                  value={lastEditReason}
                  onChange={(e) => {
                    setLastEditReason(e.target.value)
                    setLastEditReasonError(null)
                  }}
                  placeholder="Describe why you are saving these changes (e.g. new bank details, name correction, …)"
                  autoComplete="off"
                  aria-invalid={Boolean(lastEditReasonError)}
                  aria-describedby={lastEditReasonError ? "ap-reason-err" : undefined}
                />
                {lastEditReasonError ? (
                  <p id="ap-reason-err" className="um_field_hint um_field_hint_error" role="alert">
                    {lastEditReasonError}
                  </p>
                ) : null}
              </div>
            </div>
          )}
          </div>

        <div
          className={
            isPage
              ? "um_modal_actions deal_inv_ic_add_panel_actions deals_add_deal_asset_footer_actions"
              : "um_modal_actions add_contact_modal_actions"
          }
        >
          <button
            type="button"
            className="um_btn_secondary add_contact_modal_actions_leading"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <div className="add_contact_modal_actions_trailing">
            {((isIndividual || isJointTenancy || isEntity) && step > 1) && (
              <button
                type="button"
                className="um_btn_secondary"
                onClick={() => {
                  if (isEdit && step === totalSteps) setLastEditReasonError(null)
                  goBack()
                }}
              >
                <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                Back
              </button>
            )}
            {step < totalSteps &&
              (step === 1 ||
                isIndividual ||
                isJointTenancy ||
                isEntity) && (
              <button
                type="button"
                className="um_btn_primary"
                onClick={() => void goNext()}
              >
                Next
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </button>
            )}
            {((isIndividual || isJointTenancy || isEntity) &&
              step === addFlowLastContentStep &&
              !isEdit) && (
              <button
                type="button"
                className="um_btn_primary"
                onClick={() => void handleSubmit()}
              >
                <Save size={16} strokeWidth={2} aria-hidden />
                Save
              </button>
            )}
            {isEdit && step === totalSteps && (isIndividual || isJointTenancy || isEntity) && (
              <button type="button" className="um_btn_primary" onClick={() => void handleEditSave()}>
                <Save size={16} strokeWidth={2} aria-hidden />
                Save
              </button>
            )}
          </div>
        </div>
        </form>
    )

    if (isPage) return formNode

    return (
      <div
        className={`um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel investing_add_profile_form_panel${
          isListInline ? " investing_add_profile_form_panel--inline" : ""
        }`}
        role={isListInline ? "region" : "dialog"}
        aria-modal={isListInline ? undefined : true}
        aria-labelledby="add-profile-modal-title"
        aria-describedby="add-profile-step-label"
        onClick={isListInline ? undefined : (e) => e.stopPropagation()}
      >
        <div className="um_modal_head add_contact_modal_head">
          <div className="add_contact_modal_head_main">
            <h3
              id="add-profile-modal-title"
              className="um_modal_title add_contact_modal_title"
            >
              {isEdit ? "Edit profile" : "Add profile"}
            </h3>
            <div
              className="add_contact_stepper"
              role="group"
              aria-label="Progress"
            >
              {stepperGroup()}
            </div>
          </div>
          <button
            type="button"
            className="um_modal_close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {formNode}
      </div>
    )
  }

  if (isPage) {
    return (
      <>
        <div className="deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page deals_create_flow">
          <header className="deals_list_head deals_add_investor_class_page_head deals_create_page_head">
            <div className="deals_add_deal_asset_head_main deals_create_head_main">
              <div className="deals_list_title_row deals_add_deal_asset_title_row">
                <button
                  type="button"
                  className="deals_list_back_circle"
                  onClick={handleClose}
                  aria-label="Back to profiles"
                >
                  <ArrowLeft size={20} strokeWidth={2} aria-hidden />
                </button>
                <div className="deals_add_deal_asset_title_stack">
                  <FormHeadingWithInfo
                    as="h1"
                    id={addProfilePageTitleId}
                    className="deals_list_title"
                    title={isEdit ? "Edit profile" : "Add profile"}
                    info={<p>{addProfilePageSubtitle}</p>}
                  />
                </div>
              </div>
              <div
                className="add_contact_stepper deals_add_deal_asset_stepper deals_create_stepper"
                role="group"
                aria-label={isEdit ? "Edit profile steps" : "Add profile steps"}
              >
                {stepperGroup()}
              </div>
            </div>
          </header>

          <section
            className="deals_create_deal_section"
            aria-labelledby={addProfilePageTitleId}
          >
            {renderFormPanel()}
          </section>
        </div>
        {profileBookModals}
      </>
    )
  }

  return (
  <>
  {isListInline ? (
    <section
      className="investing_add_profile_inline_root"
      aria-label={isEdit ? "Edit profile" : "Add profile"}
    >
      {renderFormPanel()}
    </section>
  ) : createPortal(
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {renderFormPanel()}
    </div>,
    document.body,
  )}
  {profileBookModals}
  </>
  )
}

export default AddInvestorProfileModal
