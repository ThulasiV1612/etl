/**
 * Deal Documents tab: sections with nested files.
 * Flat offering preview docs are derived for investor preview + legacy storage.
 */

import { formatDateDdMmmYyyy } from "../../../../common/utils/formatDateDisplay"
import type {
  OfferingPreviewDocSharedWithScope,
  OfferingPreviewDocument,
} from "./offeringPreviewDocuments"
import {
  parseOfferingPreviewDocumentsJson,
  readOfferingPreviewDocuments,
  writeOfferingPreviewDocuments,
} from "./offeringPreviewDocuments"
import {
  getRuntimeOfferingPreviewSections,
  setRuntimeOfferingPreviewSections,
} from "./offeringPreviewRuntimeStore"
import { readLegacyOfferingPreviewDocumentsFromLocalStorage } from "./offeringPreviewLegacyLocalStorage"

/** Fired after `writeOfferingPreviewSections` (same tab + other tabs via storage). */
export const OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT =
  "ip-offering-preview-sections-changed"

/** Stable id for cross-tab custom events (no longer a localStorage key). */
export function offeringPreviewSectionsStorageKey(dealId: string): string {
  return `ip_offering_preview_sections:v1:${dealId.trim()}`
}

export type OfferingPreviewDisplayDocument = {
  id: string
  name: string
  url: string | null
}

/**
 * Which document scopes appear on a given surface.
 * - Offering link + Preview offering: `offering_page` only.
 * - LP portal (signed-in LP on the deal): `offering_page` and `lp_investor`.
 * - `not_visible`: never on offering link, preview, or LP portal.
 */
export function sectionVisibleOnOfferingPreview(
  scope: SectionSharedWithScope,
  ctx: { isPublicAnonymousOffering: boolean; isLpDealWorkspace: boolean },
): boolean {
  if (scope === "not_visible") return false
  if (ctx.isLpDealWorkspace) {
    return scope === "offering_page" || scope === "lp_investor"
  }
  return scope === "offering_page"
}

/**
 * Documents from the deal Documents tab (workspace sections) for offering preview.
 * Replaces the removed Offering details → Documents section.
 */
export function listWorkspaceDocumentsForOfferingPreview(
  dealId: string,
  ctx: { isPublicAnonymousOffering: boolean; isLpDealWorkspace: boolean },
): OfferingPreviewDisplayDocument[] {
  const id = dealId.trim()
  if (!id) return []
  const sections = readOfferingPreviewSections(id)
  const out: OfferingPreviewDisplayDocument[] = []
  const seenIds = new Set<string>()

  const tryAdd = (doc: { id: string; name: string; url: string | null }) => {
    const docId = doc.id.trim()
    if (!docId || seenIds.has(docId)) return
    if (offeringPreviewDocumentExcludedFromInvestorOffering(doc, sections)) return
    seenIds.add(docId)
    out.push({ id: doc.id, name: doc.name, url: doc.url })
  }

  for (const sec of sections) {
    if (isEsignTemplateDocumentsSection(sec)) continue
    for (const d of sec.nestedDocuments) {
      if (isInvestorEsignWorkspaceDocument(d)) continue
      const scope = effectiveDocumentSharedWithScope(d, sec)
      if (!sectionVisibleOnOfferingPreview(scope, ctx)) continue
      tryAdd(d)
    }
  }

  if (out.length === 0) {
    for (const d of readOfferingPreviewDocuments(id)) {
      const scope = resolveFlatDocumentSharedWithScope(d.sharedWithScope)
      if (!sectionVisibleOnOfferingPreview(scope, ctx)) continue
      tryAdd(d)
    }
  }

  return out
}

/** Who can see documents in this section (documents table + preview context). */
export type SectionSharedWithScope = OfferingPreviewDocSharedWithScope

export function sectionSharedWithDisplay(scope: SectionSharedWithScope): string {
  if (scope === "not_visible") return "Hidden by default"
  if (scope === "lp_investor") return "LP portal only"
  return "Offering link"
}

/** Map a flat/legacy document scope string to the three-value Visibility enum. */
export function resolveFlatDocumentSharedWithScope(
  raw: OfferingPreviewDocSharedWithScope | string | undefined | null,
): SectionSharedWithScope {
  if (raw === "lp_investor") return "lp_investor"
  if (raw === "not_visible") return "not_visible"
  return "offering_page"
}

/** Per-document scope when set; otherwise the section default. */
export function effectiveDocumentSharedWithScope(
  doc: NestedPreviewDocument,
  section: OfferingPreviewSection,
): SectionSharedWithScope {
  return doc.sharedWithScope ?? section.sharedWithScope
}

function parseSharedWithScope(
  rawScope: unknown,
  legacyVisibility: string,
): SectionSharedWithScope {
  if (rawScope === "lp_investor") return "lp_investor"
  if (rawScope === "offering_page") return "offering_page"
  if (rawScope === "not_visible") return "not_visible"
  const vis = legacyVisibility.trim().toLowerCase()
  if (vis.includes("not visible") || vis.includes("hidden by default"))
    return "not_visible"
  if (vis.includes("lp") && vis.includes("investor")) return "lp_investor"
  if (vis.includes("offering") && (vis.includes("link") || vis.includes("page")))
    return "offering_page"
  return "offering_page"
}

