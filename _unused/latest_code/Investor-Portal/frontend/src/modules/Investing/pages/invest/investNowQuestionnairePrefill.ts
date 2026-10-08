import { nationalDigitsFromStoredPhone } from "@/common/phone/usPhoneNumber"
import type { SavedAddress } from "@/modules/Investing/pages/profiles/address.types"
import type { BeneficiaryDraft } from "@/modules/Investing/pages/profiles/AddBeneficiaryModal"
import type { InvestorProfileListRow } from "@/modules/Investing/pages/profiles/investor-profiles.types"
import { readSessionUser } from "@/modules/myaccount/sessionUser"
import {
  questionsForSection,
  type InvestorQuestionnaireConfig,
  type InvestorQuestionnaireQuestion,
} from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import { resolveInvestorProfileFieldValue } from "@/modules/Syndication/Deals/tabs/esign_templates/investorProfileFieldPrefill"
import {
  formatInvestNowW9AddressLine,
  ssnFromAnyInvestorProfile,
} from "./investNowW9FormUtils"
import type { InvestNowQuestionnaireAnswers } from "./investNowQuestionnaireValidation"
import type { InvestNowW9FormValues } from "./investNowW9.types"

const ENTITY_SUBTYPE_TO_OWNERSHIP: Record<string, string> = {
  llc: "LLC",
  corporation: "Corporation",
  partnership: "Partnership",
  trust: "Trust",
}

const ENTITY_SUBTYPE_LABEL: Record<string, string> = {
  ira: "IRA",
  "401k": "401(k)",
}

function readWizardState(
  profile: InvestorProfileListRow,
): Record<string, unknown> | null {
  const raw = profile.profileWizardState
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function strField(wizard: Record<string, unknown> | null, key: string): string {
  if (!wizard) return ""
  return String(wizard[key] ?? "").trim()
}

function sessionStr(camelKey: string): string {
  const u = readSessionUser()
  if (!u) return ""
  const camel = u[camelKey]
  if (typeof camel === "string" && camel.trim()) return camel.trim()
  const snakeKey = camelKey.replace(/([A-Z])/g, "_$1").toLowerCase()
  const snake = u[snakeKey]
  return typeof snake === "string" ? snake.trim() : ""
}

function joinNameParts(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ")
}

function formatAddressLine(addr: SavedAddress): string {
  return formatInvestNowW9AddressLine({
    street1: addr.street1,
    street2: addr.street2,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
  })
}

function resolveAddressById(
  addresses: SavedAddress[],
  id: string,
): SavedAddress | undefined {
  const trimmed = id.trim()
  if (!trimmed) return undefined
  return addresses.find((a) => a.id === trimmed)
}

function resolveTaxAddress(
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
): SavedAddress | undefined {
  const taxId = strField(wizard, "taxAddressId")
  if (taxId) {
    const match = resolveAddressById(addresses, taxId)
    if (match) return match
  }
  return addresses[0]
}

function resolveMailingAddress(
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
  taxAddress?: SavedAddress,
): SavedAddress | undefined {
  const mailingId = strField(wizard, "mailingAddressId")
  if (mailingId) {
    const match = resolveAddressById(addresses, mailingId)
    if (match) return match
  }
  return taxAddress
}

function resolveTelephone(
  wizard: Record<string, unknown> | null,
): string {
  const fromWizard = strField(wizard, "phone2")
  if (fromWizard) return nationalDigitsFromStoredPhone(fromWizard)
  const fromSession = sessionStr("phone")
  if (fromSession) return nationalDigitsFromStoredPhone(fromSession)
  return ""
}

function parseJurisdiction(raw: string): { country: string; state: string } {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return {
      country: parts[0] ?? "",
      state: parts[parts.length - 1] ?? "",
    }
  }
  if (parts.length === 1) {
    return { country: "United States", state: parts[0] ?? "" }
  }
  return { country: "", state: "" }
}

function readBeneficiary(
  wizard: Record<string, unknown> | null,
): BeneficiaryDraft | null {
  if (!wizard) return null
  const raw = wizard.beneficiary
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const b = raw as Record<string, unknown>
  return {
    fullName: String(b.fullName ?? "").trim(),
    relationship: String(b.relationship ?? "").trim(),
    taxId: String(b.taxId ?? "").trim(),
    phone: String(b.phone ?? "").trim(),
    email: String(b.email ?? "").trim(),
    addressQuery: String(b.addressQuery ?? "").trim(),
  }
}

function entityTypeOwnershipFromWizard(
  wizard: Record<string, unknown> | null,
): { ownership: string; ownershipOther: string } {
  const sub = strField(wizard, "entitySubType").toLowerCase()
  if (!sub) return { ownership: "", ownershipOther: "" }
  const mapped = ENTITY_SUBTYPE_TO_OWNERSHIP[sub]
  if (mapped) return { ownership: mapped, ownershipOther: "" }
  const label = ENTITY_SUBTYPE_LABEL[sub] ?? sub
  return { ownership: "Other", ownershipOther: label }
}

