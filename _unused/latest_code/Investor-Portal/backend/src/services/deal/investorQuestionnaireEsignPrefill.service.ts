import type { SignFlowField } from "../esign/signflow.service.js";
import { formatEinDisplay, nineDigitsFromEinInput } from "../../common/tax/usEin.js";
import {
  formatSsnItinDisplay,
  isSsnItinFieldKey,
  maskSsnItinLast4,
} from "../../common/tax/usSsnItin.js";
import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import type {
  InvestorQuestionnaireJson,
  InvestorQuestionnaireQuestion,
} from "./dealInvestorQuestionnaire.service.js";
import type { InvestorQuestionnaireAnswersMap } from "./investorQuestionnaireAnswers.service.js";
import {
  ESIGN_LABEL_TO_PROFILE_KEY,
  esignInvestorDataAnswerKey,
  getEsignInvestorDataField,
  normalizeEsignFieldLabel,
} from "./esignInvestorDataFieldCatalog.js";
import type { DropboxSignFormFieldPerDocument } from "../esign/dropboxSign.service.js";
import type { DropboxSignPrefillCustomField } from "../esign/dropboxSign.service.js";

function normalizeFieldKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/** Dropbox field labels / api ids that receive a computed full name. */
const COMPUTED_FULL_NAME_FIELD_KEYS = new Set(
  [
    "print name",
    "fullname1",
    "full name",
    "investor name",
    "name",
    "subscriber name",
    "signer name",
  ].map((s) => normalizeFieldKey(s)),
);

const COMPUTED_DATE_FIELD_KEYS = new Set(
  ["date", "datesigned1", "date signed", "signed date"].map((s) =>
    normalizeFieldKey(s),
  ),
);

const COMPUTED_TITLE_FIELD_KEYS = new Set(
  [
    "print title (if applicable)",
    "print title",
    "title1",
    "title",
    "authorized title",
  ].map((s) => normalizeFieldKey(s)),
);

/**
 * Extra aliases for sponsor-placed fields whose label does not match question id.
 * Keys are normalized field keys; values are questionnaire question ids.
 */
