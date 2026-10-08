/**
 * Minimal offering documents shown on the investor-facing preview.
 * Backed by in-memory runtime state hydrated from `offering_investor_preview_json` on the deal.
 */

import {
  getRuntimeOfferingPreviewFlatDocuments,
  setRuntimeOfferingPreviewFlatDocuments,
} from "./offeringPreviewRuntimeStore"

/** Mirrors document Visibility; drives who sees the doc on Preview offering + shared link. */
export type OfferingPreviewDocSharedWithScope =
  | "lp_investor"
  | "offering_page"
  | "not_visible"

export type OfferingPreviewDocument = {
  id: string
  name: string
  url: string | null
  /** Optional; shown in sponsor workspace table */
  dateAdded?: string
  /**
   * `offering_page`: Preview offering, shared offering link, and portal LPs.
   * `lp_investor`: LP portal only — omitted from Preview offering and the offering link.
   * `not_visible`: hidden from offering link, preview, and LP portal (sponsor workspace only).
   */
  sharedWithScope?: OfferingPreviewDocSharedWithScope
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function normalizeDoc(raw: unknown): OfferingPreviewDocument | null {
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
      : undefined
  const sw = raw.sharedWithScope
  const sharedWithScope: OfferingPreviewDocSharedWithScope | undefined =
    sw === "lp_investor"
      ? "lp_investor"
      : sw === "offering_page"
        ? "offering_page"
        : sw === "not_visible"
          ? "not_visible"
          : undefined
  return {
    id,
    name,
    url,
    ...(dateAdded ? { dateAdded } : {}),
    ...(sharedWithScope ? { sharedWithScope } : {}),
  }
}

function normalizeDocArray(parsed: unknown): OfferingPreviewDocument[] {
  if (!Array.isArray(parsed)) return []
  const out: OfferingPreviewDocument[] = []
  for (const item of parsed) {
    const d = normalizeDoc(item)
    if (d) out.push(d)
  }
  return out
}

export function readOfferingPreviewDocuments(
  dealId: string,
): OfferingPreviewDocument[] {
  const id = dealId.trim()
  if (!id) return []
  const cached = getRuntimeOfferingPreviewFlatDocuments(id)
  if (cached) return cached
  return []
}

export function writeOfferingPreviewDocuments(
  dealId: string,
  docs: OfferingPreviewDocument[],
): void {
  const id = dealId.trim()
  if (!id) return
  setRuntimeOfferingPreviewFlatDocuments(id, docs)
}

/** Parse flat document list from legacy localStorage JSON. */
export function parseOfferingPreviewDocumentsJson(
  raw: unknown,
): OfferingPreviewDocument[] {
  return normalizeDocArray(raw)
}