function parseDocumentSharedWithScope(raw: unknown): SectionSharedWithScope | undefined {
  if (raw === "lp_investor") return "lp_investor"
  if (raw === "offering_page") return "offering_page"
  if (raw === "not_visible") return "not_visible"
  return undefined
}

export type NestedPreviewDocument = {
  id: string
  name: string
  url: string | null
  dateAdded: string
  /**
   * Which user-added section supplies the LP-visible label for this file.
   * Preview shows: "{that section's label} — {filename}".
   */
  lpDisplaySectionId: string
  /**
   * Optional LP audience: deal investor-class ids. Empty means no class-specific selection.
   */
  sharedDealClassIds: string[]
  /**
   * Optional LP audience: deal investor row ids. Empty means no investor-specific selection.
   */
  sharedInvestorIds: string[]
  /**
   * When true, the document is intended for every investor on the deal (deal members and
   * contacts from the Investors list). Individual `sharedInvestorIds` are ignored.
   */
  sharedWithAllInvestors: boolean
  /** Sponsor team members (deal members) who may access this file in the workspace. */
  sharedSponsorUserIds: string[]
  /**
   * Overrides the section scope for this file when set.
   * `offering_page`: offering link + preview (+ LPs when signed in).
   * `lp_investor`: LP portal only.
   * `not_visible` / Hidden by default: sponsor workspace only.
   */
  sharedWithScope?: SectionSharedWithScope
  /**
   * When true, LP portal investors may see this file only after completing eSign
   * on at least one commitment for this deal (Funding Information PDFs).
   */
  requiresProfileInvestment?: boolean
  /** When Shared With recipients were last set (ISO). Used for investor inbox timestamps. */
  sharedAt?: string
  /** Present on auto-synced investor eSign PDFs in Investor e signatures section. */
  esignSignatureRequestId?: string
  esignInvestorRowId?: string
  esignInvestorRowTable?: "investment" | "lp"
  esignTemplateFileId?: string
  esignAwaitingSponsorSignature?: boolean
  esignSponsorSigned?: boolean
  /** Portal user who uploaded this file from the Documents tab. */
  uploadedByUserId?: string
  /** Co-sponsor uploads stay hidden from lead / admin sponsors unless shared with them. */
  uploadedByIsCoSponsor?: boolean
}

/** True when Shared With has at least one recipient / All Investors. */
export function nestedDocumentHasSharedAudience(
  doc: Pick<
    NestedPreviewDocument,
    | "sharedDealClassIds"
    | "sharedInvestorIds"
    | "sharedWithAllInvestors"
    | "sharedSponsorUserIds"
  >,
): boolean {
  if (doc.sharedWithAllInvestors) return true
  if (doc.sharedDealClassIds.length > 0) return true
  if (doc.sharedInvestorIds.length > 0) return true
  if ((doc.sharedSponsorUserIds?.length ?? 0) > 0) return true
  return false
}

export type OfferingPreviewSection = {
  id: string
  sectionLabel: string
  documentLabel: string
  /** Kept in sync with `sharedWithScope` for search / legacy fields. */
  visibility: string
  sharedWithScope: SectionSharedWithScope
  requireLpReview: boolean
  dateAdded: string
  nestedDocuments: NestedPreviewDocument[]
}

export function sectionDisplayLabel(s: OfferingPreviewSection): string {
  const a = s.sectionLabel.trim()
  if (a) return a
  const b = s.documentLabel.trim()
  return b && b !== "—" ? b : "Section"
}

/** Stable id for quick uploads (click / drag) when no section is chosen. */
export const DEFAULT_DOCUMENT_SECTION_ID = "default-documents-section"

/** Label shown in the Documents tab for the default section. */
export const DEFAULT_DOCUMENT_SECTION_LABEL = "General"

export const OFFERING_DOCUMENTS_SECTION_ID = "offering-documents-section"
export const OFFERING_DOCUMENTS_SECTION_LABEL = "Offering Documents"

export const MONTHLY_REPORTS_SECTION_ID = "monthly-reports-section"
export const MONTHLY_REPORTS_SECTION_LABEL = "Monthly Reports"

export const QUARTERLY_REPORTS_SECTION_ID = "quarterly-reports-section"
export const QUARTERLY_REPORTS_SECTION_LABEL = "Quarterly Reports"

export const K1S_DOCUMENTS_SECTION_ID = "k1s-documents-section"
export const K1S_DOCUMENTS_SECTION_LABEL = "K1's"

/** Built-in document sections in canonical display order (excludes auto-managed). */
export const BUILT_IN_DOCUMENT_SECTION_DEFS = [
  {
    id: DEFAULT_DOCUMENT_SECTION_ID,
    sectionLabel: DEFAULT_DOCUMENT_SECTION_LABEL,
    editable: false,
  },
  {
    id: OFFERING_DOCUMENTS_SECTION_ID,
    sectionLabel: OFFERING_DOCUMENTS_SECTION_LABEL,
    editable: true,
  },
  {
    id: MONTHLY_REPORTS_SECTION_ID,
    sectionLabel: MONTHLY_REPORTS_SECTION_LABEL,
    editable: true,
  },
  {
    id: QUARTERLY_REPORTS_SECTION_ID,
    sectionLabel: QUARTERLY_REPORTS_SECTION_LABEL,
    editable: true,
  },
  {
    id: K1S_DOCUMENTS_SECTION_ID,
    sectionLabel: K1S_DOCUMENTS_SECTION_LABEL,
    editable: true,
  },
] as const

