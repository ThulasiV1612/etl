import type { InvestorQuestionnaireAnswersMap } from "./investorQuestionnaireAnswers.service.js";
import {
  getProfileBookForUser,
  type ProfileBookSnapshot,
} from "../investing/investingProfileBook.service.js";
import { and, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import type { InvestorEsignRowTarget } from "./dealMemberEsignStatus.service.js";
import {
  normalizeInvestorQuestionnaireAnswersInput,
  readInvestorQuestionnaireAnswersForTarget,
} from "./investorQuestionnaireAnswers.service.js";
import {
  addressPrefillPartsFromProfileBook,
  addressPrefillPartsFromW9,
  mergeAddressIntoQuestionnaireAnswers,
  type EsignAddressPrefillParts,
} from "./investorEsignAddressPrefill.service.js";
import {
  normalizeInvestorW9FormInput,
  readInvestorW9FormForTarget,
} from "./investorW9Form.service.js";
import { resolveInvestorProfileFieldValue } from "./investorProfileFieldPrefill.service.js";
import {
  getDealInvestorQuestionnaireState,
  type InvestorQuestionnaireQuestion,
} from "./dealInvestorQuestionnaire.service.js";
import {
  ESIGN_INVESTOR_DATA_FIELDS,
  esignInvestorDataAnswerKey,
} from "./esignInvestorDataFieldCatalog.js";

const ENTITY_SUBTYPE_TO_OWNERSHIP: Record<string, string> = {
  llc: "LLC",
  corporation: "Corporation",
  partnership: "Partnership",
  trust: "Trust",
};

const ENTITY_SUBTYPE_LABEL: Record<string, string> = {
  ira: "IRA",
  "401k": "401(k)",
};

type SavedAddress = ProfileBookSnapshot["addresses"][0];

function strField(wizard: Record<string, unknown> | null, key: string): string {
  if (!wizard) return "";
  return String(wizard[key] ?? "").trim();
}

function joinNameParts(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}

function formatAddressLine(addr: SavedAddress): string {
  const street = [addr.street1, addr.street2].map((s) => String(s ?? "").trim()).filter(Boolean).join(", ");
  const loc = [addr.city, addr.state, addr.zip]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return [street, loc].filter(Boolean).join(", ");
}

function readWizardState(
  profile: ProfileBookSnapshot["profiles"][0],
): Record<string, unknown> | null {
  const raw = profile.profileWizardState;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function resolveAddressById(
  addresses: SavedAddress[],
  id: string,
): SavedAddress | undefined {
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  return addresses.find((a) => a.id === trimmed);
}

function resolveTaxAddress(
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
): SavedAddress | undefined {
  const taxId = strField(wizard, "taxAddressId");
  if (taxId) {
    const match = resolveAddressById(addresses, taxId);
    if (match) return match;
  }
  return addresses[0];
}

function resolveMailingAddress(
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
  taxAddress?: SavedAddress,
): SavedAddress | undefined {
  const mailingId = strField(wizard, "mailingAddressId");
  if (mailingId) {
    const match = resolveAddressById(addresses, mailingId);
    if (match) return match;
  }
  return taxAddress;
}

function nationalDigitsFromPhone(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 10);
}

function resolveTelephone(wizard: Record<string, unknown> | null): string {
  return nationalDigitsFromPhone(strField(wizard, "phone2"));
}

function parseJurisdiction(raw: string): { country: string; state: string } {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      country: parts[0] ?? "",
      state: parts[parts.length - 1] ?? "",
    };
  }
  if (parts.length === 1) {
    return { country: "United States", state: parts[0] ?? "" };
  }
  return { country: "", state: "" };
}

function readBeneficiaryFullName(
  wizard: Record<string, unknown> | null,
): string {
  if (!wizard) return "";
  const raw = wizard.beneficiary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  return String((raw as Record<string, unknown>).fullName ?? "").trim();
}

function entityTypeOwnershipFromWizard(
  wizard: Record<string, unknown> | null,
): { ownership: string; ownershipOther: string } {
  const sub = strField(wizard, "entitySubType").toLowerCase();
  if (!sub) return { ownership: "", ownershipOther: "" };
  const mapped = ENTITY_SUBTYPE_TO_OWNERSHIP[sub];
  if (mapped) return { ownership: mapped, ownershipOther: "" };
  const label = ENTITY_SUBTYPE_LABEL[sub] ?? sub;
  return { ownership: "Other", ownershipOther: label };
}

