import { getSessionUserId } from "../../../../common/auth/sessionUserId"
import {
  dealAssetRelativePathToUploadsUrl,
  getUploadsPublicOrigin,
} from "../../../../common/utils/apiBaseUrl"
import {
  formatDateDdMmmYyyy,
  formatInvestorSignedColumn,
} from "../../../../common/utils/formatDateDisplay"
import { parseMoneyDigits } from "./offeringMoneyFormat"
import type {
  DealInvestorEsignDocumentRef,
  DealInvestorEsignSendStatus,
  DealInvestorEsignStatus,
  DealInvestorRow,
} from "../types/deal-investors.types"
import type { EsignProfileStatusTab } from "./esignTemplateCategories"
import { resolveInvestorEsignCategoryId } from "./esignTemplateCategories"
import { esignSendCategoryMatchesInvestorProfile } from "./esignUnifiedTemplate"

export type EsignWorkflowStepKey = "sent" | "viewed" | "signed" | "completed"

export interface EsignWorkflowStep {
  key: EsignWorkflowStepKey
  label: string
  done: boolean
  atIso: string | null
  atDisplay: string
}

function primaryCategoryForSendRecord(
  send: Record<string, unknown>,
): string {
  const fromSend = String(send.categoryId ?? send.category_id ?? "").trim()
  if (fromSend) return fromSend
  const docs = Array.isArray(send.documents) ? send.documents : []
  for (const d of docs) {
    if (!d || typeof d !== "object" || Array.isArray(d)) continue
    const doc = d as Record<string, unknown>
    const cid = String(doc.categoryId ?? doc.category_id ?? "").trim()
    if (cid) return cid
  }
  return ""
}

function pickWorkflowSendRecord(
  sends: Record<string, unknown>[],
  preferredCategoryId?: string | null,
): Record<string, unknown> | null {
  const sorted = [...sends]
    .filter((s) => strOrNull(s.sentAt ?? s.sent_at))
    .sort(
      (a, b) =>
        new Date(String(a.sentAt ?? a.sent_at ?? 0)).getTime() -
        new Date(String(b.sentAt ?? b.sent_at ?? 0)).getTime(),
    )
  if (sorted.length === 0) return null

  const cat = preferredCategoryId?.trim()
  if (cat) {
    const forCat = sorted.filter((s) =>
      esignSendCategoryMatchesInvestorProfile(
        primaryCategoryForSendRecord(s),
        cat,
      ),
    )
    if (forCat.length === 0) return null
    const latestCat = forCat[forCat.length - 1]!
    if (strOrNull(latestCat.completedAt ?? latestCat.completed_at)) {
      return latestCat
    }
    const pendingInCat = forCat.filter(
      (s) => !strOrNull(s.completedAt ?? s.completed_at),
    )
    return (
      pendingInCat.find((s) =>
        String(s.signatureRequestId ?? s.signature_request_id ?? "").trim(),
      ) ??
      pendingInCat[pendingInCat.length - 1] ??
      latestCat
    )
  }

  const completed = sorted.filter((s) =>
    strOrNull(s.completedAt ?? s.completed_at),
  )
  if (completed.length > 0) return completed[completed.length - 1]!

  const latest = sorted[sorted.length - 1]!
  const pending = sorted
    .filter((s) => !strOrNull(s.completedAt ?? s.completed_at))
    .sort(
      (a, b) =>
        new Date(String(b.sentAt ?? b.sent_at ?? 0)).getTime() -
        new Date(String(a.sentAt ?? a.sent_at ?? 0)).getTime(),
    )
  const activePending =
    pending.find((s) =>
      String(s.signatureRequestId ?? s.signature_request_id ?? "").trim(),
    ) ?? pending[0]
  return activePending ?? latest
}

