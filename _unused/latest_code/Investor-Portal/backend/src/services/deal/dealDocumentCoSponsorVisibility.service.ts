import { pool } from "../../database/db.js";
import { sanitizeOfferingInvestorPreviewBody } from "../../utils/sanitizeOfferingInvestorPreviewJson.js";
import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";
import {
  filterMergedLpInvestorsForCoSponsorViewer,
  isViewerCoSponsorOnDeal,
  listMergedLpInvestorsForDeal,
} from "./dealLpInvestor.service.js";
import {
  isPortalUserLeadOrAdminSponsorOnDeal,
  listEquivalentPortalUserIdsForUsers,
} from "./dealMemberScope.service.js";
import type { DealInvestmentRow } from "../../schema/deal.schema/deal-investment.schema.js";

type NestedDoc = Record<string, unknown>;
type PreviewSection = Record<string, unknown>;

const DEAL_INVESTMENT_AUTOSAVE_CONTACT = "__portal_investment_autosave__";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
    .map((x) => x.trim());
}

function nestedDocsOf(section: PreviewSection): NestedDoc[] {
  return Array.isArray(section.nestedDocuments)
    ? section.nestedDocuments.filter(isRecord)
    : [];
}

function parsePreviewParts(raw: string | null | undefined): {
  visibility: Record<string, unknown>;
  sections: PreviewSection[];
} {
  if (!raw?.trim()) return { visibility: {}, sections: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return { visibility: {}, sections: [] };
    const visibility =
      parsed.visibility != null && isRecord(parsed.visibility)
        ? parsed.visibility
        : {};
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections.filter(isRecord)
      : [];
    return { visibility, sections };
  } catch {
    return { visibility: {}, sections: [] };
  }
}

function investorRowMatchKeys(row: DealInvestmentRow): string[] {
  return [
    row.id,
    row.contactId,
    row.profileId,
    row.userInvestorProfileId,
    row.offeringId,
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function investorRowMatchesDealClass(
  row: DealInvestmentRow,
  classId: string,
  classes: Array<{ id: string; name: string }>,
): boolean {
  const rowClass = String(row.investorClass ?? "").trim();
  if (!rowClass || rowClass === "—") return false;
  if (rowClass === classId) return true;
  const cls = classes.find((c) => c.id === classId);
  const className = String(cls?.name ?? "").trim();
  return Boolean(className && rowClass === className);
}

function lpMatchesSharedInvestorId(
  sharedId: string,
  lpRows: DealInvestmentRow[],
): boolean {
  const target = sharedId.trim().toLowerCase();
  if (!target) return false;
  return lpRows.some((row) => investorRowMatchKeys(row).includes(target));
}

export type CoSponsorDocumentVisibilityContext = {
  viewerUserIds: Set<string>;
  lpRows: DealInvestmentRow[];
  classes: Array<{ id: string; name: string }>;
};

export function nestedDocumentVisibleToCoSponsorRaw(
  doc: NestedDoc,
  ctx: CoSponsorDocumentVisibilityContext,
): boolean {
  const sponsorIds = parseIdList(doc.sharedSponsorUserIds);
  for (const id of sponsorIds) {
    if (ctx.viewerUserIds.has(id.toLowerCase())) return true;
  }

  const esignRowId = String(doc.esignInvestorRowId ?? "").trim();
  if (esignRowId && lpMatchesSharedInvestorId(esignRowId, ctx.lpRows)) {
    return true;
  }

  if (Boolean(doc.sharedWithAllInvestors)) return true;

  for (const id of parseIdList(doc.sharedInvestorIds)) {
    if (lpMatchesSharedInvestorId(id, ctx.lpRows)) return true;
  }

  for (const classId of parseIdList(doc.sharedDealClassIds)) {
    if (
      ctx.lpRows.some((row) =>
        investorRowMatchesDealClass(row, classId, ctx.classes),
      )
    ) {
      return true;
    }
  }

  return false;
}

export type LeadAdminDocumentVisibilityContext = {
  viewerUserIds: Set<string>;
};

export function nestedDocumentVisibleToLeadOrAdminRaw(
  doc: NestedDoc,
  ctx: LeadAdminDocumentVisibilityContext,
): boolean {
  if (doc.uploadedByIsCoSponsor !== true) return true;
  const sponsorIds = parseIdList(doc.sharedSponsorUserIds);
  for (const id of sponsorIds) {
    if (ctx.viewerUserIds.has(id.toLowerCase())) return true;
  }
  return false;
}

async function listViewerRosterShareKeys(
  dealId: string,
  viewerUserId: string,
): Promise<string[]> {
  try {
    const res = await pool.query<{ k: string }>(
    `SELECT DISTINCT trim(both from dm.contact_member_id) AS k
     FROM deal_member dm
     INNER JOIN users u ON u.id = $2::uuid
     WHERE dm.deal_id = $1::uuid
       AND trim(coalesce(dm.contact_member_id, '')) <> ''
       AND (
         trim(dm.contact_member_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from dm.contact_member_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
             AND trim(coalesce(c.email, '')) <> ''
         )
       )
     UNION
     SELECT DISTINCT trim(both from di.contact_id) AS k
     FROM deal_investment di
     INNER JOIN users u ON u.id = $2::uuid
     WHERE di.deal_id = $1::uuid
       AND trim(coalesce(di.contact_id, '')) <> ''
       AND trim(di.contact_id) <> $3
       AND (
         trim(di.contact_id) = u.id::text
         OR EXISTS (
           SELECT 1 FROM contact c
           WHERE c.id::text = trim(both from di.contact_id)
             AND lower(trim(c.email)) = lower(trim(u.email))
             AND trim(coalesce(c.email, '')) <> ''
         )
       )`,
    [dealId, viewerUserId, DEAL_INVESTMENT_AUTOSAVE_CONTACT],
    );
    return res.rows.map((r) => String(r.k ?? "").trim()).filter(Boolean);
  } catch (err) {
    console.warn("listViewerRosterShareKeys:", err);
    return [];
  }
}

export async function loadCoSponsorDocumentVisibilityContext(params: {
  dealId: string;
  viewerUserId: string;
}): Promise<CoSponsorDocumentVisibilityContext | null> {
  const dealId = params.dealId.trim();
  const viewerUserId = params.viewerUserId.trim();
  if (!dealId || !viewerUserId) return null;
  if (!(await isViewerCoSponsorOnDeal(dealId, viewerUserId))) return null;

  const [merged, classes, equivIds, rosterKeys] = await Promise.all([
    listMergedLpInvestorsForDeal(dealId),
    listInvestorClassesByDealId(dealId),
    listEquivalentPortalUserIdsForUsers([viewerUserId]),
    listViewerRosterShareKeys(dealId, viewerUserId),
  ]);
  const lpRows = await filterMergedLpInvestorsForCoSponsorViewer(
    dealId,
    viewerUserId,
    merged,
  );
  const viewerUserIds = new Set(
    [...equivIds, viewerUserId, ...rosterKeys]
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const row of lpRows) {
    const adder = String(
      (row as { addedByUserId?: string }).addedByUserId ?? "",
    )
      .trim()
      .toLowerCase();
    if (adder) viewerUserIds.add(adder);
  }

  return {
    viewerUserIds,
    lpRows,
    classes: classes.map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ""),
    })),
  };
}

