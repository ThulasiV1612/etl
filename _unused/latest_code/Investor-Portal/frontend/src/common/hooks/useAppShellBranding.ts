import { useCallback, useEffect, useRef, useState } from "react"
import { getSessionOrganizationCompanyId } from "../auth/sessionOrganization"
import {
  type CompanyBranding,
  fetchPublicCompanyBranding,
  withBrandingVersionOnUrl,
} from "@/modules/Syndication/company/companyBranding"
import { normalizeDealGallerySrc } from "../utils/apiBaseUrl"

const COMPANY_BRANDING_UPDATED = "company-branding-updated"

/**
 * Public workspace branding for the current session company: sidebar lockup, tab icon, etc.
 *
 * Fetches when the **session workspace company id** changes, or when `company-branding-updated`
 * fires. Does **not** re-fetch on every route change — that kept `branding` in a "loading" state
 * and made the sidebar logo vanish (blink) on each navigation.
 */
export function useAppShellBranding() {
  const [branding, setBranding] = useState<CompanyBranding | null>(null)
  const [bump, setBump] = useState(0)
  const initialFaviconHref = useRef<string | null>(null)
  /** Tracks which org id the current `branding` state (or in-flight fetch) applies to. */
  const lastOrgIdForBrandingRef = useRef<string | null>(null)

  const refetch = useCallback(() => setBump((b) => b + 1), [])

  useEffect(() => {
    const onBrand = () => refetch()
    window.addEventListener(COMPANY_BRANDING_UPDATED, onBrand)
    return () => window.removeEventListener(COMPANY_BRANDING_UPDATED, onBrand)
  }, [refetch])

  const companyId = getSessionOrganizationCompanyId() ?? ""

  useEffect(() => {
    if (!companyId) {
      lastOrgIdForBrandingRef.current = null
      setBranding(null)
      return
    }
    const orgChanged = lastOrgIdForBrandingRef.current !== companyId
    if (orgChanged) {
      lastOrgIdForBrandingRef.current = companyId
      // Only clear the lockup when switching to a different workspace — not on every route.
      setBranding(null)
    }
    let cancelled = false
    void (async () => {
      const b = await fetchPublicCompanyBranding(companyId)
      if (cancelled) return
      setBranding(b)
    })()
    return () => {
      cancelled = true
    }
  }, [bump, companyId])

  const sidebarLogoSrc: string | null = (() => {
    if (!companyId || !branding) return null
    const u = branding.logoImageUrl
    if (!u) return null
    return withBrandingVersionOnUrl(
      normalizeDealGallerySrc(u),
      branding.settingsTabUpdatedAt,
    )
  })()

  useEffect(() => {
    if (typeof document === "undefined") return
    if (initialFaviconHref.current === null) {
      const l = document.querySelector(
        "link[rel~='icon']",
      ) as HTMLLinkElement | null
      initialFaviconHref.current = l?.getAttribute("href") ?? ""
    }
    const resetToInitial = () => {
      const def = initialFaviconHref.current
      if (def == null) return
      let link = document.querySelector("link[rel~='icon']") as
        | HTMLLinkElement
        | null
      if (!link) {
        link = document.createElement("link")
        link.rel = "icon"
        document.head.appendChild(link)
      }
      link.setAttribute("href", def)
    }
    const id = getSessionOrganizationCompanyId()
    if (!id) {
      resetToInitial()
      return
    }
    if (!branding) {
      resetToInitial()
      return
    }
    const u = branding.logoIconUrl
    if (!u) {
      resetToInitial()
      return
    }
    const href = withBrandingVersionOnUrl(
      normalizeDealGallerySrc(u),
      branding.settingsTabUpdatedAt,
    )
    if (!href) {
      resetToInitial()
      return
    }
    let link = document.querySelector("link[rel~='icon']") as
      | HTMLLinkElement
      | null
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.appendChild(link)
    }
    link.setAttribute("href", href)
  }, [branding, companyId, bump])

  return { sidebarLogoSrc }
}
