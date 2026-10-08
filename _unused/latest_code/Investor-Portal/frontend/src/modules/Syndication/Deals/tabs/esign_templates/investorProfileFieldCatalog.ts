import { INVESTOR_PROFILE_WIZARD_STEP_LABELS } from "@/modules/Investing/pages/profiles/investorProfileViewDetails"
import type { InvestorQuestionnaireFieldType } from "./investorQuestionnaire.types"

export type InvestorProfileFieldCatalogEntry = {
  /** Stable key stored on questionnaire questions as investorProfileFieldKey. */
  key: string
  label: string
  section: string
  fieldType: InvestorQuestionnaireFieldType
  /** Extra terms for search (aliases, abbreviations). */
  searchTerms?: string[]
}

export const INVESTOR_PROFILE_FIELD_CATALOG: InvestorProfileFieldCatalogEntry[] =
  [
    {
      key: "profileType",
      label: "Profile type",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileType,
      fieldType: "text",
      searchTerms: ["individual", "entity", "joint"],
    },
    {
      key: "firstName",
      label: "First name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
    },
    {
      key: "middleName",
      label: "Middle name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
    },
    {
      key: "lastName",
      label: "Last name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
    },
    {
      key: "fullName",
      label: "Full name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["print name", "investor name"],
    },
    {
      key: "email1",
      label: "Email",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["email address"],
    },
    {
      key: "ssn",
      label: "SSN / ITIN",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "ssn",
      searchTerms: ["social security", "tax id", "tin"],
    },
    {
      key: "firstName2",
      label: "Investor 2 — first name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["joint", "spouse", "second investor"],
    },
    {
      key: "middleName2",
      label: "Investor 2 — middle name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["joint", "spouse"],
    },
    {
      key: "lastName2",
      label: "Investor 2 — last name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["joint", "spouse"],
    },
    {
      key: "fullName2",
      label: "Investor 2 — full name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["joint", "spouse"],
    },
    {
      key: "email2",
      label: "Investor 2 — email",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["joint", "spouse"],
    },
    {
      key: "phone2",
      label: "Phone",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "phone",
      searchTerms: ["telephone", "mobile"],
    },
    {
      key: "spouseSsn",
      label: "Investor 2 — SSN / ITIN",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "ssn",
      searchTerms: ["joint", "spouse"],
    },
    {
      key: "entitySubType",
      label: "Entity type",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["llc", "corporation", "trust", "partnership"],
    },
    {
      key: "entityLegalName",
      label: "Legal entity name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["entity name", "company"],
    },
    {
      key: "entityJurisdictionOfRegistration",
      label: "Jurisdiction of registration",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["state", "country"],
    },
    {
      key: "entityDateFormed",
      label: "Date formed",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "date",
      searchTerms: ["formation date"],
    },
    {
      key: "entityOwnedByIra401k",
      label: "Owned by IRA / 401(k)",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "boolean",
    },
    {
      key: "entityMemberCount",
      label: "Number of members",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
    },
    {
      key: "entityDisregarded",
      label: "Disregarded entity",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "boolean",
    },
    {
      key: "entityEin",
      label: "EIN / Tax ID",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "ein",
      searchTerms: ["ein", "tax identification"],
    },
    {
      key: "legalIraName",
      label: "Legal IRA name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["ira entity"],
    },
    {
      key: "iraCompany",
      label: "IRA company / custodian",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
      searchTerms: ["custodian"],
    },
    {
      key: "federalTaxClassification",
      label: "Federal tax classification",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "text",
    },
    {
      key: "iraPartnerEin",
      label: "IRA partner EIN",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "ein",
    },
    {
      key: "iraCustodianEin",
      label: "IRA custodian EIN",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.profileDetails,
      fieldType: "ein",
    },
    {
      key: "distributionMethod",
      label: "Distribution method",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
      searchTerms: ["ach", "check"],
    },
    {
      key: "achRoutingNumber",
      label: "ACH routing number",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
    },
    {
      key: "achAccountNumber",
      label: "ACH account number",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
    },
    {
      key: "achBankName",
      label: "Bank name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
    },
    {
      key: "achBankAddress",
      label: "Bank address",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
    },
    {
      key: "achBankAccountType",
      label: "Bank account type",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
      searchTerms: ["checking", "savings"],
    },
    {
      key: "checkPayeeName",
      label: "Check payee name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "text",
    },
    {
      key: "checkMailingAddress",
      label: "Check mailing address",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "address",
    },
    {
      key: "bankAccountQuery",
      label: "Other distribution instructions",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.distributions,
      fieldType: "textarea",
    },
    {
      key: "taxAddress",
      label: "Tax address",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.address,
      fieldType: "address",
      searchTerms: ["residential", "home address"],
    },
    {
      key: "mailingAddress",
      label: "Mailing address",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.address,
      fieldType: "address",
    },
    {
      key: "beneficiaryFullName",
      label: "Beneficiary name",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      fieldType: "text",
    },
    {
      key: "beneficiaryRelationship",
      label: "Beneficiary relationship",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      fieldType: "text",
    },
    {
      key: "beneficiaryEmail",
      label: "Beneficiary email",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      fieldType: "text",
    },
    {
      key: "beneficiaryPhone",
      label: "Beneficiary phone",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      fieldType: "phone",
    },
    {
      key: "beneficiaryTaxId",
      label: "Beneficiary tax ID",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      fieldType: "ssn",
    },
    {
      key: "beneficiaryAddress",
      label: "Beneficiary address",
      section: INVESTOR_PROFILE_WIZARD_STEP_LABELS.beneficiary,
      fieldType: "address",
    },
  ]

const CATALOG_BY_KEY = new Map(
  INVESTOR_PROFILE_FIELD_CATALOG.map((entry) => [entry.key, entry]),
)

export function getInvestorProfileFieldCatalogEntry(
  key: string,
): InvestorProfileFieldCatalogEntry | undefined {
  return CATALOG_BY_KEY.get(key.trim())
}

export function investorProfileFieldCatalogLabel(key: string): string {
  return getInvestorProfileFieldCatalogEntry(key)?.label ?? key
}

function normalizeSearchText(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Filter catalog entries by search query (label, section, key, search terms). */
export function searchInvestorProfileFieldCatalog(
  query: string,
): InvestorProfileFieldCatalogEntry[] {
  const q = normalizeSearchText(query)
  if (!q) return [...INVESTOR_PROFILE_FIELD_CATALOG]
  return INVESTOR_PROFILE_FIELD_CATALOG.filter((entry) => {
    const haystack = [
      entry.label,
      entry.section,
      entry.key,
      ...(entry.searchTerms ?? []),
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}

/** Group catalog entries by wizard section for display. */
export function groupInvestorProfileFieldCatalog(
  entries: InvestorProfileFieldCatalogEntry[],
): { section: string; entries: InvestorProfileFieldCatalogEntry[] }[] {
  const order: string[] = []
  const bySection = new Map<string, InvestorProfileFieldCatalogEntry[]>()
  for (const entry of entries) {
    if (!bySection.has(entry.section)) {
      bySection.set(entry.section, [])
      order.push(entry.section)
    }
    bySection.get(entry.section)!.push(entry)
  }
  return order.map((section) => ({
    section,
    entries: bySection.get(section) ?? [],
  }))
}