function isUsAddress(addr?: SavedAddress): boolean {
  if (!addr) return false;
  const country = String(addr.country ?? "").trim().toLowerCase();
  if (
    !country ||
    country === "us" ||
    country === "usa" ||
    country.includes("united states")
  ) {
    return true;
  }
  return false;
}

function ssnFromProfiles(
  profiles: ProfileBookSnapshot["profiles"],
): string {
  const ordered = [...profiles]
    .filter((p) => !p.archived)
    .sort(
      (a, b) =>
        Date.parse(a.dateCreated) - Date.parse(b.dateCreated),
    );
  for (const profile of ordered) {
    const wizard = readWizardState(profile);
    const ssn = strField(wizard, "ssn");
    if (ssn) return ssn;
  }
  return "";
}

type QuestionnairePrefillContext = {
  firstName: string;
  lastName: string;
  fullName: string;
  telephone: string;
  addressLine: string;
  mailingAddressLine: string;
  ssn: string;
  entityLegalName: string;
  entityEin: string;
  entityDateFormed: string;
  entityJurisdictionCountry: string;
  entityJurisdictionState: string;
  entityBusinessPhone: string;
  authorizedName: string;
  beneficialOwners: string;
  legalIraName: string;
  iraCompany: string;
  iraCustodianEin: string;
  iraPartnerEin: string;
  entityTypeOwnership: string;
  entityTypeOwnershipOther: string;
  relationshipAddress: string;
  usTaxResident: string;
};

function buildPrefillContext(
  wizard: Record<string, unknown> | null,
  addresses: SavedAddress[],
  profiles: ProfileBookSnapshot["profiles"],
): QuestionnairePrefillContext {
  const firstName = strField(wizard, "firstName");
  const middleName = strField(wizard, "middleName");
  const lastName = strField(wizard, "lastName");
  const fullName = joinNameParts([firstName, middleName, lastName]);

  const taxAddr = resolveTaxAddress(wizard, addresses);
  const mailingAddr = resolveMailingAddress(wizard, addresses, taxAddr);
  const addressLine = taxAddr ? formatAddressLine(taxAddr) : "";
  const mailingAddressLine = mailingAddr ? formatAddressLine(mailingAddr) : "";

  const jurisdiction = parseJurisdiction(
    strField(wizard, "entityJurisdictionOfRegistration"),
  );
  const { ownership, ownershipOther } = entityTypeOwnershipFromWizard(wizard);

  const custodianIra = strField(wizard, "custodianIra").toLowerCase();
  const legalIraName =
    custodianIra === "yes"
      ? strField(wizard, "legalIraName")
      : strField(wizard, "entityLegalName");

  return {
    firstName,
    lastName,
    fullName,
    telephone: resolveTelephone(wizard),
    addressLine,
    mailingAddressLine,
    ssn: ssnFromProfiles(profiles),
    entityLegalName: strField(wizard, "entityLegalName"),
    entityEin: strField(wizard, "entityEin"),
    entityDateFormed: strField(wizard, "entityDateFormed"),
    entityJurisdictionCountry: jurisdiction.country,
    entityJurisdictionState: jurisdiction.state,
    entityBusinessPhone: resolveTelephone(wizard),
    authorizedName: fullName,
    beneficialOwners: readBeneficiaryFullName(wizard),
    legalIraName,
    iraCompany: strField(wizard, "iraCompany"),
    iraCustodianEin: strField(wizard, "iraCustodianEin"),
    iraPartnerEin: strField(wizard, "iraPartnerEin"),
    entityTypeOwnership: ownership,
    entityTypeOwnershipOther: ownershipOther,
    relationshipAddress: mailingAddressLine || addressLine,
    usTaxResident: isUsAddress(taxAddr) ? "yes" : "",
  };
}

