import { getApiV1Base } from "../../../common/utils/apiBaseUrl"

export type CompanyBranding = {
  logoImageUrl: string | null
  backgroundImageUrl: string | null
  logoIconUrl: string | null
  /** Settings tab `updated_at` — changes when any workspace settings (incl. branding) save, for cache-busting */
  settingsTabUpdatedAt: string | null
}

/** Busts browser cache for `/uploads/...` when settings (and thus asset paths) change. */
export function withBrandingVersionOnUrl(
  href: string,
  version: string | null | undefined,
): string {
  if (!href || !version) return href
  /** Cloudinary delivery URLs already encode version in the path; `?v=` can interfere with their query parsing. */
  if (/[./]res\.cloudinary\.com\//i.test(href)) return href
  const sep = href.includes("?") ? "&" : "?"
  return `${href}${sep}cb=${encodeURIComponent(version)}`
}

export function brandingFromSettingsPayload(
  p: Record<string, unknown>,
): CompanyBranding {
  const b = p as Record<string, unknown>
  return {
    logoImageUrl:
      typeof p.logoImageUrl === "string" && p.logoImageUrl.trim()
        ? p.logoImageUrl.trim()
        : null,
    backgroundImageUrl:
      typeof p.backgroundImageUrl === "string" && p.backgroundImageUrl.trim()
        ? p.backgroundImageUrl.trim()
        : null,
    logoIconUrl: (() => {
      const primary =
        typeof b.logoIconUrl === "string" && b.logoIconUrl.trim()
          ? b.logoIconUrl.trim()
          : ""
      const alt =
        typeof b.logoIcon === "string" && b.logoIcon.trim()
          ? b.logoIcon.trim()
          : ""
      return primary || alt || null
    })(),
    settingsTabUpdatedAt: (() => {
      const v = b.settingsTabUpdatedAt
      if (typeof v === "string" && v.trim()) return v.trim()
      return null
    })(),
  }
}

/** For sign-in and other unauthenticated pages (use `?companyId=` or `VITE_BRANDING_COMPANY_ID`). */
export async function fetchPublicCompanyBranding(
  companyId: string,
): Promise<CompanyBranding | null> {
  const base = getApiV1Base()
  if (!base || !companyId.trim()) return null
  try {
    const res = await fetch(
      `${base}/public/company-branding/${encodeURIComponent(companyId.trim())}`,
      { cache: "no-store" },
    )
    if (!res.ok) return null
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return brandingFromSettingsPayload(d)
  } catch {
    return null
  }
}
