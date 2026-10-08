/**
 * When an investor completes eSign, mirror signed PDFs into the deal Documents tab
 * under a dedicated "Esign template" section (`offering_investor_preview_json.sections`).
 */

import { eq } from "drizzle-orm";
import {
  commitmentProfileDisplayLabel,
  esignSendReadyForSponsorCounterSign,
  parseEsignStatusBundle,
  type StoredDealInvestorEsignSend,
} from "../../constants/deal-investor-esign-status.js";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import {
  getSignFlowDocument,
  findSignFlowTemplateRecipient,
  signFlowAnyInvestorHasSigned,
  signFlowSponsorSignsBeforeInvestor,
  signFlowInvestorPhaseComplete,
  signFlowTemplateHasSponsorFields,
} from "../esign/signflow.service.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import { sanitizeOfferingInvestorPreviewBody } from "../../utils/sanitizeOfferingInvestorPreviewJson.js";
import {
  getAddDealFormById,
  updateDealOfferingInvestorPreviewById,
} from "./dealForm.service.js";
import {
  resolveInvestorDocumentAudienceIds,
  sequentialWorkflowInvestorPortalDocsGateOpen,
  sequentialWorkflowSponsorDocsGateOpen,
} from "./dealSequentialEsignWorkflow.service.js";
import {
  updateDealInvestorEsignSend,
  type InvestorEsignRowTarget,
} from "./dealMemberEsignStatus.service.js";

export const ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID =
  "esign-template-documents-section";

export const ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL = "Investor e signatures";

/** Offering Documents section — fully executed eSign PDFs promoted here (LP scoped). */
export const DEFAULT_OFFERING_DOCUMENTS_SECTION_ID = "default-documents-section";

const LEGACY_ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL = "Esign template";

function uploadPublicUrl(relativePath: string): string {
  const rel = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return rel ? `/uploads/${rel}` : "";
}

function sendHasStoredOrRecordedSignature(
  send: StoredDealInvestorEsignSend,
): boolean {
  if (send.completedAt?.trim() || send.signedAt?.trim()) return true;
  return (send.documents ?? []).some((d) => Boolean(d.signedRelativePath?.trim()));
}