/** Normalize API `esignStatus`, JSON string, or stored bundle v2 into a flat status object. */
function coerceEsignStatusInput(
  raw: unknown,
  preferredCategoryId?: string | null,
): Record<string, unknown> | null {
  if (raw == null) return null

  if (typeof raw === "string") {
    const s = raw.trim()
    if (!s) return null
    try {
      return coerceEsignStatusInput(JSON.parse(s) as unknown, preferredCategoryId)
    } catch {
      return null
    }
  }

  if (typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>

  if (o.version === 2 && Array.isArray(o.sends)) {
    const sends = o.sends.filter(
      (s): s is Record<string, unknown> =>
        Boolean(s) && typeof s === "object" && !Array.isArray(s),
    )
    if (sends.length === 0) return null

    const workflow = pickWorkflowSendRecord(sends, preferredCategoryId)
    if (!workflow) return null
    const workflowCompleted = strOrNull(
      workflow.completedAt ?? workflow.completed_at,
    )
    const completedAt = workflowCompleted

    const sorted = [...sends].sort(
      (a, b) =>
        new Date(String(a.sentAt ?? a.sent_at ?? 0)).getTime() -
        new Date(String(b.sentAt ?? b.sent_at ?? 0)).getTime(),
    )
    const docs: unknown[] = []
    for (const send of sorted) {
      if (Array.isArray(send.documents)) docs.push(...send.documents)
    }
    return {
      sentAt: workflow.sentAt ?? workflow.sent_at ?? sorted[0]?.sentAt ?? sorted[0]?.sent_at,
      viewedAt: workflow.viewedAt ?? workflow.viewed_at,
      signedAt: workflow.signedAt ?? workflow.signed_at,
      completedAt,
      signatureRequestId:
        workflow.signatureRequestId ?? workflow.signature_request_id,
      documents: docs,
    }
  }

  return o
}

export function parseEsignStatusFromApi(
  raw: unknown,
  preferredCategoryId?: string | null,
): DealInvestorEsignStatus | undefined {
  const o = coerceEsignStatusInput(raw, preferredCategoryId)
  if (!o) return undefined

  const sentAt = strOrNull(o.sentAt ?? o.sent_at)
  if (!sentAt) return undefined

  const documents = Array.isArray(o.documents)
    ? o.documents
        .map((d) => {
          if (!d || typeof d !== "object" || Array.isArray(d)) return null
          const doc = d as Record<string, unknown>
          const fileId = String(doc.fileId ?? doc.file_id ?? "").trim()
          if (!fileId) return null
          const name =
            String(doc.name ?? doc.file_name ?? "").trim() || fileId || "Document"
          const signedRelativePath = String(
            doc.signedRelativePath ?? doc.signed_relative_path ?? "",
          ).trim()
          const categoryId = String(
            doc.categoryId ?? doc.category_id ?? "",
          ).trim()
          const templateRelativePath = String(
            doc.templateRelativePath ?? doc.template_relative_path ?? "",
          ).trim()
          return {
            fileId,
            name,
            ...(categoryId ? { categoryId } : {}),
            ...(templateRelativePath ? { templateRelativePath } : {}),
            ...(signedRelativePath ? { signedRelativePath } : {}),
          }
        })
        .filter(
          (
            x,
          ): x is {
            fileId: string
            name: string
            templateRelativePath?: string
            signedRelativePath?: string
          } => x != null,
        )
    : []

  return {
    sentAt,
    viewedAt: strOrNull(o.viewedAt ?? o.viewed_at),
    signedAt: strOrNull(o.signedAt ?? o.signed_at),
    completedAt: strOrNull(o.completedAt ?? o.completed_at),
    documents,
  }
}

function parseEsignSendStatusRecord(
  raw: unknown,
): DealInvestorEsignSendStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const sentAt = strOrNull(o.sentAt ?? o.sent_at)
  if (!sentAt) return null
  let categoryId = String(o.categoryId ?? o.category_id ?? "").trim()
  if (!categoryId && Array.isArray(o.documents)) {
    for (const d of o.documents) {
      if (!d || typeof d !== "object" || Array.isArray(d)) continue
      const doc = d as Record<string, unknown>
      const cid = String(doc.categoryId ?? doc.category_id ?? "").trim()
      if (cid) {
        categoryId = cid
        break
      }
    }
  }
  if (!categoryId) return null
  const documents = Array.isArray(o.documents)
    ? o.documents
        .map((d) => {
          if (!d || typeof d !== "object" || Array.isArray(d)) return null
          const doc = d as Record<string, unknown>
          const fileId = String(doc.fileId ?? doc.file_id ?? "").trim()
          if (!fileId) return null
          const name =
            String(doc.name ?? doc.file_name ?? "").trim() || fileId || "Document"
          const signedRelativePath = String(
            doc.signedRelativePath ?? doc.signed_relative_path ?? "",
          ).trim()
          const docCategoryId = String(
            doc.categoryId ?? doc.category_id ?? categoryId,
          ).trim()
          const templateRelativePath = String(
            doc.templateRelativePath ?? doc.template_relative_path ?? "",
          ).trim()
          return {
            fileId,
            name,
            ...(docCategoryId ? { categoryId: docCategoryId } : {}),
            ...(templateRelativePath ? { templateRelativePath } : {}),
            ...(signedRelativePath ? { signedRelativePath } : {}),
          }
        })
        .filter((x): x is DealInvestorEsignDocumentRef => x != null)
    : []
  const completedAt = strOrNull(o.completedAt ?? o.completed_at)
  const documentsForSend = completedAt
    ? documents
    : documents.map((d) => {
        const { signedRelativePath: _signed, ...rest } = d
        return rest
      })

  return {
    categoryId,
    sentAt,
    viewedAt: strOrNull(o.viewedAt ?? o.viewed_at),
    signedAt: strOrNull(o.signedAt ?? o.signed_at),
    completedAt,
    signatureRequestId: strOrNull(
      o.signatureRequestId ?? o.signature_request_id,
    ),
    documents: documentsForSend,
  }
}

