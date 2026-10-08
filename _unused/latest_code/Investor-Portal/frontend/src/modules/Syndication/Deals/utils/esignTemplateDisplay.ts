import type { DealEsignTemplateFileRecord } from "../api/dealsApi"
import { toast } from "@/common/components/Toast"

/** Label shown in lists, send-esign modal, and Dropbox Sign title default. */
export function esignTemplateDisplayName(
  file: Pick<
    DealEsignTemplateFileRecord,
    "templateName" | "dropboxSignTitle" | "originalName"
  >,
): string {
  const name =
    file.templateName?.trim() ||
    file.dropboxSignTitle?.trim() ||
    file.originalName?.trim()
  return name || "Document"
}

const TEMPLATE_EDITOR_OPEN_ERROR = "Could not open template editor"

/** Avoid duplicate title + description when the API returns the same generic message. */
export function toastTemplateEditorOpenError(message: string) {
  const detail = message?.trim()
  toast.error(
    TEMPLATE_EDITOR_OPEN_ERROR,
    detail && detail !== TEMPLATE_EDITOR_OPEN_ERROR ? detail : undefined,
  )
}
