import { normalizeDealGallerySrc } from "@/common/utils/apiBaseUrl"
import {
  readDealDocumentSectionsForWorkspace,
  sectionDisplayLabel,
  type NestedPreviewDocument,
} from "../../utils/offeringPreviewDocSections"

export type DealDocumentPickOption = {
  id: string
  name: string
  url: string
  sectionLabel: string
}

function isPdfFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".pdf")
}

function resolveDealDocumentUrl(doc: NestedPreviewDocument): string {
  const raw = doc.url?.trim() ?? ""
  if (!raw) return ""
  return normalizeDealGallerySrc(raw).trim() || raw
}

/** Any file row on this deal's Documents tab (deal-scoped; enables Deal documents toggle). */
export function dealHasAnySectionDocuments(dealId: string): boolean {
  for (const section of readDealDocumentSectionsForWorkspace(dealId)) {
    if (section.nestedDocuments.length > 0) return true
  }
  return false
}

function pdfFileNameFromDocument(doc: NestedPreviewDocument): string {
  const base = doc.name.trim() || "document"
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`
}

/**
 * Every PDF on this deal's Documents tab for eSign template creation (deal-scoped).
 */
export function listDealPdfDocumentsForEsignTemplate(
  dealId: string,
): DealDocumentPickOption[] {
  const id = (dealId ?? "").trim()
  if (!id) return []
  const out: DealDocumentPickOption[] = []
  for (const section of readDealDocumentSectionsForWorkspace(id)) {
    const sectionLabel = sectionDisplayLabel(section)
    for (const doc of section.nestedDocuments) {
      if (!doc.id?.trim() || !doc.name?.trim()) continue
      const url = resolveDealDocumentUrl(doc)
      if (!url) continue
      if (!isPdfFileName(doc.name) && !url.toLowerCase().includes(".pdf")) continue
      out.push({
        id: doc.id,
        name: pdfFileNameFromDocument(doc),
        url,
        sectionLabel,
      })
    }
  }
  return out.sort((a, b) =>
    `${a.sectionLabel} ${a.name}`.localeCompare(`${b.sectionLabel} ${b.name}`, undefined, {
      sensitivity: "base",
    }),
  )
}

export async function fetchDealDocumentAsPdfFile(
  option: Pick<DealDocumentPickOption, "url" | "name">,
): Promise<File> {
  const resolved = normalizeDealGallerySrc(option.url)
  if (!resolved) throw new Error("Document URL is missing.")
  const res = await fetch(resolved, { credentials: "include" })
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Document file was not found on the server."
        : "Could not download the selected document.",
    )
  }
  const blob = await res.blob()
  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : "application/pdf"
  return new File([blob], option.name, { type })
}