const FIELD_KEY_TO_QUESTION_ID: Record<string, string> = {
  [normalizeFieldKey("First Name")]: "first_name",
  [normalizeFieldKey("Last Name")]: "last_name",
  [normalizeFieldKey("Telephone")]: "telephone",
  [normalizeFieldKey("Phone")]: "telephone",
  [normalizeFieldKey("Phone Number")]: "telephone",
  [normalizeFieldKey("Address")]: "address",
  [normalizeFieldKey("Mailing Address")]: "mailing_address",
  [normalizeFieldKey("Home Address")]: "address",
  [normalizeFieldKey("Residential Address")]: "address",
  [normalizeFieldKey("Investor Address")]: "address",
  [normalizeFieldKey("Subscriber Address")]: "address",
  [normalizeFieldKey("Tax Address")]: "address",
  [normalizeFieldKey("Street Address")]: "address",
  [normalizeFieldKey("Street")]: "street_line",
  [normalizeFieldKey("Street Line")]: "street_line",
  [normalizeFieldKey("Address Line 1")]: "street_line",
  [normalizeFieldKey("Address Line 2")]: "street_line_2",
  [normalizeFieldKey("City")]: "city",
  [normalizeFieldKey("State")]: "state",
  [normalizeFieldKey("Zip")]: "zip",
  [normalizeFieldKey("Zip Code")]: "zip",
  [normalizeFieldKey("ZIP")]: "zip",
  [normalizeFieldKey("ZIP Code")]: "zip",
  [normalizeFieldKey("City State Zip")]: "city_state_zip",
  [normalizeFieldKey("City, State, Zip")]: "city_state_zip",
  [normalizeFieldKey("City State ZIP")]: "city_state_zip",
  [normalizeFieldKey("SSN")]: "social_security_number",
  [normalizeFieldKey("TIN")]: "social_security_number",
  [normalizeFieldKey("Social Security Number")]: "social_security_number",
  [normalizeFieldKey("Birth Date")]: "birth_date",
  [normalizeFieldKey("Date of Birth")]: "birth_date",
  [normalizeFieldKey("Entity Legal Name")]: "entity_full_legal_name",
  [normalizeFieldKey("Entity Name")]: "entity_full_legal_name",
  [normalizeFieldKey("Full legal name of entity")]: "entity_full_legal_name",
  [normalizeFieldKey("Office address")]: "entity_office_address",
  [normalizeFieldKey("Entity Office Address")]: "entity_office_address",
  [normalizeFieldKey("Office Address")]: "entity_office_address",
  [normalizeFieldKey("Business Address")]: "entity_office_address",
  [normalizeFieldKey("IRA entity office address")]: "ira_entity_office_address",
  [normalizeFieldKey("IRA Entity Office Address")]: "ira_entity_office_address",
  [normalizeFieldKey("IRA Office Address")]: "ira_entity_office_address",
  [normalizeFieldKey("Relationship Address")]: "relationship_address",
  [normalizeFieldKey("Consultant Address")]: "relationship_address",
  [normalizeFieldKey("Business phone number")]: "entity_business_phone",
  [normalizeFieldKey("Business Phone")]: "entity_business_phone",
  [normalizeFieldKey("Formation date")]: "entity_formation_date",
  [normalizeFieldKey("Jurisdiction country")]: "entity_jurisdiction_country",
  [normalizeFieldKey("Jurisdiction state")]: "entity_jurisdiction_state",
  [normalizeFieldKey("Tax identification number")]: "entity_tax_id",
  [normalizeFieldKey("EIN")]: "entity_tax_id",
  [normalizeFieldKey("Authorized individual name")]: "entity_authorized_name",
  [normalizeFieldKey("Authorized individual title")]: "entity_authorized_title",
  [normalizeFieldKey("IRA entity name")]: "ira_entity_name",
  [normalizeFieldKey("IRA Entity Name")]: "ira_entity_name",
  [normalizeFieldKey("IRA custodian EIN")]: "ira_entity_custodian_ein",
  [normalizeFieldKey("IRA partner EIN")]: "ira_entity_partner_ein",
  [normalizeFieldKey("IRA account holder's name")]: "ira_entity_account_holder_name",
  [normalizeFieldKey("IRA account holder's title")]: "ira_entity_account_holder_title",
  [normalizeFieldKey("Incorporation country")]: "ira_entity_incorporation_country",
  [normalizeFieldKey("Incorporation state")]: "ira_entity_incorporation_state",
  [normalizeFieldKey("Email")]: "email",
  [normalizeFieldKey("Email Address")]: "email",
  [normalizeFieldKey("Investment Amount")]: "investment_amount",
  [normalizeFieldKey("Commitment Amount")]: "investment_amount",
  [normalizeFieldKey("Amount")]: "investment_amount",
  [normalizeFieldKey("ACH Routing Number")]: "ach_routing_number",
  [normalizeFieldKey("ACH Account Number")]: "ach_account_number",
  [normalizeFieldKey("Bank Name")]: "ach_bank_name",
  [normalizeFieldKey("Check Payee Name")]: "check_payee_name",
  [normalizeFieldKey("Beneficiary Name")]: "beneficiary_full_name",
};

export type EsignQuestionnairePrefillContext = {
  memberDisplayName?: string;
  memberEmail?: string;
  investmentAmount?: string;
  addressLine?: string;
  mailingAddressLine?: string;
  streetLine?: string;
  streetLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  cityStateZip?: string;
};

function isSsnQuestionnaireQuestion(
  question: Pick<
    InvestorQuestionnaireQuestion,
    "id" | "fieldType" | "label" | "investorProfileFieldKey"
  >,
): boolean {
  if (question.fieldType === "ssn") return true;
  if (isSsnItinFieldKey(question.id)) return true;
  if (isSsnItinFieldKey(question.label)) return true;
  if (isSsnItinFieldKey(question.investorProfileFieldKey ?? "")) return true;
  return false;
}

function formatSsnForEsign(raw: string, maskSsn: boolean): string {
  return maskSsn ? maskSsnItinLast4(raw) : formatSsnItinDisplay(raw);
}

function formatAnswerForEsign(
  question: InvestorQuestionnaireQuestion,
  raw: string | undefined,
  maskSsn: boolean,
): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  if (question.fieldType === "boolean") {
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
    return value;
  }

  if (question.fieldType === "checkboxes") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        const items = parsed.filter((v): v is string => typeof v === "string");
        return items.join(", ");
      }
    } catch {
      /* use raw */
    }
    return value;
  }

  if (question.fieldType === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return value;
  }

  if (isSsnQuestionnaireQuestion(question)) {
    return formatSsnForEsign(value, maskSsn);
  }

  if (
    question.fieldType === "ein" ||
    question.id === "ira_entity_custodian_ein" ||
    question.id === "ira_entity_partner_ein"
  ) {
    const digits = nineDigitsFromEinInput(value);
    if (digits.length === 9) return formatEinDisplay(digits);
    return value;
  }

  if (question.fieldType === "date") {
    const formatted = formatDdMmmYyyy(value);
    return formatted === "—" ? value : formatted;
  }

  return value.replace(/\s+/g, " ").trim();
}

