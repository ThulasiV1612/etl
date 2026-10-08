/** Client-side SignFlow embed builder URL (matches backend buildSignFlowEditorUrl). */
export function buildSignFlowEditorUrlClient(
  appBaseUrl: string,
  documentId: string,
  embedApiKey?: string | null,
): string {
  const base = appBaseUrl.trim().replace(/\/$/, "")
  const id = encodeURIComponent(documentId.trim())
  const path = `${base}/embed/documents/${id}/builder`
  const key = embedApiKey?.trim()
  if (!key) return path
  return `${path}?${new URLSearchParams({ apiKey: key }).toString()}`
}

/** Client-side SignFlow embed signing URL — adds apiKey + parent portal origin for iframe embed. */
export function buildSignFlowEmbedSignUrlClient(
  signUrl: string,
  opts?: {
    embedApiKey?: string | null
    parentOrigin?: string | null
  },
): string {
  const raw = signUrl.trim()
  if (!raw) return raw
  try {
    const u = new URL(raw)
    const key = opts?.embedApiKey?.trim()
    if (key && !u.searchParams.has("apiKey")) {
      u.searchParams.set("apiKey", key)
    }
    const parent =
      opts?.parentOrigin?.trim() ||
      (typeof window !== "undefined" ? window.location.origin : "")
    if (parent && !u.searchParams.has("parentOrigin")) {
      u.searchParams.set("parentOrigin", parent)
    }
    return u.toString()
  } catch {
    return raw
  }
}

export function canOpenSignFlowEditorInstantly(
  file: {
    signflowDocumentId?: string
    signflowStatus?: string
    esignProvider?: string
  },
  provider: "signflow" | "dropbox" | null,
): boolean {
  if (provider === "dropbox" || file.esignProvider === "dropbox") return false
  const docId = file.signflowDocumentId?.trim()
  if (!docId) return false
  const status = file.signflowStatus
  return status === "draft" || status === "ready"
}