const BUILT_IN_DOCUMENT_SECTION_IDS = new Set<string>(
  BUILT_IN_DOCUMENT_SECTION_DEFS.map((d) => d.id),
)

function builtInSectionLabelKey(label: string): string {
  return label.trim().toLowerCase()
}

const BUILT_IN_DOCUMENT_SECTION_LABEL_KEYS = new Set(
  BUILT_IN_DOCUMENT_SECTION_DEFS.map((d) => builtInSectionLabelKey(d.sectionLabel)),
)

/** Auto-managed section for investor-completed eSign PDFs. */
export const ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID =
  "esign-template-documents-section"

export const ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL = "Investor e signatures"

const LEGACY_ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL = "Esign template"

/** Auto-managed section for sponsor-saved funding instructions PDF. */
export const FUNDING_INFORMATION_DOCUMENTS_SECTION_ID =
  "funding-information-documents-section"

export const FUNDING_INFORMATION_DOCUMENTS_SECTION_LABEL =
  "Funding Information"

/** Legacy single-doc id; new saves use `${prefix}-${timestamp}`. */
export const FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID =
  "funding-instructions-auto-pdf"

export const FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX =
  FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID

export function isFundingInstructionsAutoPdfDocument(
  doc: Pick<OfferingPreviewDocument, "id"> | { id?: string | null },
): boolean {
  const id = String(doc.id ?? "").trim()
  if (!id) return false
  return (
    id === FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX ||
    id.startsWith(`${FUNDING_INSTRUCTIONS_AUTO_PDF_DOC_ID_PREFIX}-`)
  )
}

function normalizeEsignSectionLabelKey(label: string): string {
  return label.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ")
}

export function isEsignTemplateSectionLabel(label: string): boolean {
  const normalized = normalizeEsignSectionLabelKey(label)
  if (!normalized) return false
  return (
    normalized ===
      normalizeEsignSectionLabelKey(ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL) ||
    normalized ===
      normalizeEsignSectionLabelKey(LEGACY_ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL)
  )
}

export function isEsignTemplateDocumentsSection(
  s: OfferingPreviewSection,
): boolean {
  if (s.id === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID) return true
  const idLower = s.id.trim().toLowerCase()
  if (idLower.startsWith("recovered-investor-e-signature")) return true
  return isEsignTemplateSectionLabel(sectionDisplayLabel(s))
}

/** True when a section group must not appear on investor Offering Documents. */
export function isInvestorOfferingDocumentSectionExcluded(
  sectionId: string,
  sectionLabel: string,
): boolean {
  if (sectionId.trim() === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID) return true
  const idLower = sectionId.trim().toLowerCase()
  if (idLower.startsWith("recovered-investor-e-signature")) return true
  return isEsignTemplateSectionLabel(sectionLabel)
}

/** Auto-synced signed PDFs in the sponsor Documents tab — not LP-offered. */
export function isInvestorEsignWorkspaceDocument(
  doc: Pick<
    NestedPreviewDocument,
    | "esignSignatureRequestId"
    | "lpDisplaySectionId"
    | "esignInvestorRowId"
    | "esignTemplateFileId"
  >,
): boolean {
  if (doc.esignSignatureRequestId?.trim()) return true
  if (doc.esignInvestorRowId?.trim()) return true
  if (doc.esignTemplateFileId?.trim()) return true
  const lpSectionId = doc.lpDisplaySectionId?.trim()
  if (!lpSectionId) return false
  if (lpSectionId === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID) return true
  return lpSectionId.toLowerCase().startsWith("recovered-investor-e-signature")
}

export function isFundingInformationDocumentsSection(
  s: OfferingPreviewSection,
): boolean {
  if (s.id === FUNDING_INFORMATION_DOCUMENTS_SECTION_ID) return true
  return (
    sectionDisplayLabel(s).trim().toLowerCase() ===
    FUNDING_INFORMATION_DOCUMENTS_SECTION_LABEL.toLowerCase()
  )
}

export function isAutoManagedDocumentsSection(
  s: OfferingPreviewSection,
): boolean {
  return (
    isEsignTemplateDocumentsSection(s) ||
    isFundingInformationDocumentsSection(s)
  )
}

/** Parse document sections from `offering_investor_preview_json` on the deal row. */
export function parseDocumentSectionsFromPreviewJson(
  json: string | null | undefined,
): OfferingPreviewSection[] {
  if (!json?.trim()) return []
  try {
    const parsed = JSON.parse(json) as { sections?: unknown }
    return parseOfferingPreviewSectionsJson(parsed.sections)
  } catch {
    return []
  }
}

/**
 * Sponsors always manage auto-managed sections (Funding Information PDF, eSign)
 * in the Documents tab. Merge them from the server/runtime snapshot so local
 * edits cannot drop them on autosave.
 */