function formatLooseAnswerForEsign(
  answerKey: string,
  raw: string,
  maskSsn: boolean,
): string {
  const value = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "";
  if (isSsnItinFieldKey(answerKey)) return formatSsnForEsign(value, maskSsn);
  return value;
}

function buildFormattedAnswerMap(
  config: InvestorQuestionnaireJson,
  answers: InvestorQuestionnaireAnswersMap,
  maskSsn: boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  const questionById = new Map(
    config.questions.map((q) => [q.id.trim(), q] as const),
  );

  for (const question of config.questions) {
    const id = question.id.trim();
    if (!id) continue;
    const formatted = formatAnswerForEsign(question, answers[id], maskSsn);
    if (!formatted) continue;
    out.set(id, formatted);
    const labelKey = normalizeFieldKey(question.label);
    if (labelKey) out.set(labelKey, formatted);
    const idAsLabelKey = normalizeFieldKey(id);
    if (idAsLabelKey) out.set(idAsLabelKey, formatted);
    // Also index under profile key (e.g. "ssn") so catalog dataKey lookups work.
    const profileKey = String(question.investorProfileFieldKey ?? "").trim();
    if (profileKey) {
      out.set(profileKey, formatted);
      const profileAsLabel = normalizeFieldKey(profileKey);
      if (profileAsLabel) out.set(profileAsLabel, formatted);
    }
  }

  // Include profile/e-sign-only answers (ACH, beneficiary, mailing, etc.) that are
  // not questionnaire questions — sponsors place these as PDF field labels.
  for (const [rawId, rawValue] of Object.entries(answers)) {
    const id = rawId.trim();
    if (!id || out.has(id)) continue;
    const question = questionById.get(id);
    const formatted = question
      ? formatAnswerForEsign(question, rawValue, maskSsn)
      : formatLooseAnswerForEsign(id, String(rawValue ?? ""), maskSsn);
    if (!formatted) continue;
    out.set(id, formatted);
    const idAsLabelKey = normalizeFieldKey(id);
    if (idAsLabelKey) out.set(idAsLabelKey, formatted);
  }

  return out;
}

/** Mask SSN values on placed SignFlow / e-sign fields (prefill + post-Python). */
export function maskSsnValuesOnSignFlowFields(
  fields: SignFlowField[],
): SignFlowField[] {
  return fields.map((field) => {
    const value = String(field.value ?? "").trim();
    if (!value) return field;
    const shouldMask =
      isSsnItinFieldKey(field.dataKey ?? "") ||
      isSsnItinFieldKey(field.label ?? "");
    if (!shouldMask) return field;
    return { ...field, value: maskSsnItinLast4(value) };
  });
}

