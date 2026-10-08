/**
 * CountriesNow.space API client (https://countriesnow.space/api/v0.1).
 *
 * Replace this module with another provider later by matching the exported
 * {@link UsLocationService} shape from `usLocationService.ts`.
 */

export const COUNTRIES_NOW_SPACE_BASE =
  "https://countriesnow.space/api/v0.1" as const

/** API expects full country name for United States requests. */
export const UNITED_STATES_COUNTRY_NAME = "United States" as const

interface CountriesNowEnvelope {
  error?: boolean
  msg?: string
}

interface StatesResponse extends CountriesNowEnvelope {
  data?: {
    name?: string
    iso2?: string
    states?: { name?: string; state_code?: string }[]
  }
}

interface StateCitiesResponse extends CountriesNowEnvelope {
  data?: string[]
}

interface AllCitiesResponse extends CountriesNowEnvelope {
  /** Flat list of city names (no state) — see {@link cacheAllUnitedStatesCitiesFlat}. */
  data?: string[]
}

async function postCountriesNow<T extends CountriesNowEnvelope>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const url = `${COUNTRIES_NOW_SPACE_BASE}${path}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T
  if (!res.ok) {
    const msg =
      data.msg != null ? String(data.msg) : `HTTP ${res.status}`
    throw new Error(msg)
  }
  if (data.error === true) {
    throw new Error(data.msg != null ? String(data.msg) : "CountriesNow error")
  }
  return data
}

export interface UsStateOption {
  code: string
  name: string
}

/**
 * POST /countries/states — states for a country.
 * Body: `{ "country": "United States" }`
 */
export async function fetchUnitedStatesStates(): Promise<UsStateOption[]> {
  const json = await postCountriesNow<StatesResponse>("/countries/states", {
    country: UNITED_STATES_COUNTRY_NAME,
  })
  const rows = json.data?.states ?? []
  const out: UsStateOption[] = []
  for (const s of rows) {
    const name = String(s.name ?? "").trim()
    const code = String(s.state_code ?? "").trim()
    if (!name || !code) continue
    out.push({ code: code.toUpperCase(), name })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * POST /countries/state/cities — cities in a state (requires full state **name**, not USPS code).
 * Body: `{ "country": "United States", "state": "Alabama" }`
 */
export async function fetchUnitedStatesCitiesForStateName(
  stateName: string,
): Promise<string[]> {
  const state = String(stateName ?? "").trim()
  if (!state) return []
  const json = await postCountriesNow<StateCitiesResponse>(
    "/countries/state/cities",
    {
      country: UNITED_STATES_COUNTRY_NAME,
      state,
    },
  )
  const raw = json.data ?? []
  const names = raw.map((c) => String(c).trim()).filter(Boolean)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

/**
 * POST /countries/cities — all cities in country (flat list, **no state** in response).
 * Body: `{ "country": "United States" }`
 *
 * Stored in memory for future search/autocomplete; do not use alone for state→city
 * dropdowns — use {@link fetchUnitedStatesCitiesForStateName} instead.
 */
export async function fetchUnitedStatesAllCitiesFlat(): Promise<string[]> {
  const json = await postCountriesNow<AllCitiesResponse>("/countries/cities", {
    country: UNITED_STATES_COUNTRY_NAME,
  })
  const raw = json.data ?? []
  if (!Array.isArray(raw)) return []
  return raw.map((c) => String(c).trim()).filter(Boolean)
}

let cachedAllUsCitiesFlat: string[] | null = null
let inflightAllCities: Promise<string[]> | null = null

/** In-memory cache for the flat `/countries/cities` list (optional background load). */
export function cacheAllUnitedStatesCitiesFlat(): Promise<string[]> {
  if (cachedAllUsCitiesFlat) return Promise.resolve(cachedAllUsCitiesFlat)
  if (!inflightAllCities) {
    inflightAllCities = fetchUnitedStatesAllCitiesFlat().then((list) => {
      cachedAllUsCitiesFlat = list
      inflightAllCities = null
      return list
    })
  }
  return inflightAllCities
}

let cachedStates: UsStateOption[] | null = null
let inflightStates: Promise<UsStateOption[]> | null = null

export function getCachedUnitedStatesStates(): UsStateOption[] | null {
  return cachedStates
}

export function loadUnitedStatesStatesCached(): Promise<UsStateOption[]> {
  if (cachedStates) return Promise.resolve(cachedStates)
  if (!inflightStates) {
    inflightStates = fetchUnitedStatesStates().then((list) => {
      cachedStates = list
      inflightStates = null
      return list
    })
  }
  return inflightStates
}

const citiesByStateName = new Map<string, string[]>()
const inflightCities = new Map<string, Promise<string[]>>()

export function resolveStateNameFromCode(
  states: UsStateOption[],
  stateCode: string,
): string {
  const code = stateCode.trim().toUpperCase()
  if (!code) return ""
  const row = states.find((s) => s.code === code)
  return row?.name ?? ""
}

/** Cached per state name (API requires full name). */
export function loadUnitedStatesCitiesForStateCached(
  stateName: string,
): Promise<string[]> {
  const key = stateName.trim().toLowerCase()
  if (!key) return Promise.resolve([])
  const hit = citiesByStateName.get(key)
  if (hit) return Promise.resolve(hit)

  let p = inflightCities.get(key)
  if (!p) {
    p = fetchUnitedStatesCitiesForStateName(stateName)
      .then((list) => {
        citiesByStateName.set(key, list)
        return list
      })
      .finally(() => {
        inflightCities.delete(key)
      })
    inflightCities.set(key, p)
  }
  return p
}

export function clearUnitedStatesLocationCaches(): void {
  cachedStates = null
  cachedAllUsCitiesFlat = null
  citiesByStateName.clear()
  inflightStates = null
  inflightAllCities = null
}