export function mergeAutoManagedDocumentSections(
  localSections: OfferingPreviewSection[],
  dealId: string,
  previewJson?: string | null,
  opts?: { preferPreviewJson?: boolean },
): OfferingPreviewSection[] {
  const id = dealId.trim()
  const fromJson = parseDocumentSectionsFromPreviewJson(previewJson).filter(
    isAutoManagedDocumentsSection,
  )
  const fromWorkspace = id
    ? readDealDocumentSectionsForWorkspace(id).filter(isAutoManagedDocumentsSection)
    : []
  const autoById = new Map<string, OfferingPreviewSection>()
  for (const section of fromJson) {
    autoById.set(section.id, section)
  }
  for (const section of fromWorkspace) {
    const existing = autoById.get(section.id)
    if (!existing) {
      autoById.set(section.id, section)
      continue
    }
    if (opts?.preferPreviewJson) continue
    if (section.nestedDocuments.length >= existing.nestedDocuments.length) {
      autoById.set(section.id, section)
    }
  }
  const autoManaged = [...autoById.values()]
  if (autoManaged.length === 0) return localSections

  const byId = new Map(localSections.map((s) => [s.id, s]))
  let changed = false
  for (const section of autoManaged) {
    const prev = byId.get(section.id)
    if (
      !prev ||
      documentSectionsSnapshot([prev]) !== documentSectionsSnapshot([section])
    ) {
      changed = true
    }
    byId.set(section.id, section)
  }
  if (!changed) return localSections

  return orderDocumentSectionsWithDefaultFirst(
    consolidateInvestorEsignDocumentsIntoAutoSection([...byId.values()]),
  )
}

/** Stable JSON snapshot for comparing document section lists. */
export function documentSectionsSnapshot(
  sections: OfferingPreviewSection[],
): string {
  return JSON.stringify(sections)
}

export function documentSectionsEqual(
  a: OfferingPreviewSection[],
  b: OfferingPreviewSection[],
): boolean {
  return documentSectionsSnapshot(a) === documentSectionsSnapshot(b)
}

/** True when the auto-generated funding instructions PDF is present on the deal. */
export function hasFundingInformationDocumentsSection(
  sections: OfferingPreviewSection[],
): boolean {
  const section = sections.find(isFundingInformationDocumentsSection)
  if (!section) return false
  return section.nestedDocuments.some(
    (d) => isFundingInstructionsAutoPdfDocument(d) && Boolean(d.url?.trim()),
  )
}

/**
 * After saving Funding Information, mirror the Funding Information documents
 * section from preview JSON into the sponsor Documents tab workspace.
 */
export function applyFundingInformationDocumentsSectionFromPreview(
  dealId: string,
  previewJson: string | null | undefined,
): boolean {
  const id = dealId.trim()
  if (!id) return false
  const fromJson = parseDocumentSectionsFromPreviewJson(previewJson)
  const fundingSection = fromJson.find(isFundingInformationDocumentsSection)
  if (
    !fundingSection ||
    !hasFundingInformationDocumentsSection([fundingSection])
  ) {
    return false
  }

  const current = readDealDocumentSectionsForWorkspace(id)
  const withoutFunding = current.filter(
    (s) => !isFundingInformationDocumentsSection(s),
  )
  const next = orderDocumentSectionsWithDefaultFirst([
    ...withoutFunding,
    fundingSection,
  ])
  writeOfferingPreviewSections(id, next)
  return true
}

export function isDefaultDocumentSection(s: OfferingPreviewSection): boolean {
  if (s.id === DEFAULT_DOCUMENT_SECTION_ID) return true
  return (
    builtInSectionLabelKey(s.sectionLabel) ===
    builtInSectionLabelKey(DEFAULT_DOCUMENT_SECTION_LABEL)
  )
}

export function isBuiltInDocumentSection(s: OfferingPreviewSection): boolean {
  if (BUILT_IN_DOCUMENT_SECTION_IDS.has(s.id)) return true
  return BUILT_IN_DOCUMENT_SECTION_LABEL_KEYS.has(
    builtInSectionLabelKey(sectionDisplayLabel(s)),
  )
}

export function isBuiltInDocumentSectionLabelEditable(
  s: OfferingPreviewSection,
): boolean {
  if (isAutoManagedDocumentsSection(s)) return false
  if (!isBuiltInDocumentSection(s)) return true
  return !isDefaultDocumentSection(s)
}

export function builtInDocumentSectionDef(
  s: OfferingPreviewSection,
): (typeof BUILT_IN_DOCUMENT_SECTION_DEFS)[number] | undefined {
  const byId = BUILT_IN_DOCUMENT_SECTION_DEFS.find((d) => d.id === s.id)
  if (byId) return byId
  const key = builtInSectionLabelKey(sectionDisplayLabel(s))
  return BUILT_IN_DOCUMENT_SECTION_DEFS.find(
    (d) => builtInSectionLabelKey(d.sectionLabel) === key,
  )
}

export function findDefaultDocumentSection(
  sections: OfferingPreviewSection[],
): OfferingPreviewSection | undefined {
  return sections.find(isDefaultDocumentSection)
}

function createEmptyBuiltInSection(
  def: (typeof BUILT_IN_DOCUMENT_SECTION_DEFS)[number],
): OfferingPreviewSection {
  return {
    id: def.id,
    sectionLabel: def.sectionLabel,
    documentLabel: def.sectionLabel,
    visibility: sectionSharedWithDisplay("offering_page"),
    sharedWithScope: "offering_page",
    requireLpReview: false,
    dateAdded: formatDateDdMmmYyyy(new Date()),
    nestedDocuments: [],
  }
}