export async function loadLeadAdminDocumentVisibilityContext(params: {
  dealId: string;
  viewerUserId: string;
}): Promise<LeadAdminDocumentVisibilityContext | null> {
  const dealId = params.dealId.trim();
  const viewerUserId = params.viewerUserId.trim();
  if (!dealId || !viewerUserId) return null;
  if (!(await isPortalUserLeadOrAdminSponsorOnDeal(dealId, viewerUserId))) {
    return null;
  }

  const [equivIds, rosterKeys] = await Promise.all([
    listEquivalentPortalUserIdsForUsers([viewerUserId]),
    listViewerRosterShareKeys(dealId, viewerUserId),
  ]);
  const viewerUserIds = new Set(
    [...equivIds, viewerUserId, ...rosterKeys]
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
  return { viewerUserIds };
}

const BUILT_IN_DOCUMENT_SECTION_IDS = new Set([
  "default-documents-section",
  "offering-documents-section",
  "monthly-reports-section",
  "quarterly-reports-section",
  "k1s-documents-section",
]);

function isBuiltInDocumentSectionId(section: PreviewSection): boolean {
  return BUILT_IN_DOCUMENT_SECTION_IDS.has(String(section.id ?? "").trim());
}

function filterSectionsByNestedVisibility(
  sections: PreviewSection[],
  visible: (d: NestedDoc) => boolean,
): PreviewSection[] {
  return sections
    .map((s) => ({
      ...s,
      nestedDocuments: nestedDocsOf(s).filter((d) => visible(d)),
    }))
    .filter(
      (s) => nestedDocsOf(s).length > 0 || isBuiltInDocumentSectionId(s),
    );
}

function canonicalFromParts(
  visibility: Record<string, unknown>,
  sections: PreviewSection[],
): string {
  return sanitizeOfferingInvestorPreviewBody({ visibility, sections });
}

/**
 * Co-sponsor: nested files limited to Shared With them or their investors.
 * Lead / admin sponsor: co-sponsor uploads omitted unless Shared With them.
 */
export async function scopeOfferingInvestorPreviewJsonForViewer(params: {
  dealId: string;
  viewerUserId: string;
  viewerRole?: string | null;
  json: string | null | undefined;
}): Promise<string | null> {
  const json = params.json ?? null;
  try {
    if (!json?.trim()) return json;
    const coCtx = await loadCoSponsorDocumentVisibilityContext({
      dealId: params.dealId,
      viewerUserId: params.viewerUserId,
    });
    if (coCtx) {
      const { visibility, sections } = parsePreviewParts(json);
      return canonicalFromParts(
        visibility,
        filterSectionsByNestedVisibility(sections, (d) =>
          nestedDocumentVisibleToCoSponsorRaw(d, coCtx),
        ),
      );
    }
    const leadCtx = await loadLeadAdminDocumentVisibilityContext({
      dealId: params.dealId,
      viewerUserId: params.viewerUserId,
    });
    if (!leadCtx) return json;
    const { visibility, sections } = parsePreviewParts(json);
    return canonicalFromParts(
      visibility,
      filterSectionsByNestedVisibility(sections, (d) =>
        nestedDocumentVisibleToLeadOrAdminRaw(d, leadCtx),
      ),
    );
  } catch (err) {
    console.warn("scopeOfferingInvestorPreviewJsonForViewer:", err);
    return json;
  }
}

function mergePreviewKeepingHiddenDocs(params: {
  existingJson: string | null | undefined;
  incomingCanonicalJson: string;
  isHidden: (d: NestedDoc) => boolean;
}): string {
  const existing = parsePreviewParts(params.existingJson);
  const incoming = parsePreviewParts(params.incomingCanonicalJson);

  const existingBySectionId = new Map(
    existing.sections
      .map((s) => [String(s.id ?? "").trim(), s] as const)
      .filter(([id]) => Boolean(id)),
  );
  const incomingBySectionId = new Map(
    incoming.sections
      .map((s) => [String(s.id ?? "").trim(), s] as const)
      .filter(([id]) => Boolean(id)),
  );

  const existingDocById = new Map<string, NestedDoc>();
  for (const sec of existing.sections) {
    for (const doc of nestedDocsOf(sec)) {
      const id = String(doc.id ?? "").trim();
      if (id) existingDocById.set(id, doc);
    }
  }

  const sectionIds: string[] = [];
  const seen = new Set<string>();
  for (const s of existing.sections) {
    const id = String(s.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sectionIds.push(id);
  }
  for (const s of incoming.sections) {
    const id = String(s.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sectionIds.push(id);
  }

  const mergedSections: PreviewSection[] = [];
  for (const sectionId of sectionIds) {
    const existingSec = existingBySectionId.get(sectionId);
    const incomingSec = incomingBySectionId.get(sectionId);
    const base = incomingSec ?? existingSec;
    if (!base) continue;

    const hiddenKept = existingSec
      ? nestedDocsOf(existingSec).filter((d) => params.isHidden(d))
      : [];

    const incomingVisible: NestedDoc[] = incomingSec
      ? nestedDocsOf(incomingSec).filter((d) => {
          const id = String(d.id ?? "").trim();
          const prior = id ? existingDocById.get(id) : undefined;
          if (prior && params.isHidden(prior)) {
            return false;
          }
          return true;
        })
      : [];

    const mergedDocs = [...hiddenKept];
    const hiddenIds = new Set(
      hiddenKept.map((d) => String(d.id ?? "").trim()).filter(Boolean),
    );
    for (const doc of incomingVisible) {
      const id = String(doc.id ?? "").trim();
      if (id && hiddenIds.has(id)) continue;
      mergedDocs.push(doc);
    }

    if (mergedDocs.length === 0 && !incomingSec) continue;

    mergedSections.push({
      ...base,
      nestedDocuments: mergedDocs,
    });
  }

  return canonicalFromParts(incoming.visibility, mergedSections);
}

/**
 * PATCH must not drop files the viewer cannot see. Hidden docs stay in their
 * existing sections; visible docs follow the incoming payload.
 */
export async function mergeCoSponsorOfferingInvestorPreviewJson(params: {
  dealId: string;
  viewerUserId: string;
  viewerRole?: string | null;
  existingJson: string | null | undefined;
  incomingCanonicalJson: string;
}): Promise<string> {
  const coCtx = await loadCoSponsorDocumentVisibilityContext({
    dealId: params.dealId,
    viewerUserId: params.viewerUserId,
  });
  if (coCtx) {
    return mergePreviewKeepingHiddenDocs({
      existingJson: params.existingJson,
      incomingCanonicalJson: params.incomingCanonicalJson,
      isHidden: (d) => !nestedDocumentVisibleToCoSponsorRaw(d, coCtx),
    });
  }
  const leadCtx = await loadLeadAdminDocumentVisibilityContext({
    dealId: params.dealId,
    viewerUserId: params.viewerUserId,
  });
  if (!leadCtx) return params.incomingCanonicalJson;
  return mergePreviewKeepingHiddenDocs({
    existingJson: params.existingJson,
    incomingCanonicalJson: params.incomingCanonicalJson,
    isHidden: (d) => !nestedDocumentVisibleToLeadOrAdminRaw(d, leadCtx),
  });
}