function listSignedEsignDocumentsForSend(
  send: StoredDealInvestorEsignSend,
  signatureRequestId: string,
  opts?: { preferFullSignedCopy?: boolean },
): Array<{ fileId: string; name: string; url: string | null }> {
  if (!sendHasStoredOrRecordedSignature(send)) return [];
  const docs = send.documents ?? [];
  if (docs.length === 0) return [];

  const investorPath =
    docs.find((d) => d.signedRelativePath?.trim())?.signedRelativePath?.trim() ??
    "";
  const fullPath = send.fullSignedRelativePath?.trim() ?? "";
  const sharedPath =
    opts?.preferFullSignedCopy && fullPath ? fullPath : investorPath;
  const sharedUrl = sharedPath ? uploadPublicUrl(sharedPath) : null;
  const sig = signatureRequestId.trim();

  return docs.map((d) => {
    const rel =
      (opts?.preferFullSignedCopy && fullPath ? fullPath : "") ||
      d.signedRelativePath?.trim() ||
      sharedPath;
    const url = rel ? uploadPublicUrl(rel) : sharedUrl;
    const compositeId = sig && d.fileId ? `${sig}::${d.fileId}` : d.fileId;
    return {
      fileId: compositeId,
      name: d.name,
      url: url || null,
    };
  });
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

function isInvestorEsignNestedDocument(doc: Record<string, unknown>): boolean {
  if (String(doc.esignSignatureRequestId ?? "").trim()) return true;
  if (String(doc.esignInvestorRowId ?? "").trim()) return true;
  if (String(doc.esignTemplateFileId ?? "").trim()) return true;
  const lpSectionId = String(doc.lpDisplaySectionId ?? "").trim();
  if (!lpSectionId) return false;
  if (lpSectionId === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID) return true;
  return lpSectionId.toLowerCase().startsWith("recovered-investor-e-signature");
}

/** Remove investor eSign PDFs from non–e-sign sections (and drop duplicate e-sign section rows). */
export function stripInvestorEsignDocumentsFromOtherSections(
  sections: Record<string, unknown>[],
): Record<string, unknown>[] {
  return sections
    .filter((s) => !isEsignTemplateSection(s))
    .map((s) => {
      const nested = Array.isArray(s.nestedDocuments) ? s.nestedDocuments : [];
      return {
        ...s,
        nestedDocuments: nested.filter((raw) => {
          if (raw == null || typeof raw !== "object") return true;
          return !isInvestorEsignNestedDocument(raw as Record<string, unknown>);
        }),
      };
    });
}

/** Move misplaced investor eSign PDFs into the canonical Investor e signatures section. */
export function consolidateInvestorEsignDocumentSections(
  sections: Record<string, unknown>[],
): Record<string, unknown>[] {
  const esignDocsById = new Map<string, Record<string, unknown>>();
  for (const section of sections) {
    const nested = Array.isArray(section.nestedDocuments)
      ? section.nestedDocuments
      : [];
    for (const raw of nested) {
      if (raw == null || typeof raw !== "object") continue;
      const doc = raw as Record<string, unknown>;
      if (!isInvestorEsignNestedDocument(doc)) continue;
      const id = String(doc.id ?? "").trim();
      if (!id) continue;
      esignDocsById.set(id, {
        ...doc,
        lpDisplaySectionId: ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
      });
    }
  }

  const stripped = stripInvestorEsignDocumentsFromOtherSections(sections);
  if (esignDocsById.size === 0) return stripped;

  const prior = sections.find(
    (s) => String(s.id ?? "").trim() === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
  );
  stripped.push({
    ...(prior ?? {
      id: ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
      sectionLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
      documentLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
      visibility: "Sponsor workspace only",
      sharedWithScope: "offering_page",
      requireLpReview: false,
      dateAdded: formatDdMmmYyyy(new Date()),
    }),
    nestedDocuments: [...esignDocsById.values()],
  });
  return stripped;
}

function isEsignTemplateSection(section: Record<string, unknown>): boolean {
  const id = String(section.id ?? "").trim();
  if (id === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID) return true;
  const idLower = id.toLowerCase();
  if (idLower.startsWith("recovered-investor-e-signature")) return true;
  const label = String(section.sectionLabel ?? section.label ?? "")
    .trim()
    .toLowerCase();
  return (
    label === ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL.toLowerCase() ||
    label === LEGACY_ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL.toLowerCase()
  );
}

function signFlowRecipientHasSigned(recipient: {
  signed?: boolean;
  signingStatus?: string;
  status?: string;
  signedAt?: string | null;
}): boolean {
  if (recipient.signed === true) return true;
  const status = String(
    recipient.signingStatus ?? recipient.status ?? "",
  )
    .trim()
    .toLowerCase();
  if (status === "signed" || status === "completed") return true;
  return Boolean(recipient.signedAt?.trim());
}

export async function resolveEsignSponsorSignState(
  send: StoredDealInvestorEsignSend,
): Promise<{
  awaitingSponsorSignature: boolean;
  sponsorSigned: boolean;
}> {
  const investorSignedLocal = esignSendReadyForSponsorCounterSign(send);
  const fullyCompleted = Boolean(send.completedAt?.trim());
  if (fullyCompleted) {
    return { awaitingSponsorSignature: false, sponsorSigned: true };
  }

  const sigId = send.signatureRequestId?.trim();
  if (!sigId || getActiveEsignProvider() !== "signflow") {
    if (!investorSignedLocal) {
      return { awaitingSponsorSignature: false, sponsorSigned: fullyCompleted };
    }
    return {
      awaitingSponsorSignature: !fullyCompleted,
      sponsorSigned: fullyCompleted,
    };
  }

  try {
    const doc = await getSignFlowDocument(sigId);
    if (!signFlowTemplateHasSponsorFields(doc)) {
      return { awaitingSponsorSignature: false, sponsorSigned: true };
    }
    const sponsor = findSignFlowTemplateRecipient(doc, [
      "seller",
      "sponsor",
      "rec_sponsor",
      "rec_2",
      "recipient_b",
    ]);
    if (!sponsor) {
      return { awaitingSponsorSignature: false, sponsorSigned: fullyCompleted };
    }
    const sponsorSigned = signFlowRecipientHasSigned(sponsor);
    if (sponsorSigned) {
      return { awaitingSponsorSignature: false, sponsorSigned: true };
    }

    const sponsorSignsFirst = signFlowSponsorSignsBeforeInvestor(doc);
    const investorSignedLive =
      investorSignedLocal || signFlowInvestorPhaseComplete(doc);

    if (sponsorSignsFirst) {
      return { awaitingSponsorSignature: true, sponsorSigned: false };
    }

    if (!investorSignedLive) {
      return { awaitingSponsorSignature: false, sponsorSigned: false };
    }

    return { awaitingSponsorSignature: true, sponsorSigned: false };
  } catch {
    if (!investorSignedLocal) {
      return { awaitingSponsorSignature: false, sponsorSigned: fullyCompleted };
    }
    return {
      awaitingSponsorSignature: !fullyCompleted,
      sponsorSigned: fullyCompleted,
    };
  }
}

function sendReadyForInvestorEsignDocumentsSection(
  send: StoredDealInvestorEsignSend,
): boolean {
  return esignSendReadyForSponsorCounterSign(send);
}

function buildEsignNestedDocument(params: {
  docId: string;
  displayName: string;
  url: string;
  dateAdded: string;
  investorRowId: string;
  investorRowTable: "investment" | "lp";
  signatureRequestId: string;
  templateFileId: string;
  awaitingSponsorSignature: boolean;
  sponsorSigned: boolean;
}): Record<string, unknown> {
  return {
    id: params.docId,
    name: params.displayName,
    url: params.url,
    dateAdded: params.dateAdded,
    lpDisplaySectionId: ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
    sharedDealClassIds: [],
    sharedInvestorIds: [],
    sharedWithAllInvestors: false,
    sharedSponsorUserIds: [],
    sharedWithScope: "offering_page",
    requiresProfileInvestment: false,
    esignSignatureRequestId: params.signatureRequestId || undefined,
    esignInvestorRowId: params.investorRowId,
    esignInvestorRowTable: params.investorRowTable,
    esignTemplateFileId: params.templateFileId || undefined,
    esignAwaitingSponsorSignature: params.awaitingSponsorSignature,
    esignSponsorSigned: params.sponsorSigned,
  };
}

async function collectCompletedEsignNestedDocuments(
  dealId: string,
  investorRowId: string,
  investorRowTable: "investment" | "lp",
  investorDisplayName: string,
  profileId: string | null | undefined,
  esignStatusJson: string | null | undefined,
  sponsorDocsGateOpen: boolean,
): Promise<Record<string, unknown>[]> {
  const bundle = parseEsignStatusBundle(esignStatusJson);
  if (!bundle?.sends.length) return [];
  if (!sponsorDocsGateOpen) return [];

  const investorLabel = investorDisplayName.trim() || "Investor";
  const profileLabel = commitmentProfileDisplayLabel(profileId);
  const out: Record<string, unknown>[] = [];

  for (const send of bundle.sends) {
    if (!sendReadyForInvestorEsignDocumentsSection(send)) continue;
    const sig = send.signatureRequestId?.trim() ?? "";
    const sponsorState = await resolveEsignSponsorSignState(send);
    const signedDocs = listSignedEsignDocumentsForSend(send, sig, {
      preferFullSignedCopy: sponsorState.sponsorSigned,
    });
    const completedAt =
      send.signedAt?.trim() ||
      send.completedAt?.trim() ||
      send.sentAt?.trim() ||
      "";
    const dateAdded = formatDdMmmYyyy(completedAt);

    for (const doc of signedDocs) {
      const url = doc.url?.trim();
      if (!url) continue;
      const docId = doc.fileId.trim();
      if (!docId) continue;
      const templateName = doc.name.trim() || "Signed document";
      const displayName = `${templateName} - ${investorLabel} - ${profileLabel}`;
      const templateFileId = docId.includes("::")
        ? docId.split("::").pop()?.trim() ?? docId
        : docId;
      out.push(
        buildEsignNestedDocument({
          docId,
          displayName,
          url,
          dateAdded,
          investorRowId,
          investorRowTable,
          signatureRequestId: sig,
          templateFileId,
          awaitingSponsorSignature: sponsorState.awaitingSponsorSignature,
          sponsorSigned: sponsorState.sponsorSigned,
        }),
      );
    }
  }

  return out;
}

function findOrCreateDefaultOfferingSection(
  sections: Record<string, unknown>[],
): Record<string, unknown> {
  const existing = sections.find(
    (s) =>
      String(s.id ?? "").trim() === DEFAULT_OFFERING_DOCUMENTS_SECTION_ID,
  );
  if (existing) return existing;
  const created: Record<string, unknown> = {
    id: DEFAULT_OFFERING_DOCUMENTS_SECTION_ID,
    sectionLabel: "Offering Documents",
    documentLabel: "Offering Documents",
    visibility: "LP portal only",
    sharedWithScope: "lp_investor",
    requireLpReview: false,
    dateAdded: formatDdMmmYyyy(new Date()),
    nestedDocuments: [],
  };
  sections.push(created);
  return created;
}

function buildPromotedInvestorOfferingDocument(params: {
  docId: string;
  displayName: string;
  url: string;
  dateAdded: string;
  sharedInvestorIds: string[];
}): Record<string, unknown> {
  return {
    id: params.docId,
    name: params.displayName,
    url: params.url,
    dateAdded: params.dateAdded,
    lpDisplaySectionId: DEFAULT_OFFERING_DOCUMENTS_SECTION_ID,
    sharedDealClassIds: [],
    sharedInvestorIds: params.sharedInvestorIds,
    sharedWithAllInvestors: false,
    sharedSponsorUserIds: [],
    sharedWithScope: "lp_investor",
    requiresProfileInvestment: false,
  };
}

function stripEsignPromotedDocumentsFromOfferingSection(
  sections: Record<string, unknown>[],
): boolean {
  const defaultSection = sections.find(
    (s) =>
      String(s.id ?? "").trim() === DEFAULT_OFFERING_DOCUMENTS_SECTION_ID,
  );
  if (!defaultSection) return false;
  const nested = Array.isArray(defaultSection.nestedDocuments)
    ? (defaultSection.nestedDocuments as Record<string, unknown>[])
    : [];
  const filtered = nested.filter((doc) => {
    const docId = String(doc.id ?? "").trim();
    return !docId.startsWith("esign-promoted-");
  });
  if (filtered.length === nested.length) return false;
  defaultSection.nestedDocuments = filtered;
  return true;
}

/** After all investors sign (and sponsor counter-sign), mirror PDFs into LP Offering Documents. */
async function promoteSponsorSignedDocsToInvestorOfferingSection(
  dealId: string,
  sections: Record<string, unknown>[],
  investments: Array<{
    id: string;
    contactDisplayName: string | null;
    profileId: string | null;
    esignStatusJson: string | null;
  }>,
  roster: Array<{
    id: string;
    email: string | null;
    profileId: string | null;
    esignStatusJson: string | null;
  }>,
  investorPortalGateOpen: boolean,
): Promise<boolean> {
  let changed = stripEsignPromotedDocumentsFromOfferingSection(sections);

  if (!investorPortalGateOpen) {
    return changed;
  }

  const defaultSection = findOrCreateDefaultOfferingSection(sections);
  const nested = Array.isArray(defaultSection.nestedDocuments)
    ? [...(defaultSection.nestedDocuments as Record<string, unknown>[])]
    : [];
  const nestedById = new Map(
    nested.map((d) => [String(d.id ?? "").trim(), d]),
  );

  const processRow = async (
    target: InvestorEsignRowTarget,
    displayName: string,
    profileId: string | null | undefined,
    esignStatusJson: string | null | undefined,
  ) => {
    const bundle = parseEsignStatusBundle(esignStatusJson);
    if (!bundle?.sends.length) return;

    for (const send of bundle.sends) {
      const sig = send.signatureRequestId?.trim() ?? "";
      if (!sig || !send.signedAt?.trim()) continue;

      const sponsorState = await resolveEsignSponsorSignState(send);
      if (!sponsorState.sponsorSigned) continue;

      const signedDocs = listSignedEsignDocumentsForSend(send, sig, {
        preferFullSignedCopy: true,
      });
      if (!signedDocs.length) continue;

      const sharedInvestorIds = await resolveInvestorDocumentAudienceIds(
        dealId,
        target,
      );
      const profileLabel = commitmentProfileDisplayLabel(profileId);
      const investorLabel = displayName.trim() || "Investor";
      const completedAt =
        send.completedAt?.trim() ||
        send.signedAt?.trim() ||
        send.sentAt?.trim() ||
        "";
      const dateAdded = formatDdMmmYyyy(completedAt);

      for (const doc of signedDocs) {
        const url = doc.url?.trim();
        if (!url) continue;
        const templateName = doc.name.trim() || "Signed document";
        const displayName = `${templateName} - ${investorLabel} - ${profileLabel}`;
        const promotedId = `esign-promoted-${sig}::${doc.fileId.includes("::") ? doc.fileId.split("::").pop() : doc.fileId}`;
        nestedById.set(
          promotedId,
          buildPromotedInvestorOfferingDocument({
            docId: promotedId,
            displayName,
            url,
            dateAdded,
            sharedInvestorIds,
          }),
        );
        changed = true;
      }

      if (sponsorState.sponsorSigned && !send.promotedToInvestorDocumentsAt?.trim()) {
        await updateDealInvestorEsignSend(dealId, target, sig, (current) => ({
          ...current,
          promotedToInvestorDocumentsAt: new Date().toISOString(),
        }));
      }
    }
  };

  for (const row of investments) {
    await processRow(
      { table: "investment", id: row.id },
      row.contactDisplayName ?? "",
      row.profileId,
      row.esignStatusJson,
    );
  }
  for (const row of roster) {
    await processRow(
      { table: "lp", id: row.id },
      row.email?.trim() ?? "",
      row.profileId,
      row.esignStatusJson,
    );
  }

  if (changed) {
    defaultSection.nestedDocuments = [...nestedById.values()];
  }
  return changed;
}

/**
 * Rebuild the Esign template section from all completed investor eSign rows on the deal.
 * Returns true when `offering_investor_preview_json` was updated.
 */
export async function syncCompletedEsignDocumentsToDocumentsTab(
  dealId: string,
): Promise<boolean> {
  const id = dealId.trim();
  if (!id) return false;

  const deal = await getAddDealFormById(id);
  if (!deal) return false;

  const [investments, roster] = await Promise.all([
    db
      .select({
        id: dealInvestment.id,
        contactDisplayName: dealInvestment.contactDisplayName,
        profileId: dealInvestment.profileId,
        esignStatusJson: dealInvestment.esignStatusJson,
      })
      .from(dealInvestment)
      .where(eq(dealInvestment.dealId, id)),
    db
      .select({
        id: dealLpInvestor.id,
        email: dealLpInvestor.email,
        profileId: dealLpInvestor.profileId,
        esignStatusJson: dealLpInvestor.esignStatusJson,
      })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, id)),
  ]);

  const sponsorDocsGateOpen = await sequentialWorkflowSponsorDocsGateOpen(id);
  const investorPortalGateOpen =
    await sequentialWorkflowInvestorPortalDocsGateOpen(id);

  const nestedById = new Map<string, Record<string, unknown>>();
  for (const row of investments) {
    const docs = await collectCompletedEsignNestedDocuments(
      id,
      row.id,
      "investment",
      row.contactDisplayName ?? "",
      row.profileId,
      row.esignStatusJson,
      sponsorDocsGateOpen,
    );
    for (const doc of docs) {
      const docId = String(doc.id ?? "").trim();
      if (docId) nestedById.set(docId, doc);
    }
  }
  for (const row of roster) {
    const docs = await collectCompletedEsignNestedDocuments(
      id,
      row.id,
      "lp",
      row.email?.trim() ?? "",
      row.profileId,
      row.esignStatusJson,
      sponsorDocsGateOpen,
    );
    for (const doc of docs) {
      const docId = String(doc.id ?? "").trim();
      if (docId) nestedById.set(docId, doc);
    }
  }

  const { visibility, sections: existingSections } = readPreviewParts(
    deal.offeringInvestorPreviewJson,
  );
  const otherSections = stripInvestorEsignDocumentsFromOtherSections(
    existingSections,
  );

  await promoteSponsorSignedDocsToInvestorOfferingSection(
    id,
    otherSections,
    investments,
    roster,
    investorPortalGateOpen,
  );

  const esignNested = [...nestedById.values()];
  const hadEsignSection = existingSections.some(isEsignTemplateSection);

  let nextSections = [...otherSections];
  if (esignNested.length > 0 || hadEsignSection) {
    nextSections.push({
      id: ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
      sectionLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
      documentLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
      visibility: "Sponsor workspace only",
      sharedWithScope: "offering_page",
      requireLpReview: false,
      dateAdded: formatDdMmmYyyy(new Date()),
      nestedDocuments: esignNested,
    });
  }

  const canonical = sanitizeOfferingInvestorPreviewBody({
    visibility,
    sections: nextSections,
  });

  if (canonical === (deal.offeringInvestorPreviewJson ?? "")) return false;

  const updated = await updateDealOfferingInvestorPreviewById(id, canonical);
  return Boolean(updated);
}

