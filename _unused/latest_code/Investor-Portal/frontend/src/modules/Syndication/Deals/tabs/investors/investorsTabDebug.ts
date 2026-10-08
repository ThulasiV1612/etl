import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  investorRowShowsEsignStatusLink,
  investorSignedColumnDisplay,
  resolveInvestorRowEsignStatus,
} from "../../utils/investorEsignStatus"

export type InvestorsTabDebugRow = {
  id: string
  displayName: string
  investorRole: string
  investorKind: string
  signedDate: string
  docSignedDateIso: string
  esignStatusFromApi: unknown
  esignStatusBundleJson: string
  resolvedSentAt: string | null
  columnLabel: string
  clickable: boolean
  hasOnOpenHandler: boolean
}

function summarizeRowForConsole(
  row: DealInvestorRow,
  opts?: { hasOnOpenHandler?: boolean },
): InvestorsTabDebugRow {
  const resolved = resolveInvestorRowEsignStatus(row)
  return {
    id: row.id,
    displayName: row.displayName,
    investorRole: row.investorRole ?? "",
    investorKind: row.investorKind ?? "",
    signedDate: row.signedDate ?? "",
    docSignedDateIso: row.docSignedDateIso ?? "",
    esignStatusFromApi: row.esignStatus ?? null,
    esignStatusBundleJson: String(row.esignStatusBundleJson ?? "").slice(0, 120),
    resolvedSentAt: resolved?.sentAt ?? null,
    columnLabel: investorSignedColumnDisplay(row),
    clickable: investorRowShowsEsignStatusLink(row),
    hasOnOpenHandler: Boolean(opts?.hasOnOpenHandler),
  }
}

/** Console diagnostics for Investors tab Signed column / DataTable rows. */
export function logInvestorsDataTableDebug(params: {
  context: string
  dealId: string
  rows: DealInvestorRow[]
  extra?: Record<string, unknown>
}): void {
  if (!import.meta.env.DEV) return
  const { context, dealId, rows, extra } = params
  console.group(`[InvestorsTab DEBUG] ${context} — dealId=${dealId}`)
  if (extra && Object.keys(extra).length > 0) {
    console.log("extra", extra)
  }
  console.log(`row count: ${rows.length}`)
  if (rows.length === 0) {
    console.warn("No rows passed to DataTable — check API / filters / lpInvestorsOnly")
  } else {
    console.table(
      rows.map((r) =>
        summarizeRowForConsole(r, {
          hasOnOpenHandler: Boolean(extra?.hasOpenEsignStatusModal),
        }),
      ),
    )
    console.log(
      "first row full esignStatus object:",
      rows[0]?.esignStatus ?? null,
    )
    console.log(
      "first row esignStatusBundleJson (raw DB, if sent):",
      rows[0]?.esignStatusBundleJson ?? null,
    )
  }
  console.groupEnd()
}

export function logInvestorsApiResponseDebug(params: {
  dealId: string
  lpInvestorsOnly: boolean
  ok: boolean
  status: number
  raw: unknown
}): void {
  if (!import.meta.env.DEV) return
  const { dealId, lpInvestorsOnly, ok, status, raw } = params
  console.group(
    `[InvestorsTab DEBUG] GET /deals/${dealId}/investors${lpInvestorsOnly ? "?lpInvestorsOnly=1" : ""} — HTTP ${status}`,
  )
  console.log("ok:", ok)
  if (!raw || typeof raw !== "object") {
    console.log("raw body:", raw)
    console.groupEnd()
    return
  }
  const body = raw as Record<string, unknown>
  const investors = Array.isArray(body.investors) ? body.investors : []
  console.log("investor count:", investors.length)
  if (investors[0] && typeof investors[0] === "object") {
    const first = investors[0] as Record<string, unknown>
    console.log("first investor (raw API keys):", {
      id: first.id,
      signedDate: first.signedDate ?? first.signed_date,
      docSignedDate: first.docSignedDate ?? first.doc_signed_date,
      esignStatus: first.esignStatus ?? first.esign_status,
      esignStatusBundleJson:
        first.esignStatusBundleJson ?? first.esign_status_bundle_json,
      esignStatusJson: first.esignStatusJson ?? first.esign_status_json,
    })
  }
  console.groupEnd()
}