function resolveQuestionnairePrefillValue(
  questionId: string,
  ctx: QuestionnairePrefillContext,
): string | undefined {
  switch (questionId) {
    case "first_name":
      return ctx.firstName || undefined;
    case "last_name":
      return ctx.lastName || undefined;
    case "telephone":
      return ctx.telephone || undefined;
    case "address":
      return ctx.addressLine || undefined;
    case "social_security_number":
      return ctx.ssn || undefined;
    case "us_tax_resident":
      return ctx.usTaxResident || undefined;
    case "entity_full_legal_name":
      return ctx.entityLegalName || ctx.legalIraName || undefined;
    case "entity_office_address":
      return ctx.addressLine || undefined;
    case "entity_business_phone":
      return ctx.entityBusinessPhone || undefined;
    case "entity_formation_date":
      return ctx.entityDateFormed || undefined;
    case "entity_jurisdiction_country":
      return ctx.entityJurisdictionCountry || undefined;
    case "entity_jurisdiction_state":
      return ctx.entityJurisdictionState || undefined;
    case "entity_tax_id":
      return ctx.entityEin || undefined;
    case "entity_authorized_name":
      return ctx.authorizedName || undefined;
    case "entity_beneficial_owners":
      return ctx.beneficialOwners || undefined;
    case "ira_entity_name":
      return ctx.legalIraName || ctx.entityLegalName || undefined;
    case "ira_entity_office_address":
      return ctx.addressLine || undefined;
    case "ira_entity_business_phone":
      return ctx.entityBusinessPhone || undefined;
    case "ira_entity_incorporation_country":
      return ctx.entityJurisdictionCountry || undefined;
    case "ira_entity_incorporation_state":
      return ctx.entityJurisdictionState || undefined;
    case "ira_entity_custodian_ein":
      return ctx.iraCustodianEin || undefined;
    case "ira_entity_partner_ein":
      return ctx.iraPartnerEin || undefined;
    case "ira_entity_account_holder_name":
      return ctx.authorizedName || undefined;
    case "relationship_address":
      return ctx.relationshipAddress || undefined;
    case "entity_type_ownership":
      return ctx.entityTypeOwnership || undefined;
    case "entity_type_ownership_other":
      return ctx.entityTypeOwnershipOther || undefined;
    default:
      return undefined;
  }
}

/** Build questionnaire answers from a saved investing profile book row. */
export function buildQuestionnairePrefillFromProfileBook(
  profileBook: ProfileBookSnapshot,
  userInvestorProfileId: string,
  questions?: Pick<
    InvestorQuestionnaireQuestion,
    "id" | "investorProfileFieldKey"
  >[],
): InvestorQuestionnaireAnswersMap {
  const profileId = userInvestorProfileId.trim();
  if (!profileId) return {};

  const profile = profileBook.profiles.find((p) => p.id === profileId);
  if (!profile || profile.archived) return {};

  const wizard = readWizardState(profile);
  const ctx = buildPrefillContext(
    wizard,
    profileBook.addresses,
    profileBook.profiles,
  );

  const out: InvestorQuestionnaireAnswersMap = {};

  if (questions?.length) {
    for (const question of questions) {
      const byId = resolveQuestionnairePrefillValue(question.id, ctx);
      const value =
        byId ??
        (question.investorProfileFieldKey
          ? resolveInvestorProfileFieldValue(
              question.investorProfileFieldKey,
              wizard,
              profileBook.addresses,
            )
          : undefined);
      if (value) out[question.id] = value;
    }
  } else {
    const questionIds = [
      "first_name",
      "last_name",
      "telephone",
      "address",
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
    ];

    for (const id of questionIds) {
      const value = resolveQuestionnairePrefillValue(id, ctx);
      if (value) out[id] = value;
    }
  }

  // Always enrich e-sign PDF field labels (ACH, beneficiary, mailing, etc.).
  // Must run even when a deal questionnaire exists — those questions early-path
  // only cover questionnaire ids, not sponsor-placed PDF data fields.
  for (const field of ESIGN_INVESTOR_DATA_FIELDS) {
    const answerKey = esignInvestorDataAnswerKey(field);
    if (out[answerKey]?.trim()) continue;
    const value = resolveInvestorProfileFieldValue(
      field.key,
      wizard,
      profileBook.addresses,
    );
    if (value) out[answerKey] = value;
  }

  return out;
}

