import type { DealInvestorRow } from "../types/deal-investors.types"
import { parseMoneyDigits } from "./offeringMoneyFormat"
import {
  type LpBookProfileFilterRow,
  filterBookProfilesByCommitmentKind,
} from "./lpInvestNowSavedProfileOptions"

/** Stable string for a commitment (profile type enum, saved “My profile” id). */
export function lpProfileUseKey(
  profileId: string,
  userInvestorProfileId: string | null | undefined,
): string {
  return `${String(profileId ?? "").trim()}|${String(userInvestorProfileId ?? "").trim()}`
}

function isPositiveCommitment(committed: string | undefined): boolean {
  const n = parseMoneyDigits(String(committed ?? "").trim())
  return Number.isFinite(n) && n > 0
}

/**
 * Profile keys the viewer can’t choose again: each comes from a **different** deal investor
 * row (same person, positive commitment) than `viewerRowId` (the row updated by Invest now).
 * The viewer’s current row is excluded so they can keep the same profile while editing.
 */
export function buildBlockedProfileKeysForInvestNow(
  investors: DealInvestorRow[] | null | undefined,
  viewerEmailNorm: string,
  viewerRowId: string | null | undefined,
): Set<string> {
  const out = new Set<string>()
  const me = (viewerEmailNorm || "").trim().toLowerCase()
  if (!me) return out
  const myId = (viewerRowId ?? "").trim()
  for (const r of investors ?? []) {
    if (String(r.userEmail ?? "").trim().toLowerCase() !== me) continue
    if (!isPositiveCommitment(r.committed)) continue
    if (myId && r.id === myId) continue
    out.add(
      lpProfileUseKey(String(r.profileId ?? ""), r.userInvestorProfileId),
    )
  }
  return out
}

/** Saved profiles for this commitment type, excluding (profile, book) combos already in use. */
export function availableBookProfilesForCommitmentType(
  commitmentType: string,
  allBook: readonly LpBookProfileFilterRow[],
  blocked: ReadonlySet<string>,
): LpBookProfileFilterRow[] {
  const t = String(commitmentType ?? "").trim()
  if (!t) return []
  return filterBookProfilesByCommitmentKind(allBook, t).filter(
    (p) => !blocked.has(lpProfileUseKey(t, p.id)),
  )
}

/**
 * True if this commitment type has at least one book profile, but all are already used
 * in other rows — show as disabled on the “profile type” control.
 */
export function isInvestorTypeExhaustedByBlocklist(
  commitmentType: string,
  allBook: readonly LpBookProfileFilterRow[],
  blocked: ReadonlySet<string>,
): boolean {
  const t = String(commitmentType ?? "").trim()
  if (!t) return false
  const matching = filterBookProfilesByCommitmentKind(allBook, t)
  if (matching.length === 0) return false
  return matching.every((p) => blocked.has(lpProfileUseKey(t, p.id)))
}

export const ALL_SAVED_PROFILES_IN_USE_ON_DEAL_MSG =
  "You already have a commitment for each of your saved profiles of this type on this deal. Add a new profile in Investing → Profiles, or pick another investor type."

export const CHOSEN_PROFILE_ALREADY_USED_MSG =
  "This profile is already used for a commitment on this deal. Choose a different saved profile or add one in Investing → Profiles."
