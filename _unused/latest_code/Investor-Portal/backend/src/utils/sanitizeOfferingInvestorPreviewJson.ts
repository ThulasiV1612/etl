import { consolidateInvestorEsignDocumentSections } from "../services/deal/dealEsignDocumentsWorkspaceSync.service.js";

const MAX_PAYLOAD_CHARS = 450_000;

const VISIBILITY_KEYS = new Set([
  "make_announcement",
  "overview",
  "offering_information",
  "gallery",
  "summary",
  "documents",
  "assets",
  "key_highlights",
  "funding_instructions",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function clipStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function parseIdListField(raw: unknown, maxItems = 200): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string" || !x.trim()) continue;
    out.push(clipStr(x.trim(), 120));
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeNested(
  raw: unknown,
  parentSectionId: string,
): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim() ? clipStr(raw.id.trim(), 120) : "";
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? clipStr(raw.name.trim(), 500)
      : typeof raw.documentName === "string" && raw.documentName.trim()
        ? clipStr(raw.documentName.trim(), 500)
        : "";
  if (!id || !name) return null;
  const urlRaw = raw.url;
  let url: string | null = null;
  if (typeof urlRaw === "string" && urlRaw.trim()) {
    url = clipStr(urlRaw.trim(), 8000);
  } else if (urlRaw === null) {
    url = null;
  }
  const dateAdded =
    typeof raw.dateAdded === "string" && raw.dateAdded.trim()
      ? clipStr(raw.dateAdded.trim(), 80)
      : "—";
  const refRaw = raw.lpDisplaySectionId;
  const lpDisplaySectionId =
    typeof refRaw === "string" && refRaw.trim()
      ? clipStr(refRaw.trim(), 120)
      : parentSectionId;
  const sw = raw.sharedWithScope;
  const sharedWithScope =
    sw === "lp_investor"
      ? "lp_investor"
      : sw === "offering_page"
        ? "offering_page"
        : sw === "not_visible"
          ? "not_visible"
          : undefined;
  const sharedWithAllInvestors = Boolean(raw.sharedWithAllInvestors);
  const sharedDealClassIds = parseIdListField(raw.sharedDealClassIds);
  const sharedInvestorIds = sharedWithAllInvestors
    ? []
    : parseIdListField(raw.sharedInvestorIds);
  const sharedSponsorUserIds = parseIdListField(raw.sharedSponsorUserIds);
  const requiresProfileInvestment = Boolean(raw.requiresProfileInvestment);
  const esignSignatureRequestId =
    typeof raw.esignSignatureRequestId === "string" &&
    raw.esignSignatureRequestId.trim()
      ? clipStr(raw.esignSignatureRequestId.trim(), 200)
      : undefined;
  const esignInvestorRowId =
    typeof raw.esignInvestorRowId === "string" && raw.esignInvestorRowId.trim()
      ? clipStr(raw.esignInvestorRowId.trim(), 120)
      : undefined;
  const esignInvestorRowTable =
    raw.esignInvestorRowTable === "investment" || raw.esignInvestorRowTable === "lp"
      ? raw.esignInvestorRowTable
      : undefined;
  const esignTemplateFileId =
    typeof raw.esignTemplateFileId === "string" && raw.esignTemplateFileId.trim()
      ? clipStr(raw.esignTemplateFileId.trim(), 200)
      : undefined;
  const esignAwaitingSponsorSignature = Boolean(raw.esignAwaitingSponsorSignature);
  const esignSponsorSigned = Boolean(raw.esignSponsorSigned);
  const uploadedByUserId =
    typeof raw.uploadedByUserId === "string" && raw.uploadedByUserId.trim()
      ? clipStr(raw.uploadedByUserId.trim(), 120)
      : undefined;
  const uploadedByIsCoSponsor = raw.uploadedByIsCoSponsor === true;
  return {
    id,
    name,
    url,
    dateAdded,
    lpDisplaySectionId,
    ...(sharedWithScope ? { sharedWithScope } : {}),
    sharedDealClassIds,
    sharedInvestorIds,
    sharedWithAllInvestors,
    sharedSponsorUserIds,
    ...(uploadedByUserId ? { uploadedByUserId } : {}),
    ...(uploadedByIsCoSponsor ? { uploadedByIsCoSponsor: true } : {}),
    ...(requiresProfileInvestment ? { requiresProfileInvestment: true } : {}),
    ...(esignSignatureRequestId ? { esignSignatureRequestId } : {}),
    ...(esignInvestorRowId ? { esignInvestorRowId } : {}),
    ...(esignInvestorRowTable ? { esignInvestorRowTable } : {}),
    ...(esignTemplateFileId ? { esignTemplateFileId } : {}),
    ...(esignAwaitingSponsorSignature
      ? { esignAwaitingSponsorSignature: true }
      : {}),
    ...(esignSponsorSigned ? { esignSponsorSigned: true } : {}),
  };
}

function normalizeSection(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim() ? clipStr(raw.id.trim(), 120) : "";
  const sectionLabel =
    typeof raw.sectionLabel === "string" && raw.sectionLabel.trim()
      ? clipStr(raw.sectionLabel.trim(), 500)
      : typeof raw.label === "string" && raw.label.trim()
        ? clipStr(raw.label.trim(), 500)
        : "";
  const documentLabel =
    typeof raw.documentLabel === "string" && raw.documentLabel.trim()
      ? clipStr(raw.documentLabel.trim(), 500)
      : sectionLabel || "—";
  if (!id || !sectionLabel) return null;
  const legacyVisibility =
    typeof raw.visibility === "string" && raw.visibility.trim()
      ? clipStr(raw.visibility.trim(), 120)
      : "Offering page";
  const sw = raw.sharedWithScope;
  const legacyLower = legacyVisibility.toLowerCase();
  /** Sections stay offering/LP only; per-file `not_visible` lives on nested docs. */
  const sharedWithScope =
    sw === "lp_investor"
      ? "lp_investor"
      : sw === "offering_page"
        ? "offering_page"
        : legacyLower.includes("lp") && legacyLower.includes("investor")
          ? "lp_investor"
          : "offering_page";
  const visibility =
    sharedWithScope === "lp_investor" ? "LP portal only" : "Offering link";
  const requireLpReview = Boolean(raw.requireLpReview);
  const dateAdded =
    typeof raw.dateAdded === "string" && raw.dateAdded.trim()
      ? clipStr(raw.dateAdded.trim(), 80)
      : "—";
  const nestedRaw = raw.nestedDocuments;
  const nestedDocuments: Record<string, unknown>[] = [];
  if (Array.isArray(nestedRaw)) {
    let n = 0;
    for (const item of nestedRaw) {
      if (n >= 400) break;
      const doc = normalizeNested(item, id);
      if (doc) {
        nestedDocuments.push(doc);
        n += 1;
      }
    }
  }
  return {
    id,
    sectionLabel,
    documentLabel,
    visibility,
    sharedWithScope,
    requireLpReview,
    dateAdded,
    nestedDocuments,
  };
}

function flattenSectionsToOfferingDocuments(
  sections: Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const sec of sections) {
    const sectionLabel = String(sec.sectionLabel ?? "").trim() || "Documents";
    const sectionScope =
      sec.sharedWithScope === "lp_investor" ? "lp_investor" : "offering_page";
    const nested = sec.nestedDocuments;
    if (!Array.isArray(nested)) continue;
    for (const item of nested) {
      if (!isRecord(item)) continue;
      const fileName = String(item.name ?? "").trim() || "Document";
      const docScope =
        item.sharedWithScope === "lp_investor"
          ? "lp_investor"
          : item.sharedWithScope === "offering_page"
            ? "offering_page"
            : item.sharedWithScope === "not_visible"
              ? "not_visible"
              : sectionScope;
      out.push({
        id: item.id,
        name: `${sectionLabel} — ${fileName}`,
        url: item.url ?? null,
        dateAdded: item.dateAdded ?? "—",
        sharedWithScope: docScope,
      });
    }
  }
  return out;
}