function createEmptyEsignTemplateDocumentsSection(): OfferingPreviewSection {
  return {
    id: ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
    sectionLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
    documentLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
    visibility: sectionSharedWithDisplay("offering_page"),
    sharedWithScope: "offering_page",
    requireLpReview: false,
    dateAdded: formatDateDdMmmYyyy(new Date()),
    nestedDocuments: [],
  }
}

/**
 * Investor eSign PDFs must live only in the auto-managed Investor e signatures section.
 * Removes them from Offering Documents / other sections where reconcile or legacy saves misplaced them.
 */
export function consolidateInvestorEsignDocumentsIntoAutoSection(
  sections: OfferingPreviewSection[],
): OfferingPreviewSection[] {
  const esignDocsById = new Map<string, NestedPreviewDocument>()
  for (const section of sections) {
    for (const doc of section.nestedDocuments) {
      if (!isInvestorEsignWorkspaceDocument(doc)) continue
      const id = doc.id.trim()
      if (!id) continue
      esignDocsById.set(id, {
        ...doc,
        lpDisplaySectionId: ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID,
      })
    }
  }

  const stripped = sections
    .filter((s) => !isEsignTemplateDocumentsSection(s))
    .map((s) => ({
      ...s,
      nestedDocuments: s.nestedDocuments.filter(
        (d) => !isInvestorEsignWorkspaceDocument(d),
      ),
    }))

  if (esignDocsById.size === 0) return stripped

  const prior = sections.find((s) => s.id === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID)
  stripped.push({
    ...(prior ?? createEmptyEsignTemplateDocumentsSection()),
    sectionLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
    documentLabel: ESIGN_TEMPLATE_DOCUMENTS_SECTION_LABEL,
    nestedDocuments: [...esignDocsById.values()],
  })

  return stripped
}

/** Ensures the default section exists; returns updated list + that section row. */
export function ensureDefaultDocumentSectionInList(
  sections: OfferingPreviewSection[],
): {
  sections: OfferingPreviewSection[]
  defaultSection: OfferingPreviewSection
} {
  const { sections: withBuiltIns, defaultSection } =
    ensureBuiltInDocumentSectionsInList(sections)
  return { sections: withBuiltIns, defaultSection }
}

/** Ensures all built-in sections exist (General through K1's). */
export function ensureBuiltInDocumentSectionsInList(
  sections: OfferingPreviewSection[],
): {
  sections: OfferingPreviewSection[]
  defaultSection: OfferingPreviewSection
} {
  const byId = new Map(sections.map((s) => [s.id, s]))
  let next = [...sections]
  for (const def of BUILT_IN_DOCUMENT_SECTION_DEFS) {
    if (!byId.has(def.id)) {
      const row = createEmptyBuiltInSection(def)
      byId.set(def.id, row)
      next = [...next, row]
    }
  }
  const defaultSection =
    byId.get(DEFAULT_DOCUMENT_SECTION_ID) ??
    createEmptyBuiltInSection(BUILT_IN_DOCUMENT_SECTION_DEFS[0]!)
  return { sections: next, defaultSection }
}

/**
 * Canonical order: built-in sections, user-created sections, auto-managed at end.
 */
export function orderDocumentSections(
  sections: OfferingPreviewSection[],
): OfferingPreviewSection[] {
  const { sections: withBuiltIns } = ensureBuiltInDocumentSectionsInList(sections)
  const byId = new Map(withBuiltIns.map((s) => [s.id, s]))
  const builtIn = BUILT_IN_DOCUMENT_SECTION_DEFS.map(
    (def) => byId.get(def.id) ?? createEmptyBuiltInSection(def),
  )
  const builtInIds = new Set<string>(
    BUILT_IN_DOCUMENT_SECTION_DEFS.map((d) => d.id),
  )
  const autoManaged = withBuiltIns.filter(isAutoManagedDocumentsSection)
  const autoIds = new Set(autoManaged.map((s) => s.id))
  const custom = withBuiltIns.filter(
    (s) => !builtInIds.has(s.id) && !autoIds.has(s.id),
  )
  return [...builtIn, ...custom, ...autoManaged]
}

/** @deprecated Use {@link orderDocumentSections}. */
export function orderDocumentSectionsWithDefaultFirst(
  sections: OfferingPreviewSection[],
): OfferingPreviewSection[] {
  return orderDocumentSections(sections)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function parseIdListField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim())
}