/** All profile sends from API `sends` or stored bundle v2 JSON. */
export function parseEsignSendsFromApi(
  rawSends: unknown,
  bundleJson?: string | null,
): DealInvestorEsignSendStatus[] {
  const fromSends = Array.isArray(rawSends)
    ? rawSends
        .map(parseEsignSendStatusRecord)
        .filter((s): s is DealInvestorEsignSendStatus => s != null)
    : []
  if (fromSends.length > 0) return fromSends

  const raw = String(bundleJson ?? "").trim()
  if (!raw) return []
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (o.version === 2 && Array.isArray(o.sends)) {
      return o.sends
        .map(parseEsignSendStatusRecord)
        .filter((s): s is DealInvestorEsignSendStatus => s != null)
    }
  } catch {
    return []
  }
  return []
}

export function findEsignSendForCategory(
  sends: DealInvestorEsignSendStatus[],
  categoryId: string,
  investorLegacyCategoryId?: string | null,
): DealInvestorEsignSendStatus | undefined {
  const cat = categoryId.trim()
  if (!cat) return undefined
  const invCat = investorLegacyCategoryId?.trim()
  return sends.find((s) => {
    const sendCat = s.categoryId.trim()
    if (sendCat === cat) return true
    if (invCat) {
      return esignSendCategoryMatchesInvestorProfile(sendCat, invCat)
    }
    return esignSendCategoryMatchesInvestorProfile(sendCat, cat)
  })
}

export function esignStatusForProfileTab(
  tab: EsignProfileStatusTab,
  sends: DealInvestorEsignSendStatus[],
  investorLegacyCategoryId?: string | null,
): DealInvestorEsignStatus | null {
  const send = findEsignSendForCategory(
    sends,
    tab.categoryId,
    investorLegacyCategoryId,
  )
  if (!send?.sentAt?.trim()) return null
  return esignStatusFromSendRecord(send, tab.documents)
}

