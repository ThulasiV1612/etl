import type { SignFlowDocument, SignFlowField } from "../esign/signflow.service.js";
import {
  getOnboardingFieldsServiceUrl,
  isOnboardingFieldsServiceConfigured,
} from "../../config/onboardingFields.config.js";
import {
  portalProfileIdToSignFlowProfileType,
  type SignFlowProfileType,
} from "../../constants/esignProfileTypes.js";

type SignFlowDocumentField = NonNullable<SignFlowDocument["fields"]>[number];

type PythonPlacedField = {
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  recipient_id: string;
  recipient_role: "investor" | "sponsor";
  required?: boolean;
  profile_type?: string | null;
  profile_types?: string[] | null;
  value?: string | null;
};

type PlaceFieldsResponse = {
  fields: PythonPlacedField[];
  layout_version?: number;
};

type PrefillContext = {
  member_display_name?: string;
  member_email?: string;
  investment_amount?: string;
  address_line?: string;
  mailing_address_line?: string;
  street_line?: string;
  city?: string;
  state?: string;
  zip?: string;
  city_state_zip?: string;
};

export type OnboardingFieldPlacementParams = {
  pageCount: number;
  pdfBuffer?: Buffer;
  includeQuestionnaire: boolean;
  includesW9Appendix?: boolean;
  w9PageCount?: number;
  investorRecipientId?: string;
  sponsorRecipientId?: string;
};

export type OnboardingFieldPrefillParams = {
  fields: SignFlowField[];
  answers: Record<string, string>;
  context?: PrefillContext;
};

function normalizeLabel(label: string): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Known labels auto-placed on subscription pages — stripped before re-placing. */
export const AUTO_PLACED_SUBSCRIPTION_FIELD_LABELS = new Set(
  [
    "Sponsor Signature",
    "Sponsor Date",
    "Sponsor Print Name",
    "Sponsor Title",
    "Investor Signature",
    "Date Signed",
    "Print Name",
    "Print Title",
    "Print Title (if applicable)",
    "Sponsor Title",
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Address",
    "SSN",
    "Investment Amount",
    "Entity Legal Name",
    "Entity Name",
    "Authorized Signature",
    "Date",
    "Initials",
  ].map(normalizeLabel),
);

/** Map Python/legacy profile slugs to SignFlow-accepted profile types. */
function sanitizeSignFlowProfileType(
  raw: string | null | undefined,
): SignFlowProfileType | null {
  const mapped = portalProfileIdToSignFlowProfileType(raw);
  if (mapped) return mapped;

  const p = String(raw ?? "").trim().toLowerCase();
  if (
    p === "entity" ||
    p === "llc_corp_partnership_trust_solo_checkbook_ira"
  ) {
    return "llc_corp_partnership_trust_solo_checkbook_ira";
  }
  if (p === "ira" || p === "401k") {
    return "custodian_ira_401k";
  }
  return null;
}

