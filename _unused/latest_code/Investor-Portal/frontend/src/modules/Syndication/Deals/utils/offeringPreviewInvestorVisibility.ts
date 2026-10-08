/**
 * Per-section visibility for “Make it visible to Investors” (Offering details accordions).
 * Stored on the deal row as `offering_investor_preview_json.visibility` and held in memory
 * while editing. Used on the offering preview page so the preview matches the shared link.
 */

import {
  getRuntimeOfferingPreviewVisibility,
  setRuntimeOfferingPreviewVisibility,
} from "./offeringPreviewRuntimeStore"

/** Fired after `writeOfferingPreviewInvestorVisibility` (same tab + other tabs via storage). */
export const OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT =
  "ip-offering-preview-visibility-changed"

export type OfferingDetailsSectionId =
  | "make_announcement"
  | "overview"
  | "offering_information"
  | "gallery"
  | "summary"
  | "documents"
  | "assets"
  | "key_highlights"
  | "funding_instructions"

export const OFFERING_DETAILS_SECTION_ORDER: {
  id: OfferingDetailsSectionId
  label: string
}[] = [
  { id: "make_announcement", label: "Make announcement" },
  { id: "overview", label: "Offering Details" },
  { id: "offering_information", label: "Classes" },
  { id: "gallery", label: "Gallery" },
  { id: "summary", label: "Summary" },
  { id: "documents", label: "Documents" },
  { id: "assets", label: "Assets" },
  { id: "key_highlights", label: "Key Highlights" },
  { id: "funding_instructions", label: "Funding Information" },
]

/** Offering Details tab accordion only (documents live under the deal Documents tab). */
export const OFFERING_DETAILS_ACCORDION_SECTION_ORDER =
  OFFERING_DETAILS_SECTION_ORDER.filter((s) => s.id !== "documents")

/** Sections that currently have matching blocks on the offering preview page. */
export function offeringSectionHasInvestorPreviewTarget(
  id: OfferingDetailsSectionId,
): boolean {
  return Boolean(id)
}

/** Stable id for cross-tab custom events (no longer a localStorage key). */
export function offeringPreviewInvestorVisibilityStorageKey(
  dealId: string,
): string {
  return `ip_offering_investor_preview_visibility:v1:${dealId.trim()}`
}

function allTrue(): Record<OfferingDetailsSectionId, boolean> {
  return Object.fromEntries(
    OFFERING_DETAILS_SECTION_ORDER.map(({ id }) => [id, true]),
  ) as Record<OfferingDetailsSectionId, boolean>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

/** Parse `offering_investor_preview_json.visibility` from the API (shared link + sponsor save). */
export function parseVisibilityFromOfferingInvestorPreviewJson(
  json: string | null | undefined,
): Record<OfferingDetailsSectionId, boolean> | null {
  if (!json?.trim()) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!isRecord(parsed)) return null
    const visRaw = parsed.visibility
    if (!isRecord(visRaw)) return null
    const out = allTrue()
    for (const k of OFFERING_DETAILS_SECTION_ORDER) {
      const v = visRaw[k.id]
      if (typeof v === "boolean") out[k.id] = v
    }
    return out
  } catch {
    return null
  }
}

/**
 * Visibility for preview / shared URL. Public / shared links use server JSON only.
 * Sponsor preview uses in-memory state hydrated from the database.
 */
export function readInvestorVisibilityForOfferingPreview(
  dealId: string,
  serverJson?: string | null,
  opts?: { preferServerOnly?: boolean },
): Record<OfferingDetailsSectionId, boolean> {
  const fromServer = parseVisibilityFromOfferingInvestorPreviewJson(serverJson)
  if (opts?.preferServerOnly) {
    return fromServer ?? readOfferingPreviewInvestorVisibility(dealId)
  }
  if (!fromServer) return readOfferingPreviewInvestorVisibility(dealId)
  const fromRuntime = readOfferingPreviewInvestorVisibility(dealId)
  return { ...fromServer, ...fromRuntime }
}

export function readOfferingPreviewInvestorVisibility(
  dealId: string,
): Record<OfferingDetailsSectionId, boolean> {
  const defaults = allTrue()
  const id = dealId.trim()
  if (!id) return defaults
  const cached = getRuntimeOfferingPreviewVisibility(id)
  if (cached) return cached
  return defaults
}

export function writeOfferingPreviewInvestorVisibility(
  dealId: string,
  flags: Record<OfferingDetailsSectionId, boolean>,
  opts?: { notify?: boolean },
): void {
  const id = dealId.trim()
  if (!id) return
  const next = { ...allTrue() }
  for (const k of OFFERING_DETAILS_SECTION_ORDER) {
    next[k.id] = Boolean(flags[k.id])
  }
  setRuntimeOfferingPreviewVisibility(id, next)
  if (typeof window !== "undefined" && opts?.notify !== false) {
    window.dispatchEvent(
      new CustomEvent(OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT, {
        detail: { dealId: id },
      }),
    )
  }
}