function normalizeNested(
  raw: unknown,
  parentSectionId: string,
): NestedPreviewDocument | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : ""
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : typeof raw.documentName === "string" && raw.documentName.trim()
        ? raw.documentName.trim()
        : ""
  if (!id || !name) return null
  const urlRaw = raw.url
  const url =
    typeof urlRaw === "string" && urlRaw.trim()
      ? urlRaw.trim()
      : urlRaw === null
        ? null
        : null
  const dateAdded =
    typeof raw.dateAdded === "string" && raw.dateAdded.trim()
      ? raw.dateAdded.trim()
      : "—"
  const refRaw = raw.lpDisplaySectionId
  const lpDisplaySectionId =
    typeof refRaw === "string" && refRaw.trim() ? refRaw.trim() : parentSectionId
  const sharedDealClassIds = parseIdListField(raw.sharedDealClassIds)
  const sharedWithAllInvestors = Boolean(raw.sharedWithAllInvestors)
  const sharedInvestorIds = sharedWithAllInvestors
    ? []
    : parseIdListField(raw.sharedInvestorIds)
  const sharedSponsorUserIds = parseIdListField(raw.sharedSponsorUserIds)
  const sharedWithScope = parseDocumentSharedWithScope(raw.sharedWithScope)
  const requiresProfileInvestment = Boolean(raw.requiresProfileInvestment)
  const esignSignatureRequestId =
    typeof raw.esignSignatureRequestId === "string" &&
    raw.esignSignatureRequestId.trim()
      ? raw.esignSignatureRequestId.trim()
      : undefined
  const esignInvestorRowId =
    typeof raw.esignInvestorRowId === "string" && raw.esignInvestorRowId.trim()
      ? raw.esignInvestorRowId.trim()
      : undefined
  const esignInvestorRowTable =
    raw.esignInvestorRowTable === "investment" || raw.esignInvestorRowTable === "lp"
      ? raw.esignInvestorRowTable
      : undefined
  const esignTemplateFileId =
    typeof raw.esignTemplateFileId === "string" && raw.esignTemplateFileId.trim()
      ? raw.esignTemplateFileId.trim()
      : undefined
  const esignAwaitingSponsorSignature = Boolean(raw.esignAwaitingSponsorSignature)
  const esignSponsorSigned = Boolean(raw.esignSponsorSigned)
  const uploadedByUserId =
    typeof raw.uploadedByUserId === "string" && raw.uploadedByUserId.trim()
      ? raw.uploadedByUserId.trim()
      : undefined
  const uploadedByIsCoSponsor = raw.uploadedByIsCoSponsor === true
  const sharedAtRaw =
    typeof raw.sharedAt === "string" && raw.sharedAt.trim()
      ? raw.sharedAt.trim()
      : ""
  const sharedAtMs = sharedAtRaw ? Date.parse(sharedAtRaw) : Number.NaN
  return {
    id,
    name,
    url,
    dateAdded,
    lpDisplaySectionId,
    sharedDealClassIds,
    sharedInvestorIds,
    sharedWithAllInvestors,
    sharedSponsorUserIds,
    ...(Number.isFinite(sharedAtMs) ? { sharedAt: new Date(sharedAtMs).toISOString() } : {}),
    ...(sharedWithScope ? { sharedWithScope } : {}),
    ...(requiresProfileInvestment ? { requiresProfileInvestment: true } : {}),
    ...(esignSignatureRequestId ? { esignSignatureRequestId } : {}),
    ...(esignInvestorRowId ? { esignInvestorRowId } : {}),
    ...(esignInvestorRowTable ? { esignInvestorRowTable } : {}),
    ...(esignTemplateFileId ? { esignTemplateFileId } : {}),
    ...(esignAwaitingSponsorSignature ? { esignAwaitingSponsorSignature: true } : {}),
    ...(esignSponsorSigned ? { esignSponsorSigned: true } : {}),
    ...(uploadedByUserId ? { uploadedByUserId } : {}),
    ...(uploadedByIsCoSponsor ? { uploadedByIsCoSponsor: true } : {}),
  }
}

function normalizeSection(raw: unknown): OfferingPreviewSection | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : ""
  const sectionLabel =
    typeof raw.sectionLabel === "string" && raw.sectionLabel.trim()
      ? raw.sectionLabel.trim()
      : typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : ""
  const documentLabel =
    typeof raw.documentLabel === "string" && raw.documentLabel.trim()
      ? raw.documentLabel.trim()
      : sectionLabel || "—"
  if (!id || !sectionLabel) return null
  const legacyVisibility =
    typeof raw.visibility === "string" && raw.visibility.trim()
      ? raw.visibility.trim()
      : "Offering page"
  const sharedWithScope = parseSharedWithScope(raw.sharedWithScope, legacyVisibility)
  const visibility = sectionSharedWithDisplay(sharedWithScope)
  const requireLpReview = Boolean(raw.requireLpReview)
  const dateAdded =
    typeof raw.dateAdded === "string" && raw.dateAdded.trim()
      ? raw.dateAdded.trim()
      : "—"
  const nestedRaw = raw.nestedDocuments
  const nestedDocuments: NestedPreviewDocument[] = []
  if (Array.isArray(nestedRaw)) {
    for (const item of nestedRaw) {
      const n = normalizeNested(item, id)
      if (n) nestedDocuments.push(n)
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
  }
}

function normalizeSectionsArray(parsed: unknown): OfferingPreviewSection[] {
  if (!Array.isArray(parsed)) return []
  const out: OfferingPreviewSection[] = []
  for (const item of parsed) {
    const s = normalizeSection(item)
    if (s) out.push(s)
  }
  return out
}

