/**
 * When a sponsor saves Funding Information, generate a PDF and append it to the
 * deal Documents tab under a dedicated "Funding Information" section.
 */

import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import { sanitizeOfferingInvestorPreviewBody } from "../../utils/sanitizeOfferingInvestorPreviewJson.js";
import {
  buildFundingInstructionsPdf,
  saveFundingInstructionsPdfFile,
} from "./fundingInstructionsPdf.service.js";
import {
  getAddDealFormById,
  updateDealOfferingInvestorPreviewById,
} from "./dealForm.service.js";

export const FUNDING_INFORMATION_DOCUMENTS_SECTION_ID =
  "funding-information-documents-section";

export const FUNDING_INFORMATION_DOCUMENTS_SECTION_LABEL =
  "Funding Information";

/** Legacy single-doc id; new saves use `${prefix}-${timestamp}`. */
export const FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID =
  "funding-instructions-auto-pdf";

export const FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX =
  FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID;

export function isFundingInstructionsAutoPdfDocumentId(
  docId: string | null | undefined,
): boolean {
  const id = String(docId ?? "").trim();
  if (!id) return false;
  return (
    id === FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX ||
    id.startsWith(`${FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX}-`)
  );
}

function uploadPublicUrl(relativePath: string): string {
  const rel = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return rel ? `/uploads/${rel}` : "";
}

type PreviewParts = {
  visibility: Record<string, boolean>;
  sections: Record<string, unknown>[];
};

function readPreviewParts(raw: string | null | undefined): PreviewParts {
  if (!raw?.trim()) return { visibility: {}, sections: [] };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const visibility =
      parsed.visibility != null &&
      typeof parsed.visibility === "object" &&
      !Array.isArray(parsed.visibility)
        ? (parsed.visibility as Record<string, boolean>)
        : {};
    const sections = Array.isArray(parsed.sections)
      ? (parsed.sections as Record<string, unknown>[])
      : [];
    return { visibility, sections };
  } catch {
    return { visibility: {}, sections: [] };
  }
}

function isFundingInformationSection(section: Record<string, unknown>): boolean {
  const id = String(section.id ?? "").trim();
  if (id === FUNDING_INFORMATION_DOCUMENTS_SECTION_ID) return true;
  const label = String(section.sectionLabel ?? section.label ?? "")
    .trim()
    .toLowerCase();
  return label === FUNDING_INFORMATION_DOCUMENTS_SECTION_LABEL.toLowerCase();
}

function fundingInstructionsDocumentLabel(savedAt: Date): string {
  const date = formatDdMmmYyyy(savedAt);
  const hours = String(savedAt.getHours()).padStart(2, "0");
  const minutes = String(savedAt.getMinutes()).padStart(2, "0");
  return `Funding Instructions — ${date} ${hours}:${minutes}`;
}

function buildFundingNestedDocument(params: {
  url: string;
  dateAdded: string;
  savedAt: Date;
}): Record<string, unknown> {
  return {
    id: `${FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX}-${params.savedAt.getTime()}`,
    name: fundingInstructionsDocumentLabel(params.savedAt),
    url: params.url,
    dateAdded: params.dateAdded,
    lpDisplaySectionId: FUNDING_INFORMATION_DOCUMENTS_SECTION_ID,
    sharedDealClassIds: [],
    sharedInvestorIds: [],
    sharedWithAllInvestors: false,
    sharedSponsorUserIds: [],
    sharedWithScope: "lp_investor",
    requiresProfileInvestment: true,
  };
}

function readAutoFundingNestedDocuments(
  section: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  if (!section || !Array.isArray(section.nestedDocuments)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of section.nestedDocuments) {
    if (item == null || typeof item !== "object") continue;
    const doc = item as Record<string, unknown>;
    const id = String(doc.id ?? "").trim();
    const url = String(doc.url ?? "").trim();
    if (!isFundingInstructionsAutoPdfDocumentId(id) || !url) continue;
    out.push(doc);
  }
  return out;
}

function fundingSectionHasPdfDocument(
  section: Record<string, unknown> | undefined,
): boolean {
  return readAutoFundingNestedDocuments(section).length > 0;
}

/**
 * Generate a new funding instructions PDF and append it to the Funding Information
 * documents section. Returns true when `offering_investor_preview_json` changed.
 */
export async function syncFundingInstructionsPdfToDocumentsTab(params: {
  dealId: string;
  fundingInstructionsJson: string;
  dealName?: string | null;
}): Promise<boolean> {
  const id = params.dealId.trim();
  if (!id) return false;

  const deal = await getAddDealFormById(id);
  if (!deal) return false;

  const savedAt = new Date();
  const pdfBuffer = await buildFundingInstructionsPdf({
    fundingInstructionsJson: params.fundingInstructionsJson,
    dealName: params.dealName ?? deal.dealName,
  });
  const relativePath = await saveFundingInstructionsPdfFile({
    dealId: id,
    pdfBuffer,
    savedAt,
  });
  const url = uploadPublicUrl(relativePath);
  if (!url) return false;

  const dateAdded = formatDdMmmYyyy(savedAt);
  const fundingNested = buildFundingNestedDocument({ url, dateAdded, savedAt });

  const { visibility, sections: existingSections } = readPreviewParts(
    deal.offeringInvestorPreviewJson,
  );
  const existingFundingSection = existingSections.find(isFundingInformationSection);
  const otherSections = existingSections.filter(
    (s) => !isFundingInformationSection(s),
  );
  const existingNested = readAutoFundingNestedDocuments(existingFundingSection);

  const fundingSection: Record<string, unknown> = {
    id: FUNDING_INFORMATION_DOCUMENTS_SECTION_ID,
    sectionLabel: FUNDING_INFORMATION_DOCUMENTS_SECTION_LABEL,
    documentLabel: FUNDING_INFORMATION_DOCUMENTS_SECTION_LABEL,
    visibility: "LP portal only",
    sharedWithScope: "lp_investor",
    requireLpReview: false,
    dateAdded:
      typeof existingFundingSection?.dateAdded === "string" &&
      String(existingFundingSection.dateAdded).trim()
        ? String(existingFundingSection.dateAdded).trim()
        : dateAdded,
    nestedDocuments: [...existingNested, fundingNested],
  };

  const nextSections = [...otherSections, fundingSection];
  const canonical = sanitizeOfferingInvestorPreviewBody({
    visibility,
    sections: nextSections,
  });

  const previewUnchanged =
    canonical === (deal.offeringInvestorPreviewJson ?? "");
  if (previewUnchanged && fundingSectionHasPdfDocument(fundingSection)) {
    return false;
  }

  const updated = await updateDealOfferingInvestorPreviewById(id, canonical);
  return Boolean(updated);
}
