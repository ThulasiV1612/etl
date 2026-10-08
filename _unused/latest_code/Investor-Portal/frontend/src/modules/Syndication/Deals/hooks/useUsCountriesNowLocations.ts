import { useEffect, useMemo, useRef, useState } from "react"
import type { UsStateOption } from "../services/countriesNowSpaceApi"
import {
  createDefaultUsLocationService,
  type UsLocationService,
} from "../services/usLocationService"
import {
  getUsCitiesForStateCode,
  getUsStateDropdownOptions,
} from "../constants/usLocations"

export interface UseUsCountriesNowLocationsResult {
  stateOptions: { value: string; label: string }[]
  cityNames: string[]
  statesLoading: boolean
  citiesLoading: boolean
  statesError: string | null
  citiesError: string | null
  /** True once we have a usable city list (API or static fallback). */
  citiesReady: boolean
  /** Background: full US city list from `/countries/cities` (optional). */
  allCitiesFlatLoaded: boolean
}

interface UseUsCountriesNowLocationsParams {
  enabled: boolean
  selectedStateCode: string
  /** Current city from form — kept visible even if not in list yet. */
  selectedCity: string
  /** Override service (e.g. tests). */
  service?: UsLocationService
}

/**
 * Loads US states from CountriesNow; loads cities per state via
 * `/countries/state/cities`. Prefetches flat `/countries/cities` in the
 * background. Falls back to bundled `us-locations.json` if API calls fail.
 */
export function useUsCountriesNowLocations({
  enabled,
  selectedStateCode,
  selectedCity,
  service: serviceProp,
}: UseUsCountriesNowLocationsParams): UseUsCountriesNowLocationsResult {
  const service = useMemo(
    () => serviceProp ?? createDefaultUsLocationService(),
    [serviceProp],
  )

  const [states, setStates] = useState<UsStateOption[] | null>(null)
  const [statesLoading, setStatesLoading] = useState(false)
  const [statesError, setStatesError] = useState<string | null>(null)

  const [apiCities, setApiCities] = useState<string[] | null>(null)
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [citiesError, setCitiesError] = useState<string | null>(null)
  const [allCitiesFlatLoaded, setAllCitiesFlatLoaded] = useState(false)

  const effectiveStates = useMemo((): UsStateOption[] | null => {
    if (states?.length) return states
    if (statesError) {
      return getUsStateDropdownOptions().map((o) => ({
        code: o.value,
        name: o.label,
      }))
    }
    return null
  }, [states, statesError])

  const statesRef = useRef<UsStateOption[] | null>(null)
  statesRef.current = effectiveStates

  useEffect(() => {
    if (!enabled) {
      setStates(null)
      setStatesError(null)
      return
    }
    let cancelled = false
    setStatesLoading(true)
    setStatesError(null)
    void service
      .loadStates()
      .then((list) => {
        if (!cancelled) {
          setStates(list)
          setStatesLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStatesError(
            e instanceof Error ? e.message : "Could not load states",
          )
          setStatesLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, service])

  useEffect(() => {
    if (!enabled || !selectedStateCode.trim()) {
      setApiCities(null)
      setCitiesError(null)
      setCitiesLoading(false)
      return
    }
    const st = statesRef.current
    if (!st?.length) return

    let cancelled = false
    setCitiesLoading(true)
    setCitiesError(null)
    void service
      .loadCitiesForStateCode(st, selectedStateCode)
      .then((list) => {
        if (!cancelled) {
          setApiCities(list)
          setCitiesLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setCitiesError(
            e instanceof Error ? e.message : "Could not load cities",
          )
          setApiCities(null)
          setCitiesLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, service, selectedStateCode, effectiveStates])

  useEffect(() => {
    if (!enabled) return
    const s = service.prefetchAllCitiesFlat
    if (!s) return
    let cancelled = false
    void s()
      .then(() => {
        if (!cancelled) setAllCitiesFlatLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setAllCitiesFlatLoaded(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, service])

  const stateOptions = useMemo(() => {
    if (!enabled) return []
    if (states?.length) {
      return states.map((s) => ({ value: s.code, label: s.name }))
    }
    if (statesError) return getUsStateDropdownOptions()
    return []
  }, [enabled, states, statesError])

  const staticFallbackCities = useMemo(() => {
    if (!enabled || !selectedStateCode.trim()) return []
    return getUsCitiesForStateCode(selectedStateCode)
  }, [enabled, selectedStateCode])

  const cityNames = useMemo(() => {
    if (!enabled || !selectedStateCode.trim()) return []
    let list = apiCities
    if (!list?.length && (citiesError || !citiesLoading)) {
      list = staticFallbackCities
    }
    if (!list?.length) return []
    const c = selectedCity.trim()
    if (c && !list.includes(c)) return [...list, c].sort((a, b) => a.localeCompare(b))
    return list
  }, [
    enabled,
    selectedStateCode,
    apiCities,
    citiesError,
    citiesLoading,
    staticFallbackCities,
    selectedCity,
  ])

  const citiesReady = useMemo(() => {
    if (!enabled || !selectedStateCode.trim()) return true
    if (citiesLoading) return false
    return cityNames.length > 0 || Boolean(citiesError)
  }, [enabled, selectedStateCode, citiesLoading, cityNames.length, citiesError])

  return {
    stateOptions,
    cityNames,
    statesLoading,
    citiesLoading,
    statesError,
    citiesError,
    citiesReady,
    allCitiesFlatLoaded,
  }
}