function isUsAddress(addr?: SavedAddress): boolean {
  if (!addr) return false
  const country = String(addr.country ?? "").trim().toLowerCase()
  if (!country || country === "us" || country === "usa" || country.includes("united states")) {
    return true
  }
  return false
}

type QuestionnairePrefillContext = {
  firstName: string
  lastName: string
  fullName: string
  telephone: string
  addressLine: string
  mailingAddressLine: string
  ssn: string
  entityLegalName: string
  entityEin: string
  entityDateFormed: string
  entityJurisdictionCountry: string
  entityJurisdictionState: string
  entityBusinessPhone: string
  authorizedName: string
  beneficialOwners: string
  legalIraName: string
  iraCompany: string
  iraCustodianEin: string
  iraPartnerEin: string
  entityTypeOwnership: string
  entityTypeOwnershipOther: string
  relationshipAddress: string
  usTaxResident: string
}

function buildPrefillContext(
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
  profiles: InvestorProfileListRow[],
): QuestionnairePrefillContext {
  const firstName =
    strField(wizard, "firstName") || sessionStr("firstName")
  const middleName = strField(wizard, "middleName")
  const lastName =
    strField(wizard, "lastName") || sessionStr("lastName")
  const fullName = joinNameParts([firstName, middleName, lastName])

  const taxAddr = resolveTaxAddress(wizard, addresses)
  const mailingAddr = resolveMailingAddress(wizard, addresses, taxAddr)
  const addressLine = taxAddr ? formatAddressLine(taxAddr) : ""
  const mailingAddressLine = mailingAddr ? formatAddressLine(mailingAddr) : ""

  const jurisdiction = parseJurisdiction(
    strField(wizard, "entityJurisdictionOfRegistration"),
  )
  const { ownership, ownershipOther } = entityTypeOwnershipFromWizard(wizard)
  const beneficiary = readBeneficiary(wizard)

  const custodianIra = strField(wizard, "custodianIra").toLowerCase()
  const legalIraName =
    custodianIra === "yes"
      ? strField(wizard, "legalIraName")
      : strField(wizard, "entityLegalName")

  return {
    firstName,
    lastName,
    fullName,
    telephone: resolveTelephone(wizard),
    addressLine,
    mailingAddressLine,
    ssn: ssnFromAnyInvestorProfile(profiles),
    entityLegalName: strField(wizard, "entityLegalName"),
    entityEin: strField(wizard, "entityEin"),
    entityDateFormed: strField(wizard, "entityDateFormed"),
    entityJurisdictionCountry: jurisdiction.country,
    entityJurisdictionState: jurisdiction.state,
    entityBusinessPhone: resolveTelephone(wizard),
    authorizedName: fullName,
    beneficialOwners: beneficiary?.fullName ?? "",
    legalIraName,
    iraCompany: strField(wizard, "iraCompany"),
    iraCustodianEin: strField(wizard, "iraCustodianEin"),
    iraPartnerEin: strField(wizard, "iraPartnerEin"),
    entityTypeOwnership: ownership,
    entityTypeOwnershipOther: ownershipOther,
    relationshipAddress: mailingAddressLine || addressLine,
    usTaxResident: isUsAddress(taxAddr) ? "yes" : "",
  }
}

function resolveQuestionnairePrefillValue(
  questionId: string,
  ctx: QuestionnairePrefillContext,
): string | undefined {
  switch (questionId) {
    case "first_name":
      return ctx.firstName || undefined
    case "last_name":
      return ctx.lastName || undefined
    case "telephone":
      return ctx.telephone || undefined
    case "address":
      return ctx.addressLine || undefined
    case "social_security_number":
      return ctx.ssn || undefined
    case "us_tax_resident":
      return ctx.usTaxResident || undefined
    case "entity_full_legal_name":
      return ctx.entityLegalName || ctx.legalIraName || undefined
    case "entity_office_address":
      return ctx.addressLine || undefined
    case "entity_business_phone":
      return ctx.entityBusinessPhone || undefined
    case "entity_formation_date":
      return ctx.entityDateFormed || undefined
    case "entity_jurisdiction_country":
      return ctx.entityJurisdictionCountry || undefined
    case "entity_jurisdiction_state":
      return ctx.entityJurisdictionState || undefined
    case "entity_tax_id":
      return ctx.entityEin || undefined
    case "entity_authorized_name":
      return ctx.authorizedName || undefined
    case "entity_beneficial_owners":
      return ctx.beneficialOwners || undefined
    case "ira_entity_name":
      return ctx.legalIraName || ctx.entityLegalName || undefined
    case "ira_entity_office_address":
      return ctx.addressLine || undefined
    case "ira_entity_business_phone":
      return ctx.entityBusinessPhone || undefined
    case "ira_entity_incorporation_country":
      return ctx.entityJurisdictionCountry || undefined
    case "ira_entity_incorporation_state":
      return ctx.entityJurisdictionState || undefined
    case "ira_entity_custodian_ein":
      return ctx.iraCustodianEin || undefined
    case "ira_entity_partner_ein":
      return ctx.iraPartnerEin || undefined
    case "ira_entity_account_holder_name":
      return ctx.authorizedName || undefined
    case "relationship_address":
      return ctx.relationshipAddress || undefined
    case "entity_type_ownership":
      return ctx.entityTypeOwnership || undefined
    case "entity_type_ownership_other":
      return ctx.entityTypeOwnershipOther || undefined
    default:
      return undefined
  }
}