/** Ensure each nested doc’s lpDisplaySectionId points at a real section on this deal. */
function sanitizeSections(list: OfferingPreviewSection[]): OfferingPreviewSection[] {
  const ids = new Set(list.map((s) => s.id))
  const mapped = list.map((s) => {
    const sharedWithScope: OfferingPreviewDocSharedWithScope =
      s.sharedWithScope === "lp_investor" ? "lp_investor" : "offering_page"
    return {
      ...s,
      sharedWithScope,
      visibility: sectionSharedWithDisplay(sharedWithScope),
      nestedDocuments: s.nestedDocuments.map((d) => {
        const sharedWithAllInvestors = Boolean(d.sharedWithAllInvestors)
        const docScope = parseDocumentSharedWithScope(d.sharedWithScope)
        const requiresProfileInvestment = Boolean(d.requiresProfileInvestment)
        return {
          ...d,
          lpDisplaySectionId: ids.has(d.lpDisplaySectionId) ? d.lpDisplaySectionId : s.id,
          sharedDealClassIds: parseIdListField(d.sharedDealClassIds),
          sharedInvestorIds: sharedWithAllInvestors
            ? []
            : parseIdListField(d.sharedInvestorIds),
          sharedWithAllInvestors,
          sharedSponsorUserIds: parseIdListField(d.sharedSponsorUserIds),
          ...(docScope ? { sharedWithScope: docScope } : {}),
          ...(requiresProfileInvestment ? { requiresProfileInvestment: true } : {}),
        }
      }),
    }
  })
  return orderDocumentSections(consolidateInvestorEsignDocumentsIntoAutoSection(mapped))
}

export function migrateFlatDocumentsToSections(
  flat: OfferingPreviewDocument[],
): OfferingPreviewSection[] {
  return sanitizeSections(migrateFlatToSections(flat))
}

function migrateFlatToSections(flat: OfferingPreviewDocument[]): OfferingPreviewSection[] {
  if (flat.length === 0) return []
  const reconciled = reconcileFlatDocumentsIntoSections([], flat)
  const assignedIds = new Set(
    reconciled.flatMap((s) => s.nestedDocuments.map((d) => d.id.trim())),
  )
  const orphans = flat.filter(
    (d) => d.id.trim() && !assignedIds.has(d.id.trim()),
  )
  if (orphans.length === 0) {
    return reconciled
  }

  const { sections, defaultSection } = ensureDefaultDocumentSectionInList(reconciled)
  const next = sections.map((s) => {
    if (s.id !== defaultSection.id) return s
    const nestedDocuments: NestedPreviewDocument[] = [
      ...s.nestedDocuments,
      ...orphans.map((d) => ({
        id: d.id,
        name: d.name,
        url: d.url,
        dateAdded: d.dateAdded?.trim() || "—",
        lpDisplaySectionId: defaultSection.id,
        sharedDealClassIds: [],
        sharedInvestorIds: [],
        sharedWithAllInvestors: false,
        sharedSponsorUserIds: [],
        ...(d.sharedWithScope ? { sharedWithScope: d.sharedWithScope } : {}),
      })),
    ]
    return { ...s, nestedDocuments }
  })
  return next
}

function previewDocDisplayName(
  sections: OfferingPreviewSection[],
  parent: OfferingPreviewSection,
  d: NestedPreviewDocument,
): string {
  const ref =
    sections.find((sec) => sec.id === d.lpDisplaySectionId) ?? parent
  const labelPart = sectionDisplayLabel(ref)
  const nm = d.name.trim()
  return `${labelPart} — ${nm}`
}

/** Parse composite flat name `{sectionLabel} — {fileName}` from preview flattening. */
export function parseFlatDocumentDisplayName(name: string): {
  sectionLabel: string
  fileName: string
} {
  for (const sep of [" — ", " – ", " - "] as const) {
    const idx = name.indexOf(sep)
    if (idx > 0) {
      const sectionLabel = name.slice(0, idx).trim()
      const fileName = name.slice(idx + sep.length).trim()
      return {
        sectionLabel,
        fileName: fileName || name.trim() || "Document",
      }
    }
  }
  return { sectionLabel: "", fileName: name.trim() || "Document" }
}

export function findNestedPreviewDocumentById(
  sections: OfferingPreviewSection[],
  documentId: string,
): NestedPreviewDocument | undefined {
  const id = documentId.trim()
  if (!id) return undefined
  for (const sec of sections) {
    const match = sec.nestedDocuments.find((d) => d.id.trim() === id)
    if (match) return match
  }
  return undefined
}

/** Flat or nested preview docs that belong in Investor e signatures — hidden from offering lists. */
export function offeringPreviewDocumentExcludedFromInvestorOffering(
  doc: { id: string; name: string },
  sections: OfferingPreviewSection[],
): boolean {
  const id = doc.id.trim()
  if (id) {
    for (const sec of sections) {
      if (!isEsignTemplateDocumentsSection(sec)) continue
      if (sec.nestedDocuments.some((d) => d.id.trim() === id)) return true
    }
  }
  const nested = findNestedPreviewDocumentById(sections, doc.id)
  if (nested && isInvestorEsignWorkspaceDocument(nested)) return true
  const { sectionLabel } = parseFlatDocumentDisplayName(doc.name)
  return isEsignTemplateSectionLabel(sectionLabel)
}

/**
 * When flat preview docs exist but are missing from section nested lists, attach
 * them to the matching section (by label) so investors see every sponsor upload.
 */
