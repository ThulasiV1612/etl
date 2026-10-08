import type { BeneficiaryDraft } from "./AddBeneficiaryModal"
import { formatSavedAddressLabel, type SavedAddress } from "./address.types"
import type {
  InvestorProfileDistributionBank,
  InvestorProfileListRow,
} from "./investor-profiles.types"
import {
  formatUsPhoneStoredForUi,
  nationalDigitsFromStoredPhone,
} from "@/common/phone/usPhoneNumber"
import { maskSsnItinLast4 } from "@/common/tax/usSsnItin"
import { bookProfileTypeDisplayLabel } from "@/modules/Syndication/Deals/utils/resolveInvestNowDealContext"

export type InvestorProfileViewDetailRow = { label: string; value: string }

export type InvestorProfileViewSection = {
  heading: string
  rows: InvestorProfileViewDetailRow[]
}

const PROFILE_TYPE_INDIVIDUAL = "Individual"
const PROFILE_TYPE_JOINT_TENANCY = "Joint tenancy"
const PROFILE_TYPE_ENTITY = "Entity"

/** Same step labels as AddInvestorProfileModal wizard. */
export const INVESTOR_PROFILE_WIZARD_STEP_LABELS = {
  profileType: "Profile type",
  profileDetails: "Profile details",
  distributions: "Distributions",
  address: "Address",
  beneficiary: "Beneficiary",
} as const

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

const ACH_BANK_ACCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
]

type WizardForm = {
  profileType: string
  firstName: string
  middleName: string
  lastName: string
  email1: string
  ssn: string
  firstName2: string
  middleName2: string
  lastName2: string
  email2: string
  phone2: string
  spouseSsn: string
  distributionMethod: string
  bankAccountQuery: string
  achRoutingNumber: string
  achAccountNumber: string
  achBankAddress: string
  achBankName: string
  achBankAccountType: string
  checkPayeeName: string
  checkMailingAddressId: string
  taxAddressId: string
  mailingAddressId: string
  mailingAddressMode: string
  entitySubType: string
  entityLegalName: string
  entityJurisdictionOfRegistration: string
  entityDateFormed: string
  entityOwnedByIra401k: string
  entityMemberCount: string
  entityDisregarded: string
  entityEin: string
  custodianIra: string
  legalIraName: string
  iraCompany: string
  federalTaxClassification: string
  iraPartnerEin: string
  iraCustodianEin: string
  beneficiary: BeneficiaryDraft | null
  beneficiaryPickId: string
}

const WIZARD_KEYS: (keyof WizardForm)[] = [
  "profileType",
  "firstName",
  "middleName",
  "lastName",
  "email1",
  "ssn",
  "firstName2",
  "middleName2",
  "lastName2",
  "email2",
  "phone2",
  "spouseSsn",
  "distributionMethod",
  "bankAccountQuery",
  "achRoutingNumber",
  "achAccountNumber",
  "achBankAddress",
  "achBankName",
  "achBankAccountType",
  "checkPayeeName",
  "checkMailingAddressId",
  "taxAddressId",
  "mailingAddressId",
  "mailingAddressMode",
  "entitySubType",
  "entityLegalName",
  "entityJurisdictionOfRegistration",
  "entityDateFormed",
  "entityOwnedByIra401k",
  "entityMemberCount",
  "entityDisregarded",
  "entityEin",
  "custodianIra",
  "legalIraName",
  "iraCompany",
  "federalTaxClassification",
  "iraPartnerEin",
  "iraCustodianEin",
  "beneficiary",
  "beneficiaryPickId",
]

function emptyWizardForm(): WizardForm {
  return {
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
    distributionMethod: "",
    bankAccountQuery: "",
    achRoutingNumber: "",
    achAccountNumber: "",
    achBankAddress: "",
    achBankName: "",
    achBankAccountType: "",
    checkPayeeName: "",
    checkMailingAddressId: "",
    taxAddressId: "",
    mailingAddressId: "",
    mailingAddressMode: "",
    entitySubType: "",
    entityLegalName: "",
    entityJurisdictionOfRegistration: "",
    entityDateFormed: "",
    entityOwnedByIra401k: "",
    entityMemberCount: "",
    entityDisregarded: "",
    entityEin: "",
    custodianIra: "",
    legalIraName: "",
    iraCompany: "",
    federalTaxClassification: "",
    iraPartnerEin: "",
    iraCustodianEin: "",
    beneficiary: null,
    beneficiaryPickId: "",
  }
}

