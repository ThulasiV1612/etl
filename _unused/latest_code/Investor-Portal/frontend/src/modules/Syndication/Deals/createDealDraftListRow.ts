import { formatDealListDateDisplay } from "./dealsListDisplay"
import {
  createDealDraftHasContent,
  loadCreateDealDraft,
} from "./createDealFormDraftStorage"
import type { DealListRow } from "./types/deals.types"

export const CREATE_DEAL_DRAFT_ROW_ID = "__create_deal_draft__"

/**
 * Session draft row for the Deals list (create-deal wizard autosave), same idea as
 * `buildAddMemberDraftInvestorRow` for the members table.
 */
export function buildCreateDealDraftListRow(): DealListRow | null {
  const d = loadCreateDealDraft()
  if (!d || !createDealDraftHasContent(d)) return null
  if (d.backendDealId?.trim()) return null
  const { deal } = d
  const closeRaw = deal.closeDate?.trim() ?? ""
  let closeDateDisplay = "—"
  if (closeRaw) {
    const iso = closeRaw.length >= 10 ? closeRaw.slice(0, 10) : closeRaw
    closeDateDisplay = formatDealListDateDisplay(iso)
  }
  const name = deal.dealName.trim() || "Untitled deal"
  return {
    id: CREATE_DEAL_DRAFT_ROW_ID,
    dealName: name,
    dealType: "",
    dealStage: deal.dealStage ? String(deal.dealStage) : "",
    totalInProgress: "—",
    totalAccepted: "—",
    raiseTarget: "—",
    distributions: "—",
    investors: "—",
    closeDateDisplay,
    createdDateDisplay: "Draft",
    startDateDisplay: "—",
    archived: false,
  }
}