export function reconcileFlatDocumentsIntoSections(
  sections: OfferingPreviewSection[],
  flat: OfferingPreviewDocument[],
): OfferingPreviewSection[] {
  const nestedIds = new Set(
    sections.flatMap((s) => s.nestedDocuments.map((d) => d.id)),
  )
  const orphanFlat = flat.filter((d) => d.id.trim() && !nestedIds.has(d.id.trim()))
  if (orphanFlat.length === 0) return sections

  const next = sections.map((s) => ({
    ...s,
    nestedDocuments: [...s.nestedDocuments],
  }))

  for (const fd of orphanFlat) {
    const { sectionLabel, fileName } = parseFlatDocumentDisplayName(fd.name)
    let section =
      sectionLabel.trim().length > 0
        ? next.find((s) => sectionDisplayLabel(s) === sectionLabel.trim())
        : undefined

    if (
      !section &&
      sectionLabel.trim() &&
      isEsignTemplateSectionLabel(sectionLabel)
    ) {
      section =
        next.find((s) => s.id === ESIGN_TEMPLATE_DOCUMENTS_SECTION_ID) ??
        next.find(isEsignTemplateDocumentsSection)
      if (!section) {
        section = createEmptyEsignTemplateDocumentsSection()
        next.push(section)
      }
    }

    if (!section && sectionLabel.trim()) {
      const recoveredId = `recovered-${sectionLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${fd.id.trim()}`
      section = {
        id: recoveredId,
        sectionLabel: sectionLabel.trim(),
        documentLabel: sectionLabel.trim(),
        visibility: sectionSharedWithDisplay("offering_page"),
        sharedWithScope: "offering_page",
        requireLpReview: false,
        dateAdded: fd.dateAdded?.trim() || "—",
        nestedDocuments: [],
      }
      next.push(section)
    }

    if (!section) continue

    section.nestedDocuments.push({
      id: fd.id.trim(),
      name: fileName,
      url: fd.url,
      dateAdded: fd.dateAdded?.trim() || "—",
      lpDisplaySectionId: section.id,
      sharedDealClassIds: [],
      sharedInvestorIds: [],
      sharedWithAllInvestors: false,
      sharedSponsorUserIds: [],
      ...(fd.sharedWithScope ? { sharedWithScope: fd.sharedWithScope } : {}),
    })
  }

  return consolidateInvestorEsignDocumentsIntoAutoSection(next)
}

export function flattenSectionsToPreviewDocs(
  sections: OfferingPreviewSection[],
): OfferingPreviewDocument[] {
  const out: OfferingPreviewDocument[] = []
  for (const s of sections) {
    for (const d of s.nestedDocuments) {
      out.push({
        id: d.id,
        name: previewDocDisplayName(sections, s, d),
        url: d.url,
        sharedWithScope: effectiveDocumentSharedWithScope(d, s),
        ...(d.dateAdded && d.dateAdded !== "—" ? { dateAdded: d.dateAdded } : {}),
      })
    }
  }
  return out
}

export function readOfferingPreviewSections(dealId: string | null | undefined): OfferingPreviewSection[] {
  const id = dealId?.trim() ?? ""
  if (!id) return []
  const flat = readOfferingPreviewDocuments(id)
  const cached = getRuntimeOfferingPreviewSections(id)
  if (cached) {
    return sanitizeSections(reconcileFlatDocumentsIntoSections(cached, flat))
  }
  if (flat.length === 0) return sanitizeSections([])
  const migrated = sanitizeSections(migrateFlatToSections(flat))
  setRuntimeOfferingPreviewSections(id, migrated)
  writeOfferingPreviewDocuments(id, flattenSectionsToPreviewDocs(migrated))
  return migrated
}

/**
 * Deal-scoped document sections for the syndication Documents tab (and eSign picker).
 * Only reads `offering_investor_preview_json` / runtime state keyed by this `dealId`.
 */
export function readDealDocumentSectionsForWorkspace(
  dealId: string | null | undefined,
): OfferingPreviewSection[] {
  const id = dealId?.trim() ?? ""
  if (!id) return []
  return orderDocumentSectionsWithDefaultFirst(
    reconcileFlatDocumentsIntoSections(
      readOfferingPreviewSections(id),
      readOfferingPreviewDocuments(id),
    ),
  )
}

export function writeOfferingPreviewSections(
  dealId: string,
  sections: OfferingPreviewSection[],
  opts?: { notify?: boolean },
): void {
  const id = dealId.trim()
  if (!id) return
  const sanitized = sanitizeSections(sections)
  setRuntimeOfferingPreviewSections(id, sanitized)
  writeOfferingPreviewDocuments(id, flattenSectionsToPreviewDocs(sanitized))
  if (typeof window !== "undefined" && opts?.notify !== false) {
    window.dispatchEvent(
      new CustomEvent(OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT, {
        detail: { dealId: id },
      }),
    )
  }
}

/** Parse flat docs from legacy localStorage for one-time migration to the database. */
export function parseLegacyFlatDocumentsFromLocalStorage(
  dealId: string,
): OfferingPreviewDocument[] {
  return parseOfferingPreviewDocumentsJson(
    readLegacyOfferingPreviewDocumentsFromLocalStorage(dealId),
  )
}

/** Parse `sections` JSON from the server (same shape as localStorage). */
export function parseOfferingPreviewSectionsJson(
  raw: unknown,
): OfferingPreviewSection[] {
  return sanitizeSections(normalizeSectionsArray(raw))
}