function toSignFlowField(field: PythonPlacedField): SignFlowField {
  const profileTypes = (field.profile_types ?? [])
    .map((t) => sanitizeSignFlowProfileType(t))
    .filter((t): t is SignFlowProfileType => Boolean(t));
  const profileType = sanitizeSignFlowProfileType(field.profile_type);

  return {
    type: String(field.type ?? "text"),
    label: String(field.label ?? "Field"),
    x: Number(field.x) || 10,
    y: Number(field.y) || 10,
    width: Math.max(1, Number(field.width) || 20),
    height: Math.max(1, Number(field.height) || 4),
    page: Math.max(1, Math.floor(Number(field.page) || 1)),
    recipientId: field.recipient_id?.trim() || "rec_investor",
    required: field.required !== false,
    ...(profileTypes.length
      ? { profileTypes }
      : profileType
        ? { profileType }
        : {}),
    ...(field.value?.trim() ? { value: field.value.trim() } : {}),
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const base = getOnboardingFieldsServiceUrl();
  if (!base) return null;

  const url = `${base.replace(/\/$/, "")}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[onboarding-fields] ${path} failed (${res.status}):`,
        text.slice(0, 500),
      );
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[onboarding-fields] ${path} request error:`, err);
    return null;
  }
}

/** Fetch auto-placed fields from the Python service (sponsor + investor). */
export async function fetchAutoPlacedOnboardingFields(
  params: OnboardingFieldPlacementParams,
): Promise<SignFlowField[]> {
  if (!isOnboardingFieldsServiceConfigured()) return [];

  const data = await postJson<PlaceFieldsResponse>("/api/v1/fields/place", {
    page_count: params.pageCount,
    pdf_base64: params.pdfBuffer?.length
      ? params.pdfBuffer.toString("base64")
      : undefined,
    include_questionnaire: Boolean(params.includeQuestionnaire),
    includes_w9_appendix: Boolean(params.includesW9Appendix),
    w9_page_count: Math.max(0, Math.floor(params.w9PageCount ?? 0)),
    template_type: "subscription",
    investor_recipient_id: params.investorRecipientId ?? "rec_investor",
    sponsor_recipient_id: params.sponsorRecipientId ?? "rec_sponsor",
  });

  if (!data?.fields?.length) return [];
  const fields = data.fields.map(toSignFlowField);

  if (params.pdfBuffer?.length) {
    const { computePdfPageFingerprints } = await import(
      "../deal/esignPdfPageMap.service.js"
    );
    const hashes = await computePdfPageFingerprints(params.pdfBuffer);
    return fields.map((field) => {
      const templatePage = Math.max(1, Math.floor(field.page));
      const pageHash = hashes[templatePage - 1];
      return {
        ...field,
        templatePage,
        ...(pageHash ? { pageHash } : {}),
      };
    });
  }

  return fields;
}

/** Apply questionnaire/profile prefill to placed fields via Python service. */
export async function fetchPrefilledOnboardingFields(
  params: OnboardingFieldPrefillParams,
): Promise<SignFlowField[]> {
  if (!isOnboardingFieldsServiceConfigured()) return params.fields;

  const pythonFields = params.fields.map((f) => {
    const rawType = String(f.type ?? "text").trim().toLowerCase();
    const type =
      rawType === "date_signed" || rawType === "datesigned"
        ? "date"
        : rawType === "initial"
          ? "initials"
          : ["signature", "date", "text", "initials"].includes(rawType)
            ? rawType
            : "text";
    const rid = String(f.recipientId ?? "").trim();
    return {
      type,
      label: f.label,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      page: f.page,
      recipient_id: rid || "rec_investor",
      recipient_role: rid.includes("sponsor") ? "sponsor" : "investor",
      required: f.required !== false,
      profile_type: f.profileType ?? null,
      profile_types: f.profileTypes ?? null,
      value: f.value ?? null,
    };
  });

  const answers = Object.entries(params.answers).map(([question_id, value]) => ({
    question_id,
    value: String(value ?? ""),
  }));

  const data = await postJson<{ fields: PythonPlacedField[] }>(
    "/api/v1/fields/prefill",
    {
      fields: pythonFields,
      answers,
      context: params.context ?? {},
    },
  );

  if (!data?.fields?.length) return params.fields;
  return params.fields.map((original, index) => {
    const python = data.fields[index];
    if (!python) return original;
    const updated = toSignFlowField(python);
    return {
      ...original,
      ...updated,
      value: updated.value?.trim() || original.value,
      dataKey: original.dataKey ?? updated.dataKey,
      profileTypes: original.profileTypes?.length
        ? original.profileTypes
        : updated.profileTypes,
      profileType: original.profileType ?? updated.profileType,
      pageHash: original.pageHash ?? updated.pageHash,
      templatePage: original.templatePage ?? updated.templatePage,
    };
  });
}

/**
 * Replace prior auto-placed fields with a fresh set from Python (all pages).
 * Questionnaire page-1 fields are managed separately by the Node backend.
 */
export function replaceAutoPlacedSubscriptionFields(
  existing: SignFlowDocumentField[],
  autoPlaced: SignFlowField[],
): SignFlowField[] {
  const kept = existing.filter((field) => {
    // Sponsor-added catalog fields (dataKey) must not be wiped by auto-place.
    if (String((field as SignFlowField).dataKey ?? "").trim()) return true;
    return !AUTO_PLACED_SUBSCRIPTION_FIELD_LABELS.has(
      normalizeLabel(String(field.label ?? "")),
    );
  });

  return [...(kept as SignFlowField[]), ...autoPlaced];
}