/** Resolved eSign status for table + modal (API object, parsed bundle, or signedDate fallback). */
export function resolveInvestorRowEsignStatus(
  row: DealInvestorRow,
): DealInvestorEsignStatus | undefined {
  const categoryId = resolveInvestorEsignCategoryId(row)
  const fromApi =
    parseEsignStatusFromApi(row.esignStatus, categoryId) ??
    parseEsignStatusFromApi(row.esignStatusBundleJson, categoryId)
  if (fromApi?.sentAt?.trim()) return fromApi

  const fallback = fallbackEsignStatusForRow(row)
  if (fallback?.sentAt?.trim()) return fallback

  return undefined
}

function strOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s || null
}

const ESIGN_WORKFLOW_COLUMN_LABELS = new Set([
  "sent",
  "pending",
  "viewed",
  "signed",
  "completed",
])

export function investorEsignWasSent(row: DealInvestorRow): boolean {
  if (resolveInvestorRowEsignStatus(row)?.sentAt?.trim()) return true
  const s = String(row.signedDate ?? "").trim().toLowerCase()
  return ESIGN_WORKFLOW_COLUMN_LABELS.has(s)
}

/**
 * Current eSign workflow step for the Investors tab Signed column:
 * Sent → Viewed → Signed → Completed (or calendar date when not eSign).
 */
export function esignWorkflowColumnLabel(
  esignStatus?: DealInvestorEsignStatus | null,
  signedDateFallback?: string | null,
): string {
  if (esignStatus?.sentAt?.trim()) {
    if (esignStatus.completedAt?.trim()) return "Completed"
    if (esignStatus.signedAt?.trim()) return "Signed"
    if (esignStatus.viewedAt?.trim()) return "Viewed"
    return "Sent"
  }
  const fromApi = formatInvestorSignedColumn(signedDateFallback)
  return fromApi || "—"
}

/** Signed column text: workflow labels from eSign JSON, else API `signedDate`. */
export function investorSignedColumnDisplay(row: DealInvestorRow): string {
  const resolved = resolveInvestorRowEsignStatus(row)
  if (resolved) return esignWorkflowColumnLabel(resolved, null)

  const docStored = String(row.docSignedDateIso ?? "").trim().toLowerCase()
  if (docStored === "pending") return "Sent"
  if (docStored === "completed") return "Completed"

  return esignWorkflowColumnLabel(row.esignStatus, row.signedDate)
}

export function investorRowShowsEsignStatusLink(
  row: DealInvestorRow,
): boolean {
  return investorEsignWasSent(row)
}

export function investorRowInvestorPhaseSigned(row: DealInvestorRow): boolean {
  const status = resolveInvestorRowEsignStatus(row)
  return Boolean(status?.signedAt?.trim() || status?.completedAt?.trim())
}

/** All investors with eSign sent have finished the investor signing step. */
export function allInvestorsInvestorPhaseComplete(
  investors: DealInvestorRow[],
): boolean {
  const withEsign = investors.filter(
    (inv) =>
      investorEsignWasSent(inv) && investorRowCommittedNumeric(inv) > 0,
  )
  if (withEsign.length === 0) return false
  return withEsign.every((inv) => investorRowInvestorPhaseSigned(inv))
}

/** Investor finished signing; sponsor counter-signature is still required. */
export function investorRowAwaitingSponsorCounterSign(
  row: DealInvestorRow,
): boolean {
  const sends = parseEsignSendsFromApi(null, row.esignStatusBundleJson)
  if (
    sends.some(
      (send) =>
        Boolean(send.signedAt?.trim()) && !send.completedAt?.trim(),
    )
  ) {
    return true
  }
  const status = resolveInvestorRowEsignStatus(row)
  return Boolean(status?.signedAt?.trim() && !status?.completedAt?.trim())
}

export function investorRowLatestEsignSignedAt(
  row: DealInvestorRow,
): string | null {
  const sends = parseEsignSendsFromApi(null, row.esignStatusBundleJson)
  let best: string | null = null
  let bestMs = -1
  for (const send of sends) {
    const signedAt = send.signedAt?.trim()
    if (!signedAt) continue
    const ms = Date.parse(signedAt)
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms
      best = signedAt
    }
  }
  if (best) return best
  return resolveInvestorRowEsignStatus(row)?.signedAt?.trim() || null
}