/** Mask SSN entries in a questionnaire answers map before document merge / Python. */
export function maskSsnInQuestionnaireAnswers(
  answers: InvestorQuestionnaireAnswersMap,
  config?: InvestorQuestionnaireJson | null,
): InvestorQuestionnaireAnswersMap {
  const questionById = new Map(
    (config?.questions ?? []).map((q) => [q.id.trim(), q] as const),
  );
  const out: InvestorQuestionnaireAnswersMap = {};
  for (const [key, raw] of Object.entries(answers)) {
    const value = String(raw ?? "").trim();
    if (!value) {
      out[key] = raw;
      continue;
    }
    const question = questionById.get(key.trim());
    if (
      (question && isSsnQuestionnaireQuestion(question)) ||
      isSsnItinFieldKey(key)
    ) {
      out[key] = maskSsnItinLast4(value);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

function resolveFullName(
  formatted: Map<string, string>,
  memberDisplayName?: string,
): string {
  const fromParts = [formatted.get("first_name"), formatted.get("last_name")]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromParts) return fromParts;
  return String(memberDisplayName ?? "").trim();
}

function resolvePrintTitle(formatted: Map<string, string>): string {
  return (
    formatted.get("entity_authorized_title") ??
    formatted.get("ira_entity_account_holder_title") ??
    ""
  ).trim();
}

function resolveSigningDate(): string {
  return formatDdMmmYyyy(new Date());
}

function resolveAddressFromContext(
  questionId: string,
  prefillContext?: EsignQuestionnairePrefillContext,
): string {
  if (!prefillContext) return "";
  switch (questionId) {
    case "address":
    case "entity_office_address":
    case "ira_entity_office_address":
      return prefillContext.addressLine?.trim() ?? "";
    case "mailing_address":
    case "relationship_address":
      return (
        prefillContext.mailingAddressLine?.trim() ||
        prefillContext.addressLine?.trim() ||
        ""
      );
    case "street_line":
      return prefillContext.streetLine?.trim() ?? "";
    case "street_line_2":
      return prefillContext.streetLine2?.trim() ?? "";
    case "city":
      return prefillContext.city?.trim() ?? "";
    case "state":
      return prefillContext.state?.trim() ?? "";
    case "zip":
      return prefillContext.zip?.trim() ?? "";
    case "city_state_zip":
      return prefillContext.cityStateZip?.trim() ?? "";
    default:
      return "";
  }
}

function resolveValueForFieldKey(
  fieldKey: string,
  formatted: Map<string, string>,
  prefillContext?: EsignQuestionnairePrefillContext,
): string {
  if (COMPUTED_FULL_NAME_FIELD_KEYS.has(fieldKey)) {
    return resolveFullName(formatted, prefillContext?.memberDisplayName);
  }

  if (COMPUTED_TITLE_FIELD_KEYS.has(fieldKey)) {
    return resolvePrintTitle(formatted);
  }

  if (COMPUTED_DATE_FIELD_KEYS.has(fieldKey)) {
    return resolveSigningDate();
  }

  if (formatted.has(fieldKey)) {
    return formatted.get(fieldKey) ?? "";
  }

  const questionId =
    FIELD_KEY_TO_QUESTION_ID[fieldKey] ?? fieldKey.replace(/\s+/g, "_");
  if (formatted.has(questionId)) {
    return formatted.get(questionId) ?? "";
  }

  if (questionId === "email") {
    const email = prefillContext?.memberEmail?.trim();
    if (email) return email;
  }

  if (questionId === "investment_amount") {
    const amt = prefillContext?.investmentAmount?.trim();
    if (amt) return amt;
  }

  if (questionId === "mailing_address") {
    const mailing =
      prefillContext?.mailingAddressLine?.trim() ||
      prefillContext?.addressLine?.trim() ||
      "";
    if (mailing) return mailing;
  }

  const fromAddressContext = resolveAddressFromContext(questionId, prefillContext);
  if (fromAddressContext) return fromAddressContext;

  for (const [qid, value] of formatted.entries()) {
    if (normalizeFieldKey(qid) === fieldKey) return value;
  }

  return "";
}

function customFieldNameForFormField(
  field: DropboxSignFormFieldPerDocument,
): string {
  const name = String(field.name ?? "").trim();
  if (name) return name;
  return String(field.apiId ?? "").trim();
}

export type QuestionnaireEsignPrefillResult = {
  formFields: DropboxSignFormFieldPerDocument[];
  customFields: DropboxSignPrefillCustomField[];
};

/**
 * Matches Dropbox Sign template / questionnaire signature fields to questionnaire
 * answers and returns merge-field custom_field values for embedded signing.
 */
export function applyQuestionnairePrefillToEsignFormFields({
  formFields,
  config,
  answers,
  memberDisplayName,
  prefillContext,
}: {
  formFields: DropboxSignFormFieldPerDocument[];
  config: InvestorQuestionnaireJson;
  answers: InvestorQuestionnaireAnswersMap;
  memberDisplayName?: string;
  prefillContext?: EsignQuestionnairePrefillContext;
}): QuestionnaireEsignPrefillResult {
  const ctx: EsignQuestionnairePrefillContext = {
    ...prefillContext,
    memberDisplayName:
      prefillContext?.memberDisplayName?.trim() || memberDisplayName?.trim(),
    memberEmail: prefillContext?.memberEmail?.trim(),
    investmentAmount: prefillContext?.investmentAmount?.trim(),
  };

  // Dropbox merge fields land on the shared PDF — always mask SSN for sponsors.
  const formatted = buildFormattedAnswerMap(config, answers, true);
  if (
    !formatted.size &&
    !ctx.memberDisplayName &&
    !ctx.memberEmail &&
    !ctx.investmentAmount &&
    !ctx.addressLine &&
    !ctx.mailingAddressLine
  ) {
    return { formFields, customFields: [] };
  }

  const customFields: DropboxSignPrefillCustomField[] = [];
  const seenNames = new Set<string>();

  const nextFields = formFields.map((field) => {
    if (field.type !== "text" && field.type !== "text-merge") {
      return field;
    }

    const fieldName = customFieldNameForFormField(field);
    if (!fieldName) return field;

    const fieldKey = normalizeFieldKey(fieldName);
    const apiKey = normalizeFieldKey(field.apiId);
    const value =
      resolveValueForFieldKey(fieldKey, formatted, ctx) ||
      resolveValueForFieldKey(apiKey, formatted, ctx);
    if (!value) return field;

    const customName = fieldName;
    if (!seenNames.has(customName.toLowerCase())) {
      seenNames.add(customName.toLowerCase());
      const maskedValue =
        isSsnItinFieldKey(customName) || isSsnItinFieldKey(field.apiId ?? "")
          ? maskSsnItinLast4(value)
          : value;
      customFields.push({ name: customName, value: maskedValue });
    }

    return { ...field, type: "text-merge" as const };
  });

  return { formFields: nextFields, customFields };
}

function signFlowFieldPrefillType(type: string): boolean {
  const t = String(type ?? "").trim().toLowerCase();
  return t === "text" || t === "date" || t === "date_signed";
}

/**
 * Pre-fills SignFlow text/date fields on the questionnaire signature page (and
 * other investor fields whose labels match questionnaire answers).
 *
 * SSN values are masked to last-4 by default so sponsors viewing investor eSign
 * documents never see the full number. Pass `maskSsn: false` only for
 * non-document surfaces that are investor-private.
 */
export function applyQuestionnairePrefillToSignFlowFields({
  fields,
  config,
  answers,
  memberDisplayName,
  prefillContext,
  maskSsn = true,
}: {
  fields: SignFlowField[];
  config: InvestorQuestionnaireJson;
  answers: InvestorQuestionnaireAnswersMap;
  memberDisplayName?: string;
  prefillContext?: EsignQuestionnairePrefillContext;
  /** Default true — mask SSN for sponsor-visible fills. Pass false for investor edit. */
  maskSsn?: boolean;
}): SignFlowField[] {
  const ctx: EsignQuestionnairePrefillContext = {
    ...prefillContext,
    memberDisplayName:
      prefillContext?.memberDisplayName?.trim() || memberDisplayName?.trim(),
    memberEmail: prefillContext?.memberEmail?.trim(),
    investmentAmount: prefillContext?.investmentAmount?.trim(),
  };

  const formatted = buildFormattedAnswerMap(config, answers, maskSsn);

  const nextFields = fields.map((field) => {
    if (!signFlowFieldPrefillType(field.type)) return field;

    const catalogKey =
      field.dataKey?.trim() ||
      ESIGN_LABEL_TO_PROFILE_KEY[
        normalizeEsignFieldLabel(String(field.label ?? ""))
      ];
    if (catalogKey) {
      const catalog = getEsignInvestorDataField(catalogKey);
      if (catalog) {
        const answerKey = esignInvestorDataAnswerKey(catalog);
        const fromAnswerKey =
          formatted.get(answerKey) ||
          formatted.get(normalizeFieldKey(answerKey)) ||
          formatted.get(catalog.key) ||
          "";
        if (fromAnswerKey.trim()) {
          return { ...field, dataKey: catalog.key, value: fromAnswerKey.trim() };
        }
        const viaLabel = resolveValueForFieldKey(
          normalizeFieldKey(catalog.esignLabel),
          formatted,
          ctx,
        );
        if (viaLabel.trim()) {
          return { ...field, dataKey: catalog.key, value: viaLabel.trim() };
        }
      }
    }

    const fieldKey = normalizeFieldKey(field.label);
    const value = resolveValueForFieldKey(fieldKey, formatted, ctx);
    if (!value) return field;

    return { ...field, value };
  });

  // Only force-mask after fill when sponsor/document mode is requested.
  return maskSsn ? maskSsnValuesOnSignFlowFields(nextFields) : nextFields;
}
