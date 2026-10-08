import usLocationsJson from "./us-locations.json"

export interface UsStateLocation {
  code: string
  name: string
  cities: string[]
}

export interface UsLocationsData {
  countryCode: string
  states: UsStateLocation[]
}

export const US_LOCATIONS: UsLocationsData = usLocationsJson as UsLocationsData

export function isUnitedStatesCountry(countryValue: string): boolean {
  return countryValue === "US"
}

export function getUsStateDropdownOptions(): { value: string; label: string }[] {
  return US_LOCATIONS.states.map((s) => ({ value: s.code, label: s.name }))
}

export function getUsCitiesForStateCode(stateCode: string): string[] {
  const t = stateCode.trim()
  if (!t) return []
  const row = US_LOCATIONS.states.find(
    (s) => s.code.toUpperCase() === t.toUpperCase(),
  )
  return row?.cities ?? []
}

/**
 * Maps a saved `state` value (USPS code or full state name) to a USPS code for selects.
 */
export function resolveUsStateCodeForDraft(stateRaw: string): string {
  const t = stateRaw.trim()
  if (!t) return ""
  const byCode = US_LOCATIONS.states.find(
    (s) => s.code.toUpperCase() === t.toUpperCase(),
  )
  if (byCode) return byCode.code
  const byName = US_LOCATIONS.states.find(
    (s) => s.name.toLowerCase() === t.toLowerCase(),
  )
  return byName?.code ?? ""
}

/** Full state name for display when `stateRaw` is a USPS code or already a name. */
export function getUsStateDisplayName(stateRaw: string): string {
  const t = stateRaw.trim()
  if (!t) return ""
  const code = resolveUsStateCodeForDraft(stateRaw)
  if (code) {
    const row = US_LOCATIONS.states.find((s) => s.code === code)
    return row?.name ?? t
  }
  return t
}
