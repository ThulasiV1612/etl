import { readRuntimeInvestmentRowById } from "../investmentsRuntimeStore"
import type { InvestmentDetailRecord } from "../investments.types"

/** Deal UUID for API / document storage (not `runtime-…` list id). */
export function resolveInvestmentDealId(
  detail: InvestmentDetailRecord,
): string {
  const fromList = detail.list.dealId?.trim()
  if (fromList) return fromList
  const rawId = detail.id.trim()
  if (!rawId) return ""
  if (rawId.startsWith("runtime-")) {
    return readRuntimeInvestmentRowById(rawId)?.dealId?.trim() || ""
  }
  return rawId
}