function sanitizeSectionsInput(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  let i = 0;
  for (const item of raw) {
    if (i >= 80) break;
    const s = normalizeSection(item);
    if (s) {
      out.push(s);
      i += 1;
    }
  }
  const stripped = consolidateInvestorEsignDocumentSections(out);
  const ids = new Set(stripped.map((x) => String(x.id)));
  return stripped.map((s) => ({
    ...s,
    nestedDocuments: (s.nestedDocuments as Record<string, unknown>[]).map(
      (d) => ({
        ...d,
        lpDisplaySectionId: ids.has(String(d.lpDisplaySectionId))
          ? d.lpDisplaySectionId
          : s.id,
      }),
    ),
  }));
}

function sanitizeVisibilityInput(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!isRecord(raw)) return out;
  for (const k of VISIBILITY_KEYS) {
    const v = raw[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export class OfferingInvestorPreviewJsonTooLargeError extends Error {
  constructor() {
    super("Offering investor preview payload is too large.");
    this.name = "OfferingInvestorPreviewJsonTooLargeError";
  }
}

export class OfferingInvestorPreviewJsonInvalidError extends Error {
  constructor(message = "Invalid offering investor preview payload.") {
    super(message);
    this.name = "OfferingInvestorPreviewJsonInvalidError";
  }
}

/**
 * Accepts `{ visibility?, sections? }` or legacy stringified JSON; returns canonical JSON string `{ v, visibility, sections }`.
 */
export function sanitizeOfferingInvestorPreviewBody(
  body: unknown,
): string {
  let root: unknown = body;
  if (typeof body === "string" && body.trim()) {
    try {
      root = JSON.parse(body) as unknown;
    } catch {
      throw new OfferingInvestorPreviewJsonInvalidError(
        "Body must be JSON object or valid JSON string.",
      );
    }
  }
  if (!isRecord(root)) {
    throw new OfferingInvestorPreviewJsonInvalidError();
  }
  const sections = sanitizeSectionsInput(root.sections);
  const visibility = sanitizeVisibilityInput(root.visibility);
  const offeringDocuments = flattenSectionsToOfferingDocuments(sections);
  const out = { v: 1 as const, visibility, sections, offeringDocuments };
  const s = JSON.stringify(out);
  if (s.length > MAX_PAYLOAD_CHARS) {
    throw new OfferingInvestorPreviewJsonTooLargeError();
  }
  return s;
}
