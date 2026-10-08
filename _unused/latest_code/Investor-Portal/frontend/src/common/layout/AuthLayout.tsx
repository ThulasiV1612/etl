import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  fetchPublicCompanyBranding,
  withBrandingVersionOnUrl,
  type CompanyBranding,
} from "@/modules/Syndication/company/companyBranding"
import defaultAuthLogo from "@/assets/images/updated_syndicationx_logo.png"
import { formatAppDocumentTitle } from "../utils/appDocumentTitle"
import { normalizeDealGallerySrc } from "../utils/apiBaseUrl"
// import { ThemeToggleButton } from "../theme/ThemeToggleButton"
import "./auth_layout.css"
import "../../modules/auth/styles/auth_forms.css"

interface AuthLayoutProps {
  title?: string
  caption?: string | null
  subtitle?: string | null
  children: ReactNode
  authPageClassName?: string
}

export default function AuthLayout({
  title,
  caption,
  subtitle,
  children,
  authPageClassName = "",
}: AuthLayoutProps) {
  const [searchParams] = useSearchParams()
  const [branding, setBranding] = useState<CompanyBranding | null>(null)

  const brandingCompanyId = useMemo(() => {
    return (
      searchParams.get("companyId")?.trim() ||
      (import.meta.env.VITE_BRANDING_COMPANY_ID as string | undefined)?.trim() ||
      ""
    )
  }, [searchParams])

  useEffect(() => {
    if (!brandingCompanyId) {
      setBranding(null)
      return
    }
    let cancelled = false
    void (async () => {
      const b = await fetchPublicCompanyBranding(brandingCompanyId)
      if (!cancelled) setBranding(b)
    })()
    return () => {
      cancelled = true
    }
  }, [brandingCompanyId])

  const rawTitle = title?.trim()
  useEffect(() => {
    if (!rawTitle) document.title = formatAppDocumentTitle("Sign in")
    else if (rawTitle.includes("|")) document.title = rawTitle
    else document.title = formatAppDocumentTitle(rawTitle)
  }, [rawTitle])

  useEffect(() => {
    const u = branding?.logoIconUrl
    if (!u) return
    const href = withBrandingVersionOnUrl(
      normalizeDealGallerySrc(u),
      branding?.settingsTabUpdatedAt,
    )
    if (!href) return
    let link = document.querySelector(
      "link[rel~='icon']",
    ) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      document.head.appendChild(link)
    }
    link.href = href
  }, [branding?.logoIconUrl, branding?.settingsTabUpdatedAt])

  const logoSrc = useMemo(() => {
    const u = branding?.logoImageUrl
    if (u) {
      return withBrandingVersionOnUrl(
        normalizeDealGallerySrc(u),
        branding?.settingsTabUpdatedAt,
      )
    }
    return defaultAuthLogo
  }, [branding?.logoImageUrl, branding?.settingsTabUpdatedAt])

  const authPageClasses = ["authPage", authPageClassName].filter(Boolean).join(" ")
  const isDefaultLogo = !branding?.logoImageUrl

  return (
    <div className={authPageClasses}>
      <div className="authPage_ambient" aria-hidden />
      {/* Theme toggle disabled on auth pages
      <div className="authPage_toolbar">
        <ThemeToggleButton />
      </div>
      */}
      <div className="authContent">
        <div className="loginData">
          <div className="loginCred">
            <div className="loginForm auth_card">
              <header className="auth_card_header">
                <div
                  className={`auth_card_logo${isDefaultLogo ? " auth_card_logo--product" : ""}`}
                >
                  <img
                    src={logoSrc}
                    alt="SyndicationX"
                    className="auth_card_logo_img"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                  />
                </div>
                {/* {isDefaultLogo ? (
                  <p className="auth_card_eyebrow">Investor portal</p>
                ) : null} */}
                {caption ? (
                  <h1 className="auth_card_title">{caption}</h1>
                ) : null}
                {subtitle ? (
                  <p className="auth_card_subtitle">{subtitle}</p>
                ) : null}
              </header>
              <div className="auth_card_body">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