function resolveQuestionPrefillValue(
  question: Pick<InvestorQuestionnaireQuestion, "id" | "investorProfileFieldKey">,
  ctx: QuestionnairePrefillContext,
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
): string | undefined {
  const byId = resolveQuestionnairePrefillValue(question.id, ctx)
  if (byId) return byId
  const profileKey = question.investorProfileFieldKey?.trim()
  if (!profileKey) return undefined
  return resolveInvestorProfileFieldValue(profileKey, wizard, addresses)
}

/** Fill empty questionnaire answers from the selected investing profile and session user. */
export function buildInvestNowQuestionnairePrefill({
  profiles,
  addresses,
  savedUserProfileId,
  config,
  sectionId,
}: {
  profiles: InvestorProfileListRow[]
  addresses: SavedAddress[]
  savedUserProfileId: string
  config?: InvestorQuestionnaireConfig | null
  /** When set, only prefill questions in this section; otherwise all sections. */
  sectionId?: string
}): InvestNowQuestionnaireAnswers {
  const profile = profiles.find((p) => p.id === savedUserProfileId.trim())
  const wizard = profile ? readWizardState(profile) : null
  const ctx = buildPrefillContext(wizard, addresses, profiles)

  const questionIds = config
    ? sectionId
      ? questionsForSection(config.questions, sectionId)
      : config.questions
    : null

  const out: InvestNowQuestionnaireAnswers = {}
  if (questionIds) {
    for (const question of questionIds) {
      const value = resolveQuestionPrefillValue(question, ctx, wizard, addresses)
      if (value) out[question.id] = value
    }
    return out
  }

  const legacyQuestionIds = [
        "first_name",
        "last_name",
        "telephone",
        "address",
        "state_residency_duration",
        "birth_date",
        "us_tax_resident",
        "social_security_number",
        "entity_full_legal_name",
        "entity_office_address",
        "entity_business_phone",
        "entity_formation_date",
        "entity_jurisdiction_country",
        "entity_jurisdiction_state",
        "entity_tax_id",
        "entity_authorized_name",
        "entity_beneficial_owners",
        "ira_entity_name",
        "ira_entity_office_address",
        "ira_entity_business_phone",
        "ira_entity_incorporation_country",
        "ira_entity_incorporation_state",
        "ira_entity_custodian_ein",
        "ira_entity_partner_ein",
        "ira_entity_account_holder_name",
        "relationship_address",
        "entity_type_ownership",
        "entity_type_ownership_other",
      ]

  for (const id of legacyQuestionIds) {
    const value = resolveQuestionnairePrefillValue(id, ctx)
    if (value) out[id] = value
  }
  return out
}

/** Questionnaire address answers from W-9 (profile tax address flows through W-9 prefill). */
export function buildQuestionnaireAddressPrefillFromW9(
  w9: InvestNowW9FormValues,
): InvestNowQuestionnaireAnswers {
  const addressLine = formatInvestNowW9AddressLine(w9)
  if (!addressLine.trim()) return {}

  const relationshipAddress =
    w9.addressLine.trim() || addressLine

  return {
    address: addressLine,
    entity_office_address: addressLine,
    ira_entity_office_address: addressLine,
    relationship_address: relationshipAddress,
  }
}

/** Apply prefill without overwriting answers the investor already entered. */
export function mergeInvestNowQuestionnaireAnswers(
  current: InvestNowQuestionnaireAnswers,
  prefill: InvestNowQuestionnaireAnswers,
): InvestNowQuestionnaireAnswers {
  let changed = false
  const next = { ...current }
  for (const [key, value] of Object.entries(prefill)) {
    if (!value.trim()) continue
    if (!String(next[key] ?? "").trim()) {
      next[key] = value
      changed = true
    }
  }
  return changed ? next : current
}
