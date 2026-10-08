/**
 * Investor data options for sponsors placing e-sign PDF fields.
 * `esignLabel` is the SignFlow field label used for auto-prefill at send time.
 */
export type EsignInvestorDataField = {
  key: string
  label: string
  section: string
  /** Exact label written onto the SignFlow PDF field. */
  esignLabel: string
  signFlowType: "text" | "date"
}

export const ESIGN_INVESTOR_DATA_FIELDS: EsignInvestorDataField[] = [
  {
    key: "firstName",
    label: "First name",
    section: "Profile details",
    esignLabel: "First Name",
    signFlowType: "text",
  },
  {
    key: "lastName",
    label: "Last name",
    section: "Profile details",
    esignLabel: "Last Name",
    signFlowType: "text",
  },
  {
    key: "fullName",
    label: "Full name",
    section: "Profile details",
    esignLabel: "Print Name",
    signFlowType: "text",
  },
  {
    key: "email1",
    label: "Email",
    section: "Profile details",
    esignLabel: "Email",
    signFlowType: "text",
  },
  {
    key: "phone2",
    label: "Phone",
    section: "Profile details",
    esignLabel: "Telephone",
    signFlowType: "text",
  },
  {
    key: "ssn",
    label: "SSN / ITIN",
    section: "Profile details",
    esignLabel: "SSN",
    signFlowType: "text",
  },
  {
    key: "entityLegalName",
    label: "Legal entity name",
    section: "Profile details",
    esignLabel: "Entity Legal Name",
    signFlowType: "text",
  },
  {
    key: "entityEin",
    label: "EIN / Tax ID",
    section: "Profile details",
    esignLabel: "EIN",
    signFlowType: "text",
  },
  {
    key: "entityDateFormed",
    label: "Date formed",
    section: "Profile details",
    esignLabel: "Formation date",
    signFlowType: "date",
  },
  {
    key: "legalIraName",
    label: "Legal IRA name",
    section: "Profile details",
    esignLabel: "IRA Entity Name",
    signFlowType: "text",
  },
  {
    key: "iraCustodianEin",
    label: "IRA custodian EIN",
    section: "Profile details",
    esignLabel: "IRA custodian EIN",
    signFlowType: "text",
  },
  {
    key: "iraPartnerEin",
    label: "IRA partner EIN",
    section: "Profile details",
    esignLabel: "IRA partner EIN",
    signFlowType: "text",
  },
  {
    key: "taxAddress",
    label: "Tax address",
    section: "Address",
    esignLabel: "Address",
    signFlowType: "text",
  },
  {
    key: "mailingAddress",
    label: "Mailing address",
    section: "Address",
    esignLabel: "Mailing Address",
    signFlowType: "text",
  },
  {
    key: "achRoutingNumber",
    label: "ACH routing number",
    section: "Distributions",
    esignLabel: "ACH Routing Number",
    signFlowType: "text",
  },
  {
    key: "achAccountNumber",
    label: "ACH account number",
    section: "Distributions",
    esignLabel: "ACH Account Number",
    signFlowType: "text",
  },
  {
    key: "achBankName",
    label: "Bank name",
    section: "Distributions",
    esignLabel: "Bank Name",
    signFlowType: "text",
  },
  {
    key: "checkPayeeName",
    label: "Check payee name",
    section: "Distributions",
    esignLabel: "Check Payee Name",
    signFlowType: "text",
  },
  {
    key: "beneficiaryFullName",
    label: "Beneficiary name",
    section: "Beneficiary",
    esignLabel: "Beneficiary Name",
    signFlowType: "text",
  },
]

export function getEsignInvestorDataField(
  key: string,
): EsignInvestorDataField | undefined {
  return ESIGN_INVESTOR_DATA_FIELDS.find((f) => f.key === key)
}

export function groupEsignInvestorDataFields(
  fields: EsignInvestorDataField[] = ESIGN_INVESTOR_DATA_FIELDS,
): { section: string; fields: EsignInvestorDataField[] }[] {
  const order: string[] = []
  const bySection = new Map<string, EsignInvestorDataField[]>()
  for (const field of fields) {
    if (!bySection.has(field.section)) {
      bySection.set(field.section, [])
      order.push(field.section)
    }
    bySection.get(field.section)!.push(field)
  }
  return order.map((section) => ({
    section,
    fields: bySection.get(section) ?? [],
  }))
}
