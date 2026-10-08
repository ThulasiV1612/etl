import { nationalDigitsFromStoredPhone } from "@/common/phone/usPhoneNumber"
import type { SavedAddress } from "@/modules/Investing/pages/profiles/address.types"
import type { BeneficiaryDraft } from "@/modules/Investing/pages/profiles/AddBeneficiaryModal"
import { formatInvestNowW9AddressLine } from "@/modules/Investing/pages/invest/investNowW9FormUtils"

const ENTITY_SUBTYPE_LABEL: Record<string, string> = {
  llc: "LLC",
  corporation: "Corporation",
  partnership: "Partnership",
  trust: "Trust",
  ira: "IRA",
  "401k": "401(k)",
}

const ACH_BANK_ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
}

const FEDERAL_TAX_CLASSIFICATION_LABEL: Record<string, string> = {
  individual_sole_smllc: "Individual/sole proprietor or single-member LLC",
  c_corp: "C Corporation",
  s_corp: "S Corporation",
  partnership: "Partnership",
  trust_estate: "Trust/estate",
  llc_excluding_smlc: "LLC (excluding single-member LLC)",
}

function strField(wizard: Record<string, unknown> | null, key: string): string {
  if (!wizard) return ""
  return String(wizard[key] ?? "").trim()
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
  if (strField(wizard, "mailingAddressMode") === "same_as_tax") {
    return taxAddress
  }
  const mailingId = strField(wizard, "mailingAddressId")
  if (mailingId) {
    const match = resolveAddressById(addresses, mailingId)
    if (match) return match
  }
  return taxAddress
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

function yesNoLabel(v: string): string {
  if (v === "yes") return "Yes"
  if (v === "no") return "No"
  return v
}

function distributionMethodLabel(m: string): string {
  const t = m.trim().toLowerCase()
  if (t === "ach") return "ACH"
  if (t === "check") return "Check"
  if (t === "other") return "Other"
  return m
}

function profileTypeLabel(wizard: Record<string, unknown> | null): string {
  const t = strField(wizard, "profileType")
  if (t === "Individual") return "Individual"
  if (t === "Joint tenancy") return "Joint tenancy"
  if (t === "Entity") {
    if (strField(wizard, "custodianIra").toLowerCase() === "yes") {
      return "Custodian IRA or custodian based 401(k)"
    }
    return "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA"
  }
  return t
}

/** Resolve a value from investor profile wizard state by catalog field key. */
export function resolveInvestorProfileFieldValue(
  fieldKey: string,
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
): string | undefined {
  const key = fieldKey.trim()
  if (!key) return undefined

  const taxAddr = resolveTaxAddress(wizard, addresses)
  const mailingAddr = resolveMailingAddress(wizard, addresses, taxAddr)
  const beneficiary = readBeneficiary(wizard)

  switch (key) {
    case "profileType":
      return profileTypeLabel(wizard) || undefined
    case "firstName":
      return strField(wizard, "firstName") || undefined
    case "middleName":
      return strField(wizard, "middleName") || undefined
    case "lastName":
      return strField(wizard, "lastName") || undefined
    case "fullName": {
      const name = joinNameParts([
        strField(wizard, "firstName"),
        strField(wizard, "middleName"),
        strField(wizard, "lastName"),
      ])
      return name || undefined
    }
    case "email1":
      return strField(wizard, "email1") || undefined
    case "ssn":
      return strField(wizard, "ssn") || undefined
    case "firstName2":
      return strField(wizard, "firstName2") || undefined
    case "middleName2":
      return strField(wizard, "middleName2") || undefined
    case "lastName2":
      return strField(wizard, "lastName2") || undefined
    case "fullName2": {
      const name = joinNameParts([
        strField(wizard, "firstName2"),
        strField(wizard, "middleName2"),
        strField(wizard, "lastName2"),
      ])
      return name || undefined
    }
    case "email2":
      return strField(wizard, "email2") || undefined
    case "phone2": {
      const phone = strField(wizard, "phone2")
      return phone ? nationalDigitsFromStoredPhone(phone) : undefined
    }
    case "spouseSsn":
      return strField(wizard, "spouseSsn") || undefined
    case "entitySubType": {
      const sub = strField(wizard, "entitySubType").toLowerCase()
      return (ENTITY_SUBTYPE_LABEL[sub] ?? sub) || undefined
    }
    case "entityLegalName":
      return strField(wizard, "entityLegalName") || undefined
    case "entityJurisdictionOfRegistration":
      return strField(wizard, "entityJurisdictionOfRegistration") || undefined
    case "entityDateFormed":
      return strField(wizard, "entityDateFormed") || undefined
    case "entityOwnedByIra401k":
      return yesNoLabel(strField(wizard, "entityOwnedByIra401k")) || undefined
    case "entityMemberCount":
      return strField(wizard, "entityMemberCount") || undefined
    case "entityDisregarded":
      return yesNoLabel(strField(wizard, "entityDisregarded")) || undefined
    case "entityEin":
      return strField(wizard, "entityEin") || undefined
    case "legalIraName":
      return strField(wizard, "legalIraName") || undefined
    case "iraCompany":
      return strField(wizard, "iraCompany") || undefined
    case "federalTaxClassification": {
      const v = strField(wizard, "federalTaxClassification")
      return (FEDERAL_TAX_CLASSIFICATION_LABEL[v] ?? v) || undefined
    }
    case "iraPartnerEin":
      return strField(wizard, "iraPartnerEin") || undefined
    case "iraCustodianEin":
      return strField(wizard, "iraCustodianEin") || undefined
    case "distributionMethod":
      return distributionMethodLabel(strField(wizard, "distributionMethod")) || undefined
    case "achRoutingNumber":
      return strField(wizard, "achRoutingNumber") || undefined
    case "achAccountNumber":
      return strField(wizard, "achAccountNumber") || undefined
    case "achBankName":
      return strField(wizard, "achBankName") || undefined
    case "achBankAddress":
      return strField(wizard, "achBankAddress") || undefined
    case "achBankAccountType": {
      const v = strField(wizard, "achBankAccountType")
      return (ACH_BANK_ACCOUNT_TYPE_LABEL[v] ?? v) || undefined
    }
    case "checkPayeeName":
      return strField(wizard, "checkPayeeName") || undefined
    case "checkMailingAddress": {
      const id = strField(wizard, "checkMailingAddressId")
      const addr = id ? resolveAddressById(addresses, id) : undefined
      return addr ? formatAddressLine(addr) : undefined
    }
    case "bankAccountQuery":
      return strField(wizard, "bankAccountQuery") || undefined
    case "taxAddress":
      return taxAddr ? formatAddressLine(taxAddr) : undefined
    case "mailingAddress":
      return mailingAddr ? formatAddressLine(mailingAddr) : undefined
    case "beneficiaryFullName":
      return beneficiary?.fullName || undefined
    case "beneficiaryRelationship":
      return beneficiary?.relationship || undefined
    case "beneficiaryEmail":
      return beneficiary?.email || undefined
    case "beneficiaryPhone":
      return beneficiary?.phone
        ? nationalDigitsFromStoredPhone(beneficiary.phone)
        : undefined
    case "beneficiaryTaxId":
      return beneficiary?.taxId || undefined
    case "beneficiaryAddress":
      return beneficiary?.addressQuery || undefined
    default:
      return strField(wizard, key) || undefined
  }
}