/** Merge profile prefill into existing answers without overwriting non-empty values. */
export function mergeQuestionnaireAnswersWithProfilePrefill(
  current: InvestorQuestionnaireAnswersMap | null | undefined,
  prefill: InvestorQuestionnaireAnswersMap,
): InvestorQuestionnaireAnswersMap {
  const next: InvestorQuestionnaireAnswersMap = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(prefill)) {
    if (!value.trim()) continue;
    if (!String(next[key] ?? "").trim()) {
      next[key] = value;
    }
  }
  return next;
}

/** Load profile book and merge prefill into questionnaire answers for e-sign. */
export async function enrichQuestionnaireAnswersFromInvestorProfile(params: {
  viewerUserId: string;
  userInvestorProfileId?: string | null;
  answers?: InvestorQuestionnaireAnswersMap | null;
  dealId?: string;
  questions?: Pick<
    InvestorQuestionnaireQuestion,
    "id" | "investorProfileFieldKey"
  >[];
}): Promise<InvestorQuestionnaireAnswersMap | null> {
  const profileId = String(params.userInvestorProfileId ?? "").trim();
  if (!profileId) return params.answers ?? null;

  let questions = params.questions;
  if (!questions?.length && params.dealId?.trim()) {
    const config = await getDealInvestorQuestionnaireState(params.dealId.trim());
    questions = config?.questions;
  }

  const book = await getProfileBookForUser(params.viewerUserId);
  const prefill = buildQuestionnairePrefillFromProfileBook(
    book,
    profileId,
    questions,
  );
  if (!Object.keys(prefill).length) return params.answers ?? null;

  const merged = mergeQuestionnaireAnswersWithProfilePrefill(
    params.answers,
    prefill,
  );
  return Object.keys(merged).length > 0 ? merged : null;
}

async function readUserInvestorProfileIdForTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<string | null> {
  if (target.table !== "investment") return null;
  const [row] = await db
    .select({ userInvestorProfileId: dealInvestment.userInvestorProfileId })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, target.id),
        eq(dealInvestment.dealId, dealId),
      ),
    )
    .limit(1);
  const id = String(row?.userInvestorProfileId ?? "").trim();
  return id || null;
}

/**
 * Resolve questionnaire answers for e-sign, merging saved answers with
 * investor profile book and W-9 address data when available.
 */
export async function resolveQuestionnaireAnswersForEsign(params: {
  dealId: string;
  esignTarget?: InvestorEsignRowTarget | null;
  investorId?: string;
  answers?: InvestorQuestionnaireAnswersMap | null;
  w9Form?: unknown;
}): Promise<InvestorQuestionnaireAnswersMap | null> {
  let base =
    normalizeInvestorQuestionnaireAnswersInput(params.answers) ??
    (params.esignTarget
      ? await readInvestorQuestionnaireAnswersForTarget(
          params.dealId,
          params.esignTarget,
        )
      : null);

  const viewerUserId = String(params.investorId ?? "").trim();
  let addressParts: EsignAddressPrefillParts | null = null;

  const w9FromBody = normalizeInvestorW9FormInput(params.w9Form);
  const w9FromTarget =
    params.esignTarget && !w9FromBody
      ? await readInvestorW9FormForTarget(params.dealId, params.esignTarget)
      : null;
  addressParts =
    addressPrefillPartsFromW9(w9FromBody ?? w9FromTarget) ?? addressParts;

  if (viewerUserId && params.esignTarget) {
    const userInvestorProfileId = await readUserInvestorProfileIdForTarget(
      params.dealId,
      params.esignTarget,
    );
    if (userInvestorProfileId) {
      base = await enrichQuestionnaireAnswersFromInvestorProfile({
        viewerUserId,
        userInvestorProfileId,
        answers: base,
        dealId: params.dealId,
      });

      if (!addressParts) {
        const book = await getProfileBookForUser(viewerUserId);
        addressParts = addressPrefillPartsFromProfileBook(
          book,
          userInvestorProfileId,
        );
      }
    }
  }

  return mergeAddressIntoQuestionnaireAnswers(base, addressParts);
}
