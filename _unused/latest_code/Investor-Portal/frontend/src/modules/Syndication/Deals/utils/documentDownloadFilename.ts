import { sanitizeExportFilenamePart } from "../../../../common/utils/tableExportFilename"

function fileExtension(name: string): string {
  const base = name.trim()
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return ".pdf"
  return base.slice(dot).toLowerCase()
}

/**
 * Download name: `{DealName}-{SectionName}.{extension}` for single-file downloads.
 * When multiple files share a section, disambiguate with the original basename.
 */
export function buildDocumentDownloadFilename(opts: {
  dealName: string
  sectionName: string
  originalName: string
  disambiguate?: boolean
}): string {
  const deal = sanitizeExportFilenamePart(opts.dealName, "Deal")
  const section = sanitizeExportFilenamePart(opts.sectionName, "Documents")
  const ext = fileExtension(opts.originalName)
  if (!opts.disambiguate) {
    return `${deal}-${section}${ext}`
  }
  const base = sanitizeExportFilenamePart(
    opts.originalName.replace(/\.[^.]+$/, ""),
    "document",
  )
  return `${deal}-${section}-${base}${ext}`
}

export async function downloadDocumentFromUrl(
  url: string,
  filename: string,
): Promise<void> {
  const trimmed = url.trim()
  if (!trimmed) return
  const res = await fetch(trimmed)
  if (!res.ok) throw new Error("Download failed.")
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = filename
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
