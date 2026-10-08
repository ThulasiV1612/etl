import type { DealEsignTemplateFileRecord } from "../api/dealsApi"

function isTemplateReady(file: DealEsignTemplateFileRecord): boolean {
  const signflowReady =
    file.signflowStatus === "ready" && Boolean(file.signflowDocumentId?.trim())
  const dropboxReady =
    file.dropboxSignStatus === "ready" &&
    Boolean(file.dropboxSignTemplateId?.trim())
  return signflowReady || dropboxReady
}

export function isDealEsignTemplateReady(
  file: DealEsignTemplateFileRecord,
): boolean {
  return isTemplateReady(file)
}

/** True when at least one template exists and every template is eSign-ready. */
export function areDealEsignTemplatesConfigured(
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
): boolean {
  const files = Object.values(filesByCategory).flat()
  return areDealEsignTemplateFilesConfigured(files)
}

/** Prefer server flag when present; otherwise derive from template file records. */
export function resolveDealEsignTemplatesConfigured(
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
  templatesFullyConfigured?: boolean,
): boolean {
  if (typeof templatesFullyConfigured === "boolean") {
    return templatesFullyConfigured
  }
  return areDealEsignTemplatesConfigured(filesByCategory)
}

export function areDealEsignTemplateFilesConfigured(
  files: DealEsignTemplateFileRecord[],
): boolean {
  if (files.length === 0) return false
  return files.every((f) => isTemplateReady(f))
}
