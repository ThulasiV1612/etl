/**
 * Abstraction for US Country → State → City data.
 * Swap {@link createDefaultUsLocationService} for another implementation
 * (e.g. GeoNames, Google Places) without changing UI components.
 */

import type { UsStateOption } from "./countriesNowSpaceApi"
import {
  cacheAllUnitedStatesCitiesFlat,
  loadUnitedStatesCitiesForStateCached,
  loadUnitedStatesStatesCached,
  resolveStateNameFromCode,
} from "./countriesNowSpaceApi"

export interface UsLocationService {
  loadStates: () => Promise<UsStateOption[]>
  /** `stateCode` is USPS (e.g. AL). */
  loadCitiesForStateCode: (
    states: UsStateOption[],
    stateCode: string,
  ) => Promise<string[]>
  /** Optional: flat national city list (e.g. for search). */
  prefetchAllCitiesFlat?: () => Promise<string[]>
}

export function createCountriesNowUsLocationService(): UsLocationService {
  return {
    loadStates: () => loadUnitedStatesStatesCached(),
    loadCitiesForStateCode: async (states, stateCode) => {
      const name = resolveStateNameFromCode(states, stateCode)
      if (!name) return []
      return loadUnitedStatesCitiesForStateCached(name)
    },
    prefetchAllCitiesFlat: () => cacheAllUnitedStatesCitiesFlat(),
  }
}

export function createDefaultUsLocationService(): UsLocationService {
  return createCountriesNowUsLocationService()
}
