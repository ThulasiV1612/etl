import type { InvestorProfileListRow } from "./investor-profiles.types"

export const PROFILE_DUPLICATE_MESSAGE =
  "A profile with this name and type already exists."

function profileKey(profileName: string, profileType: string): string {
  const name = (profileName ?? "").trim().toLowerCase() || "—"
  const type = (profileType ?? "").trim().toLowerCase() || "—"
  return `${name}|${type}`
}

/** True if another active (non-archived) profile shares the same display name and type. */
export function hasActiveProfileDuplicate(
  profiles: InvestorProfileListRow[],
  profileName: string,
  profileType: string,
  excludeProfileId?: string,
): boolean {
  const target = profileKey(profileName, profileType)
  return profiles.some((p) => {
    if (p.archived) return false
    if (excludeProfileId && p.id === excludeProfileId) return false
    return profileKey(p.profileName, p.profileType) === target
  })
}