/**
 * True when this profile-scoped signature request already appears in the sponsor
 * Documents tab “Investor e signatures” section (authoritative for sponsor counter-sign).
 */
export async function esignSignatureRequestVisibleInDocumentsTab(
  dealId: string,
  signatureRequestId: string,
): Promise<boolean> {
  const id = dealId.trim();
  const sigId = signatureRequestId.trim();
  if (!id || !sigId) return false;

  const deal = await getAddDealFormById(id);
  const { sections } = readPreviewParts(deal?.offeringInvestorPreviewJson);
  for (const section of sections) {
    if (!isEsignTemplateSection(section)) continue;
    const nested = section.nestedDocuments;
    if (!Array.isArray(nested)) continue;
    for (const raw of nested) {
      if (raw == null || typeof raw !== "object") continue;
      const doc = raw as Record<string, unknown>;
      const docSig = String(doc.esignSignatureRequestId ?? "").trim();
      if (docSig === sigId) return true;
      const docId = String(doc.id ?? "").trim();
      if (docId === sigId || docId.startsWith(`${sigId}::`)) return true;
    }
  }
  return false;
}

/** Latest canonical JSON after sync (for API responses). */
export async function readOfferingInvestorPreviewJsonAfterEsignSync(
  dealId: string,
): Promise<string | null> {
  const id = dealId.trim();
  if (!id) return null;
  await syncCompletedEsignDocumentsToDocumentsTab(id);
  const deal = await getAddDealFormById(id);
  return deal?.offeringInvestorPreviewJson ?? null;
}