export interface DealEsignDropboxSignerDetail {
  signatureId: string | null
  signerName: string | null
  signerEmail: string | null
  statusCode: string | null
  lastViewedAt: string | null
  signedAt: string | null
}

export interface DealEsignDropboxDetail {
  signatureRequestId: string
  isComplete: boolean
  isDeclined: boolean
  createdAt: string | null
  completeAt: string | null
  lastViewedAt: string | null
  lastSignedAt: string | null
  signers: DealEsignDropboxSignerDetail[]
}

export function parseDropboxDetailFromApi(
  raw: unknown,
): DealEsignDropboxDetail | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const signers = Array.isArray(o.signers)
    ? o.signers
        .map((s) => {
          if (!s || typeof s !== "object" || Array.isArray(s)) return null
          const sig = s as Record<string, unknown>
          return {
            signatureId: strOrNull(sig.signatureId ?? sig.signature_id),
            signerName: strOrNull(sig.signerName ?? sig.signer_name),
            signerEmail: strOrNull(sig.signerEmail ?? sig.signer_email),
            statusCode: strOrNull(sig.statusCode ?? sig.status_code),
            lastViewedAt: strOrNull(sig.lastViewedAt ?? sig.last_viewed_at),
            signedAt: strOrNull(sig.signedAt ?? sig.signed_at),
          }
        })
        .filter((x): x is DealEsignDropboxSignerDetail => x != null)
    : []
  const signatureRequestId = String(
    o.signatureRequestId ?? o.signature_request_id ?? "",
  ).trim()
  if (!signatureRequestId) return null
  return {
    signatureRequestId,
    isComplete: Boolean(o.isComplete ?? o.is_complete),
    isDeclined: Boolean(o.isDeclined ?? o.is_declined),
    createdAt: strOrNull(o.createdAt ?? o.created_at),
    completeAt: strOrNull(o.completeAt ?? o.complete_at),
    lastViewedAt: strOrNull(o.lastViewedAt ?? o.last_viewed_at),
    lastSignedAt: strOrNull(o.lastSignedAt ?? o.last_signed_at),
    signers,
  }
}

/**
 * Display-only: each stage timestamp is shown only when that stage (and prior stages) occurred.
 * Clears orphan viewed/signed/completed values on sends that were only sent.
 */
export function sanitizeEsignStageTimestamps(
  status: DealInvestorEsignStatus,
): DealInvestorEsignStatus {
  const sentAt = status.sentAt?.trim() || null
  if (!sentAt) {
    return {
      ...status,
      sentAt: null,
      viewedAt: null,
      signedAt: null,
      completedAt: null,
    }
  }

  const viewedAt = status.viewedAt?.trim() || null
  if (!viewedAt) {
    return {
      ...status,
      sentAt,
      viewedAt: null,
      signedAt: null,
      completedAt: null,
    }
  }

  const completedAt = status.completedAt?.trim() || null
  const signedAt = status.signedAt?.trim() || null
  if (!signedAt && !completedAt) {
    return {
      ...status,
      sentAt,
      viewedAt,
      signedAt: null,
      completedAt: null,
    }
  }

  if (!completedAt) {
    return {
      ...status,
      sentAt,
      viewedAt,
      signedAt,
      completedAt: null,
    }
  }

  return {
    ...status,
    sentAt,
    viewedAt,
    signedAt: signedAt || completedAt,
    completedAt,
  }
}

