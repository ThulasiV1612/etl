/**
 * Investor data options for sponsors placing e-sign PDF fields.
 * Keep labels aligned with investorQuestionnaireEsignPrefill FIELD_KEY_TO_QUESTION_ID
 * aliases where possible so values auto-populate at send time.
 */
export type EsignInvestorDataField = {
  key: string;
  label: string;
  section: string;
  esignLabel: string;
  signFlowType: "text" | "date";
  /** Optional questionnaire question id used for answer matching. */
  questionId?: string;
};

export const ESIGN_INVESTOR_DATA_FIELDS: EsignInvestorDataField[] = [
  {
    key: "firstName",
    label: "First name",
    section: "Profile details",
    esignLabel: "First Name",
    signFlowType: "text",
    questionId: "first_name",
  },
  {
    key: "lastName",
    label: "Last name",
    section: "Profile details",
    esignLabel: "Last Name",
    signFlowType: "text",
    questionId: "last_name",
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
    questionId: "email",
  },
  {
    key: "phone2",
    label: "Phone",
    section: "Profile details",
    esignLabel: "Telephone",
    signFlowType: "text",
    questionId: "telephone",
  },
  {
    key: "ssn",
    label: "SSN / ITIN",
    section: "Profile details",
    esignLabel: "SSN",
    signFlowType: "text",
    questionId: "social_security_number",
  },
  {
    key: "entityLegalName",
    label: "Legal entity name",
    section: "Profile details",
    esignLabel: "Entity Legal Name",
    signFlowType: "text",
    questionId: "entity_full_legal_name",
  },
  {
    key: "entityEin",
    label: "EIN / Tax ID",
    section: "Profile details",
    esignLabel: "EIN",
    signFlowType: "text",
    questionId: "entity_tax_id",
  },
  {
    key: "entityDateFormed",
    label: "Date formed",
    section: "Profile details",
    esignLabel: "Formation date",
    signFlowType: "date",
    questionId: "entity_formation_date",
  },
  {
    key: "legalIraName",
    label: "Legal IRA name",
    section: "Profile details",
    esignLabel: "IRA Entity Name",
    signFlowType: "text",
    questionId: "ira_entity_name",
  },
  {
    key: "iraCustodianEin",
    label: "IRA custodian EIN",
    section: "Profile details",
    esignLabel: "IRA custodian EIN",
    signFlowType: "text",
    questionId: "ira_entity_custodian_ein",
  },
  {
    key: "iraPartnerEin",
    label: "IRA partner EIN",
    section: "Profile details",
    esignLabel: "IRA partner EIN",
    signFlowType: "text",
    questionId: "ira_entity_partner_ein",
  },
  {
    key: "taxAddress",
    label: "Tax address",
    section: "Address",
    esignLabel: "Address",
    signFlowType: "text",
    questionId: "address",
  },
  {
    key: "mailingAddress",
    label: "Mailing address",
    section: "Address",
    esignLabel: "Mailing Address",
    signFlowType: "text",
    questionId: "mailing_address",
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
];

export function getEsignInvestorDataField(
  key: string,
): EsignInvestorDataField | undefined {
  return ESIGN_INVESTOR_DATA_FIELDS.find((f) => f.key === key.trim());
}

/** Answer-map key used by e-sign prefill for a catalog field. */
export function esignInvestorDataAnswerKey(field: EsignInvestorDataField): string {
  return field.questionId?.trim() || field.key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

export function normalizeEsignFieldLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/** Map normalized esign label → profile field key for direct profile prefill. */
export const ESIGN_LABEL_TO_PROFILE_KEY: Record<string, string> = Object.fromEntries(
  ESIGN_INVESTOR_DATA_FIELDS.map((f) => [
    normalizeEsignFieldLabel(f.esignLabel),
    f.key,
  ]),
);