function normalizeProfileTypeFromListRow(raw: string): Partial<WizardForm> {
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
  if (lower.includes("custodian") || lower.includes("401(k)")) {
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

function seedFormFromListRow(row: {
  profileName: string
  profileType: string
}): Partial<WizardForm> {
  const typePatch = normalizeProfileTypeFromListRow(row.profileType)
  const t = (typePatch.profileType || row.profileType || "").trim()
  const out: Partial<WizardForm> = { ...typePatch, profileType: t }
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

function partialWizardFromSaved(raw: unknown): Partial<WizardForm> {
  let parsed: unknown = raw
  if (typeof parsed === "string") {
    const t = parsed.trim()
    if (!t) return {}
    try {
      parsed = JSON.parse(t) as unknown
    } catch {
      return {}
    }
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {}
  }
  let src = parsed as Record<string, unknown>
  const inner = src.form
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const formRec = inner as Record<string, unknown>
    if (
      "firstName" in formRec ||
      "profileType" in formRec ||
      "entityLegalName" in formRec ||
      "legalIraName" in formRec
    ) {
      src = formRec
    }
  }
  const out: Partial<WizardForm> = {}
  for (const k of WIZARD_KEYS) {
    if (!(k in src)) continue
    const v = src[k]
    if (k === "beneficiary") {
      if (v == null) out.beneficiary = null
      else if (typeof v === "object" && !Array.isArray(v)) {
        out.beneficiary = v as BeneficiaryDraft
      }
      continue
    }
    if (k === "phone2" && typeof v === "string") {
      out.phone2 = nationalDigitsFromStoredPhone(v)
      continue
    }
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

function mergeDistributionBank(
  form: WizardForm,
  bank: InvestorProfileDistributionBank | undefined,
): WizardForm {
  if (!bank) return form
  return {
    ...form,
    distributionMethod:
      form.distributionMethod.trim() || bank.distributionMethod || form.distributionMethod,
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

function display(v: string | undefined | null): string {
  const t = String(v ?? "").trim()
  return t || "—"
}

function yesNo(v: string): string {
  if (v === "yes") return "Yes"
  if (v === "no") return "No"
  return display(v)
}

function maskTaxId(raw: string): string {
  const masked = maskSsnItinLast4(raw)
  return masked || "—"
}

function maskAccountNumber(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (!d) return "—"
  const last4 = d.length <= 4 ? d : d.slice(-4)
  return `···· ${last4}`
}

function optionLabel(
  value: string,
  options: { value: string; label: string }[],
): string {
  const v = value.trim()
  if (!v) return "—"
  return options.find((o) => o.value === v)?.label ?? v
}

function distributionMethodLabel(m: string): string {
  const t = m.trim().toLowerCase()
  if (t === "ach") return "ACH"
  if (t === "check") return "Check"
  if (t === "other") return "Other"
  return display(m)
}

function resolveAddressLabel(
  id: string,
  addresses: SavedAddress[],
): string {
  const t = id.trim()
  if (!t) return "—"
  const row = addresses.find((a) => a.id === t)
  if (!row) return "—"
  return formatSavedAddressLabel(row)
}

function formatProfileListDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "—"
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function pushRows(
  rows: InvestorProfileViewDetailRow[],
  pairs: [string, string][],
): void {
  for (const [label, value] of pairs) {
    rows.push({ label, value: display(value) })
  }
}

function personName(
  first: string,
  middle: string,
  last: string,
): string {
  return [first, middle, last].map((s) => s.trim()).filter(Boolean).join(" ")
}

function resolveWizardFormForRow(
  row: InvestorProfileListRow,
): { form: WizardForm; profileType: string } {
  const fromWizard = partialWizardFromSaved(row.profileWizardState)
  const typePatch = normalizeProfileTypeFromListRow(row.profileType)
  const seeded =
    Object.keys(fromWizard).length > 0
      ? { ...typePatch, ...fromWizard }
      : seedFormFromListRow(row)
  const form = mergeDistributionBank(
    { ...emptyWizardForm(), ...seeded },
    row.distributionBank,
  )
  const profileType =
    (form.profileType || row.profileType || "").trim() || form.profileType
  return { form: { ...form, profileType }, profileType }
}

/** Matches profile-type dropdown labels in the add/edit wizard. */
function profileTypeDisplayLabel(form: WizardForm, fallbackType: string): string {
  const t = (form.profileType || fallbackType || "").trim()
  if (t === PROFILE_TYPE_INDIVIDUAL) return PROFILE_TYPE_INDIVIDUAL
  if (t === PROFILE_TYPE_JOINT_TENANCY) return PROFILE_TYPE_JOINT_TENANCY
  if (t === PROFILE_TYPE_ENTITY) {
    if (form.custodianIra === "yes") {
      return "Custodian IRA or custodian based 401(k)"
    }
    return "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA"
  }
  return display(t)
}

export function buildInvestorProfileViewDescription(
  row: InvestorProfileListRow,
): string {
  const parts = [
    bookProfileTypeDisplayLabel(row),
    `${row.investmentsCount ?? 0} investment${row.investmentsCount === 1 ? "" : "s"}`,
    row.archived ? "Archived" : "Active",
    row.dateCreated ? `Added ${formatProfileListDate(row.dateCreated)}` : "",
  ].filter(Boolean)
  return parts.join(" · ")
}

function buildBeneficiaryRows(
  beneficiary: BeneficiaryDraft | null,
  beneficiaryPickId: string,
  savedBeneficiaries: (BeneficiaryDraft & { id: string })[],
): InvestorProfileViewDetailRow[] {
  let b = beneficiary
  if (!b && beneficiaryPickId.trim()) {
    const picked = savedBeneficiaries.find((x) => x.id === beneficiaryPickId.trim())
    if (picked) b = picked
  }
  if (!b) return [{ label: "Beneficiary", value: "—" }]
  return [
    { label: "Name", value: display(b.fullName) },
    { label: "Relationship", value: display(b.relationship) },
    { label: "Email", value: display(b.email) },
    { label: "Phone", value: formatUsPhoneStoredForUi(b.phone) || "—" },
    { label: "Address", value: display(b.addressQuery) },
    { label: "Tax ID", value: maskTaxId(b.taxId) },
  ]
}

function buildDistributionRows(form: WizardForm, addresses: SavedAddress[]): InvestorProfileViewDetailRow[] {
  const rows: InvestorProfileViewDetailRow[] = []
  const method = form.distributionMethod.trim().toLowerCase()
  rows.push({
    label: "Distribution method",
    value: distributionMethodLabel(form.distributionMethod),
  })
  if (method === "ach") {
    pushRows(rows, [
      ["Routing number", form.achRoutingNumber],
      ["Account number", maskAccountNumber(form.achAccountNumber)],
      ["Bank name", form.achBankName],
      ["Bank address", form.achBankAddress],
      [
        "Bank account type",
        optionLabel(form.achBankAccountType, ACH_BANK_ACCOUNT_TYPE_OPTIONS),
      ],
    ])
  } else if (method === "check") {
    pushRows(rows, [
      ["Check payee name", form.checkPayeeName],
      [
        "Check mailing address",
        resolveAddressLabel(form.checkMailingAddressId, addresses),
      ],
    ])
  } else {
    rows.push({
      label: "Distribution instructions",
      value: display(form.bankAccountQuery),
    })
  }
  return rows
}

function buildAddressRows(form: WizardForm, addresses: SavedAddress[]): InvestorProfileViewDetailRow[] {
  const rows: InvestorProfileViewDetailRow[] = []
  rows.push({
    label: "Tax address",
    value: resolveAddressLabel(form.taxAddressId, addresses),
  })
  if (form.mailingAddressMode === "same_as_tax") {
    rows.push({ label: "Mailing address", value: "Same as tax address" })
  } else {
    rows.push({
      label: "Mailing address",
      value: resolveAddressLabel(form.mailingAddressId, addresses),
    })
  }
  return rows
}

function buildProfileDetailsRows(
  form: WizardForm,
  profileType: string,
): InvestorProfileViewDetailRow[] {
  const rows: InvestorProfileViewDetailRow[] = []
  const t = profileType.trim()

  if (t === PROFILE_TYPE_INDIVIDUAL) {
    pushRows(rows, [
      ["First name", form.firstName],
      ["Middle name", form.middleName],
      ["Last name", form.lastName],
      ["Email", form.email1],
      ["SSN / ITIN", maskTaxId(form.ssn)],
    ])
    return rows
  }

  if (t === PROFILE_TYPE_JOINT_TENANCY) {
    pushRows(rows, [
      ["Investor 1 — name", personName(form.firstName, form.middleName, form.lastName)],
      ["Investor 1 — email", form.email1],
      [
        "Investor 2 — name",
        personName(form.firstName2, form.middleName2, form.lastName2),
      ],
      ["Investor 2 — email", form.email2],
      ["Investor 2 — phone", formatUsPhoneStoredForUi(form.phone2)],
      ["SSN / ITIN (investor 1)", maskTaxId(form.ssn)],
      ["SSN / ITIN (investor 2)", maskTaxId(form.spouseSsn)],
    ])
    return rows
  }

  if (t === PROFILE_TYPE_ENTITY) {
    if (form.custodianIra === "yes") {
      pushRows(rows, [
        ["Legal IRA name", form.legalIraName],
        ["IRA company / custodian", form.iraCompany],
        [
          "Federal tax classification",
          optionLabel(
            form.federalTaxClassification,
            FEDERAL_TAX_CLASSIFICATION_OPTIONS,
          ),
        ],
        ["Partner EIN", maskTaxId(form.iraPartnerEin)],
        ["Custodian EIN", maskTaxId(form.iraCustodianEin)],
      ])
    } else {
      pushRows(rows, [
        [
          "Entity type",
          optionLabel(form.entitySubType, ENTITY_SUBTYPE_OPTIONS),
        ],
        ["Legal entity name", form.entityLegalName],
        ["Jurisdiction of registration", form.entityJurisdictionOfRegistration],
        ["Date formed", form.entityDateFormed],
        ["Owned by IRA / 401(k)", yesNo(form.entityOwnedByIra401k)],
        ["Number of members", form.entityMemberCount],
        ["Disregarded entity", yesNo(form.entityDisregarded)],
        ["EIN / Tax ID", maskTaxId(form.entityEin)],
      ])
    }
    return rows
  }

  return rows
}

export function buildInvestorProfileViewSections(input: {
  row: InvestorProfileListRow
  savedAddresses?: SavedAddress[]
  savedBeneficiaries?: (BeneficiaryDraft & { id: string })[]
}): InvestorProfileViewSection[] {
  const { row } = input
  const addresses = input.savedAddresses ?? []
  const beneficiaries = input.savedBeneficiaries ?? []

  const { form, profileType } = resolveWizardFormForRow(row)
  const sections: InvestorProfileViewSection[] = []

  sections.push({
    heading: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileType,
    rows: [
      {
        label: "Profile type",
        value: profileTypeDisplayLabel(form, row.profileType),
      },
    ],
  })

  const detailsRows = buildProfileDetailsRows(form, profileType)
  sections.push({
    heading: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
    rows:
      detailsRows.length > 0
        ? detailsRows
        : [{ label: "Details", value: "—" }],
  })

  const distributionRows = buildDistributionRows(form, addresses)
  sections.push({
    heading: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
    rows:
      distributionRows.length > 0 &&
      (distributionRows.some((r) => r.value !== "—") ||
        form.distributionMethod.trim())
        ? distributionRows
        : [{ label: "Distribution method", value: "—" }],
  })

  const addressRows = buildAddressRows(form, addresses)
  sections.push({
    heading: INVESTOR_PROFILE_WIZARD_STEP_LABELS.address,
    rows:
      addressRows.some((r) => r.value !== "—")
        ? addressRows
        : [
            { label: "Tax address", value: "—" },
            { label: "Mailing address", value: "—" },
          ],
  })

  if (profileType === PROFILE_TYPE_INDIVIDUAL) {
    const beneRows = buildBeneficiaryRows(
      form.beneficiary,
      form.beneficiaryPickId,
      beneficiaries,
    )
    sections.push({
      heading: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      rows: beneRows,
    })
  }

  const listMetaRows: InvestorProfileViewDetailRow[] = [
    { label: "Profile name", value: display(row.profileName) },
    { label: "Added by", value: display(row.addedBy) },
  ]
  if (row.lastEditReason?.trim()) {
    listMetaRows.push({
      label: "Last change note",
      value: display(row.lastEditReason),
    })
  }
  sections.push({ heading: "Profile record", rows: listMetaRows })

  return sections
}