/** Prefer stored timestamps; fill gaps from Dropbox Sign only for the matching request. */
export function mergeEsignStatusWithDropbox(
  status: DealInvestorEsignStatus,
  dropbox: DealEsignDropboxDetail | null | undefined,
  options?: { signatureRequestId?: string | null },
): DealInvestorEsignStatus {
  const base = sanitizeEsignStageTimestamps(status)
  if (!dropbox) return base

  const expected = options?.signatureRequestId?.trim() ?? ""
  const dropboxId = dropbox.signatureRequestId?.trim() ?? ""
  if (!dropboxId || !expected || expected !== dropboxId) return base

  const primary = dropbox.signers[0]
  const viewedAt =
    base.viewedAt?.trim() ||
    dropbox.lastViewedAt?.trim() ||
    primary?.lastViewedAt?.trim() ||
    null
  const signedAt =
    base.signedAt?.trim() ||
    dropbox.lastSignedAt?.trim() ||
    primary?.signedAt?.trim() ||
    null
  const completedAt =
    base.completedAt?.trim() ||
    (dropbox.isComplete ? dropbox.completeAt?.trim() || signedAt : null) ||
    null

  return sanitizeEsignStageTimestamps({
    ...base,
    viewedAt: viewedAt || null,
    signedAt: signedAt || null,
    completedAt: completedAt || null,
  })
}

export function formatDropboxSignerStatusCode(code: string | null | undefined): string {
  const c = String(code ?? "").trim().toLowerCase()
  if (!c) return "—"
  const labels: Record<string, string> = {
    awaiting_signature: "Awaiting signature",
    viewed: "Viewed",
    signed: "Signed",
    on_hold: "On hold",
    declined: "Declined",
    error_converting: "Error",
    error_file: "File error",
  }
  return labels[c] ?? c.replace(/_/g, " ")
}

export function esignWorkflowSteps(
  status: DealInvestorEsignStatus,
): EsignWorkflowStep[] {
  const sentAt = status.sentAt?.trim() || null
  const viewedAt = status.viewedAt?.trim() || null
  const signedAt = status.signedAt?.trim() || null
  const completedAt = status.completedAt?.trim() || null
  const signedDone = Boolean(signedAt)
  const signedAtForDisplay = signedAt

  const defs: Array<{
    key: EsignWorkflowStepKey
    label: string
    at: string | null
    done: boolean
  }> = [
    { key: "sent", label: "Sent", at: sentAt, done: Boolean(sentAt) },
    { key: "viewed", label: "Viewed", at: viewedAt, done: Boolean(viewedAt) },
    {
      key: "signed",
      label: "Signed",
      at: signedAtForDisplay,
      done: signedDone,
    },
    {
      key: "completed",
      label: "Completed",
      at: completedAt,
      done: Boolean(completedAt),
    },
  ]
  return defs.map(({ key, label, at, done }) => {
    const atIso = at?.trim() || null
    const showTimestamp = Boolean(done && atIso)
    return {
      key,
      label,
      done,
      atIso: showTimestamp ? atIso : null,
      atDisplay: showTimestamp ? formatEsignStepTimestamp(atIso!) : "Not yet",
    }
  })
}

export interface EsignDocumentStatusRow {
  fileId: string
  name: string
  sentDisplay: string
  viewedDisplay: string
  signedDisplay: string
  completedDisplay: string
}

export function esignDocumentStatusRows(
  status: DealInvestorEsignStatus,
): EsignDocumentStatusRow[] {
  const steps = esignWorkflowSteps(status)
  const sentDisplay =
    steps.find((s) => s.key === "sent")?.atDisplay ?? "Not yet"
  const viewedDisplay =
    steps.find((s) => s.key === "viewed")?.atDisplay ?? "Not yet"
  const signedDisplay =
    steps.find((s) => s.key === "signed")?.atDisplay ?? "Not yet"
  const completedDisplay =
    steps.find((s) => s.key === "completed")?.atDisplay ?? "Not yet"
  const docs = status.documents?.length
    ? status.documents
    : [{ fileId: "—", name: "Documents" }]
  return docs.map((d) => ({
    fileId: d.fileId,
    name: d.name,
    sentDisplay,
    viewedDisplay,
    signedDisplay,
    completedDisplay,
  }))
}

