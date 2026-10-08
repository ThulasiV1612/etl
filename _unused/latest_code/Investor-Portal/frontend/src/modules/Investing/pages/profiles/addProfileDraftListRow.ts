import {
  addProfileDraftDisplayName,
  addProfileDraftHasContent,
  AUTOSAVE_DEFAULT_PROFILE_NAME,
  loadAddProfileDraft,
} from "./addProfileFormDraftStorage"
import type { InvestorProfileListRow } from "./investor-profiles.types"

export const ADD_PROFILE_DRAFT_ROW_ID = "__add_profile_draft__"

type ProfileDraftApiRow = Pick<InvestorProfileListRow, "id" | "isDraft">

/**
 * After backend autosave the roster lists the draft profile — appending the session row
 * would duplicate the same profile until the list refetches.
 */
export function isAddProfileSessionDraftRedundantWithApiRows(
  apiRows: readonly ProfileDraftApiRow[],
): boolean {
  const draft = loadAddProfileDraft()
  if (!draft || !addProfileDraftHasContent(draft)) return false
  const bid = draft.backendProfileId?.trim()
  if (!bid) return false
  return apiRows.some((r) => String(r.id) === bid && r.isDraft)
}

/**
 * Session draft row for the profiles list (add-profile wizard autosave), same idea as
 * `buildCreateDealDraftListRow` for deals and `buildAddMemberDraftInvestorRow` for members.
 */
export function buildAddProfileDraftListRow(
  apiRows: readonly ProfileDraftApiRow[] = [],
): InvestorProfileListRow | null {
  const d = loadAddProfileDraft()
  if (!d || !addProfileDraftHasContent(d)) return null
  if (isAddProfileSessionDraftRedundantWithApiRows(apiRows)) return null
  const name = addProfileDraftDisplayName(d.form)
  const profileType = String(d.form.profileType ?? "").trim() || "—"
  return {
    id: ADD_PROFILE_DRAFT_ROW_ID,
    profileName: name === "—" ? AUTOSAVE_DEFAULT_PROFILE_NAME : name,
    profileType,
    addedBy: "—",
    investmentsCount: 0,
    dateCreated: new Date().toISOString(),
    isDraft: true,
  }
}

export function isInvestorProfileListRowIncomplete(
  row: InvestorProfileListRow,
): boolean {
  if (row.id === ADD_PROFILE_DRAFT_ROW_ID) return true
  return Boolean(row.isDraft)
}