export function formatEsignStepTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return formatDateDdMmmYyyy(iso)
  const date = formatDateDdMmmYyyy(d)
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${date} · ${time}`
}

/** Absolute browser URL for an eSign document path from the API (`/uploads/...` or relative). */
export function resolveEsignDocumentUrlForViewer(
  url: string | null | undefined,
): string | null {
  const raw = String(url ?? "").trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  const segment = raw.replace(/^\/uploads\/?/i, "").replace(/^\/+/, "")
  const path = segment
    ? dealAssetRelativePathToUploadsUrl(segment)
    : raw.startsWith("/")
      ? raw
      : dealAssetRelativePathToUploadsUrl(raw)
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  const origin = getUploadsPublicOrigin().replace(/\/$/, "")
  return origin ? `${origin}${path}` : path
}

function signedPdfRelativePathFromStatus(
  status: DealInvestorEsignStatus,
  doc?: { signedRelativePath?: string },
): string | null {
  const rel =
    doc?.signedRelativePath?.trim() ||
    status.documents.find((d) => d.signedRelativePath?.trim())?.signedRelativePath?.trim() ||
    ""
  return rel || null
}

function uploadsUrlFromRelativePath(rel: string): string | null {
  const path = dealAssetRelativePathToUploadsUrl(rel.trim())
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  const origin = getUploadsPublicOrigin().replace(/\/$/, "")
  return origin ? `${origin}${path}` : path
}

/** Browser URL for the combined signed PDF after eSign completion (sponsors / investors). */
export function resolveEsignSignedPdfUrl(
  status: DealInvestorEsignStatus,
): string | null {
  if (!status.completedAt?.trim() && !status.signedAt?.trim()) return null
  const rel = signedPdfRelativePathFromStatus(status)
  if (!rel) return null
  return uploadsUrlFromRelativePath(rel)
}

/** Signed PDF URL for a document row (same combined PDF when paths match). */
export function resolveEsignSignedPdfUrlForDocument(
  status: DealInvestorEsignStatus,
  doc: { signedRelativePath?: string },
): string | null {
  if (!status.completedAt?.trim() && !status.signedAt?.trim()) return null
  const rel = signedPdfRelativePathFromStatus(status, doc)
  if (!rel) return null
  return uploadsUrlFromRelativePath(rel)
}

/** Pending document preview (investor questionnaire + W-9 merged into template). */
export function resolveEsignPendingDocumentViewUrl(doc: {
  templateRelativePath?: string
}): string | null {
  const rel = doc.templateRelativePath?.trim()
  if (!rel) return null
  return uploadsUrlFromRelativePath(rel)
}

export function esignSignedPdfDownloadFilename(
  row: DealInvestorRow,
): string {
  const name = row.displayName?.trim()
  const base =
    name && name !== "—"
      ? name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80)
      : "investor"
  return `${base}-signed-esign.pdf`
}

export function investorEsignIsCompleted(
  status: DealInvestorEsignStatus,
  row: DealInvestorRow,
): boolean {
  if (status.completedAt?.trim()) return true
  if (status.signedAt?.trim()) return true
  const signedLabel = String(row.signedDate ?? "").trim().toLowerCase()
  return signedLabel === "completed" || signedLabel === "signed"
}

/** True when this investor row’s eSign workflow is fully completed. */
export function investorEsignIsFullyCompletedForRow(
  row: DealInvestorRow,
): boolean {
  const resolved = resolveInvestorRowEsignStatus(row)
  if (resolved) return investorEsignIsCompleted(resolved, row)
  if (row.esignStatus) return investorEsignIsCompleted(row.esignStatus, row)
  return String(row.signedDate ?? "").trim().toLowerCase() === "completed"
}

/**
 * True when Invest Now is done for this profile (e-sign complete, or ETL
 * rows that already have a calendar signed date and a commitment).
 */
export function investorInvestmentProfileIsComplete(
  row: DealInvestorRow,
): boolean {
  if (investorEsignIsFullyCompletedForRow(row)) return true
  const doc = String(row.docSignedDateIso ?? row.signedDate ?? "").trim()
  if (!doc) return false
  if (ESIGN_WORKFLOW_COLUMN_LABELS.has(doc.toLowerCase())) return false
  return investorRowCommittedNumeric(row) > 0
}

/**
 * True when the signed-in LP owns this investor row (email and/or portal `contactId`).
 */
export function investorRowMatchesViewerEmail(
  row: DealInvestorRow,
  viewerEmailNorm: string,
): boolean {
  const em = String(row.userEmail ?? "").trim().toLowerCase()
  if (viewerEmailNorm && em && em !== "—" && em === viewerEmailNorm) {
    return true
  }
  const viewerUserId = getSessionUserId().trim().toLowerCase()
  if (!viewerUserId) return false
  const cid = String(row.contactId ?? "").trim().toLowerCase()
  return Boolean(cid && cid === viewerUserId)
}

/** Raw committed on the row (ignores eSign visibility rules). */
export function investorRowCommittedNumeric(row: DealInvestorRow): number {
  const n = parseMoneyDigits(String(row.committed ?? ""))
  if (Number.isFinite(n) && n > 0) return n
  const raw = String(row.commitmentAmountRaw ?? "").trim()
  const extras = row.extraContributionAmounts ?? []
  const nums = [raw, ...extras.map(String)]
    .map((s) => parseMoneyDigits(s))
    .filter((v) => Number.isFinite(v))
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0)
}

/**
 * Investing portal: show committed amount only after eSign is done (or when no eSign was sent).
 */
export function investorCommittedVisibleToViewer(row: DealInvestorRow): boolean {
  if (investorRowCommittedNumeric(row) <= 0) return false
  if (!investorEsignWasSent(row)) return true
  return investorEsignIsFullyCompletedForRow(row)
}

function fallbackSentAtIso(row: DealInvestorRow): string {
  const docIso = String(row.docSignedDateIso ?? "").trim()
  if (docIso && !["pending", "completed", "sent"].includes(docIso.toLowerCase())) {
    const d = new Date(docIso)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const invested = String(row.investedAtIso ?? "").trim()
  if (invested) {
    const d = new Date(invested)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

/** Rebuild status for modal when list has workflow label but `esignStatus` was not parsed. */
/** True when this profile's eSign send is fully completed (not merely sent). */
export function isProfileTabEsignCompleted(
  send: Pick<DealInvestorEsignSendStatus, "completedAt"> | null | undefined,
): boolean {
  return Boolean(send?.completedAt?.trim())
}

/** Stored stage timestamps for one profile send (strict — no inferred stages). */
export function esignStatusFromSendRecord(
  send: DealInvestorEsignSendStatus,
  documents?: DealInvestorEsignDocumentRef[],
): DealInvestorEsignStatus {
  return sanitizeEsignStageTimestamps({
    sentAt: send.sentAt,
    viewedAt: send.viewedAt?.trim() || null,
    signedAt: send.signedAt?.trim() || null,
    completedAt: send.completedAt?.trim() || null,
    documents: documents ?? send.documents,
  })
}

export function fallbackEsignStatusForRow(
  row: DealInvestorRow,
): DealInvestorEsignStatus | null {
  const categoryId = resolveInvestorEsignCategoryId(row)
  const parsed =
    parseEsignStatusFromApi(row.esignStatus, categoryId) ??
    parseEsignStatusFromApi(row.esignStatusBundleJson, categoryId)
  if (parsed?.sentAt?.trim()) return parsed

  const legacy = String(row.signedDate ?? "").trim().toLowerCase()
  if (!ESIGN_WORKFLOW_COLUMN_LABELS.has(legacy)) return null

  const sentAt = fallbackSentAtIso(row)
  const base: DealInvestorEsignStatus = {
    sentAt,
    viewedAt: null,
    signedAt: null,
    completedAt: null,
    documents: row.esignStatus?.documents ?? [],
  }

  if (legacy === "completed") {
    return {
      ...base,
      viewedAt: sentAt,
      signedAt: sentAt,
      completedAt: sentAt,
    }
  }
  if (legacy === "signed") {
    return { ...base, viewedAt: sentAt, signedAt: sentAt }
  }
  if (legacy === "viewed") {
    return { ...base, viewedAt: sentAt }
  }
  return base
}
