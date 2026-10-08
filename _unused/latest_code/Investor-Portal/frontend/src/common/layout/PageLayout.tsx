import { type ComponentType, useEffect, useId, useState } from "react"
import {
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  Columns3,
  ContactRound,
  Eye,
  Files,
  Inbox,
  LayoutDashboard,
  Layers,
  List,
  // LayoutGrid,
  Mails,
  Megaphone,
  Settings,
  Star,
  IdCard,
  TrendingUp,
  Upload,
  // Users,
} from "lucide-react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import {
  getStoredUserRole,
  isLpInvestorSessionUser,
  isPlatformAdmin,
  resolveSyndicationSettingsNavPath,
} from "../auth/roleUtils"
import { canAccessSyndicationSidebarPath } from "../config/sideNavAccess.config"
import { TopNavBar } from "../components/TopNavBar/TopNavBar"
import {
  PortalModeProvider,
  usePortalMode,
} from "@/modules/Investing/context/PortalModeContext"
import {
  isLpDealDetailPath,
  isLpDealOfferingPortfolioPath,
} from "@/modules/Investing/shell/LpInvestorShellGuard"
import { PortalSwitchLoader } from "@/modules/Investing/components/portal-switch-loader/PortalSwitchLoader"
import { NotificationsProvider } from "@/modules/notifications"
import {
  pageTitleForAppPathname,
  setAppDocumentTitle,
} from "../utils/appDocumentTitle"
import { useAppShellBranding } from "../hooks/useAppShellBranding"
import { useUserActivityTracking } from "../hooks/useUserActivityTracking"
// import { SX_LOGO_SRC } from "@/assets/branding"
import { SX_SIDENAV_LOGO } from "@/assets/branding"
import "./page_layout.css"

type SidebarIcon = ComponentType<{ size?: number; className?: string }>

type NavSubItem = {
  label: string
  to: string
  icon?: SidebarIcon
  badge?: string
}

type NavItemLink = { label: string; to: string; icon: SidebarIcon }

type NavItemGroup = { label: string; icon: SidebarIcon; submenu: NavSubItem[] }

/** Top-level link, or a collapsible group (e.g. Contacts → Overview, All Contacts, Pipeline…). */
type NavItem = NavItemLink | NavItemGroup

/** Deals list, create, or deal detail — not investor-emails / reporting (their own nav items). */
function isSyndicatingDealsNavActive(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/"
  if (p === "/deals") return true
  if (p.startsWith("/deals/investor-emails")) return false
  if (p.startsWith("/deals/reporting")) return false
  if (p === "/deals/create") return true
  if (p.startsWith("/deals/")) return true
  return false
}

function isNavItemGroup(item: NavItem): item is NavItemGroup {
  return "submenu" in item && Array.isArray(item.submenu)
}

function isAccountPath(pathname: string): boolean {
  return (
    pathname === "/account" || pathname.startsWith("/account/")
  )
}

function isInvestingPath(pathname: string): boolean {
  return pathname.startsWith("/investing")
}

/** Investments hub + LP deal workspace / Invest now (`/deals/:dealId`, `/invest`). */
function isInvestingInvestmentsNavActive(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/"
  if (p === "/investing/investments" || p.startsWith("/investing/investments/"))
    return true
  if (isLpDealDetailPath(p)) return true
  if (isLpDealOfferingPortfolioPath(p)) return true
  return false
}

/** Shared markup so Investing vs Syndicating sidebars keep icon/label alignment identical. */
function SidebarNavItem({
  to,
  label,
  icon: Icon,
  isActive,
  end,
}: {
  to: string
  label: string
  icon: SidebarIcon
  isActive?: boolean
  end?: boolean
}) {
  if (end !== undefined) {
    return (
      <NavLink
        to={to}
        end={end}
        className={({ isActive: navActive }) =>
          `app_sidebar_link${navActive ? " app_sidebar_link_active" : ""}`
        }
      >
        <Icon size={18} />
        <span>{label}</span>
      </NavLink>
    )
  }
  const active = isActive === true
  return (
    <Link
      to={to}
      className={`app_sidebar_link${active ? " app_sidebar_link_active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  )
}

/**
 * Collapsible sidebar group (Contacts: Overview, All Contacts, Pipeline, Inbox…).
 */
function SidebarNavGroup({
  label,
  icon: Icon,
  items,
  pathname,
  isPathInGroup,
}: {
  label: string
  icon: SidebarIcon
  items: NavSubItem[]
  pathname: string
  isPathInGroup: (p: string) => boolean
}) {
  const reactId = useId()
  const inSection = isPathInGroup(pathname)
  const [open, setOpen] = useState(inSection)
  useEffect(() => {
    if (inSection) setOpen(true)
  }, [inSection])
  const headId = `${reactId}-nav-group-head`
  const subId = `${reactId}-nav-group-sub`
  return (
    <div className="app_sidebar_group">
      <button
        type="button"
        id={headId}
        className={`app_sidebar_expand_btn${open ? " app_sidebar_expand_btn_open" : ""}${
          inSection ? " app_sidebar_link_active" : ""
        }`}
        aria-expanded={open}
        aria-controls={subId}
        onClick={() => {
          setOpen((o) => !o)
        }}
      >
        <Icon size={18} />
        <span className="app_sidebar_expand_label">{label}</span>
        <ChevronDown
          size={16}
          className={`app_sidebar_expand_chevron${open ? " app_sidebar_expand_chevron_open" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={subId}
          className="app_sidebar_subnav"
          role="group"
          aria-labelledby={headId}
        >
          {items.map((s) => {
            const SubIcon = s.icon
            const badge = s.badge?.trim()
            return (
              <NavLink
                key={s.to}
                to={s.to}
                end
                className={({ isActive }) =>
                  `app_sidebar_link app_sidebar_sublink${
                    badge ? " app_sidebar_sublink_with_badge" : ""
                  }${
                    isActive
                      ? " app_sidebar_link_active app_sidebar_sublink_active"
                      : ""
                  }`
                }
              >
                {SubIcon ? (
                  <SubIcon
                    size={16}
                    className="app_sidebar_sublink_icon"
                    aria-hidden
                  />
                ) : null}
                <span>{s.label}</span>
                {badge ? (
                  <span className="app_sidebar_sublink_badge">{badge}</span>
                ) : null}
              </NavLink>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

const platformAdminNavItems: NavItemLink[] = [
  { label: "Platform Metrics", to: "/metrics", icon: BarChart3 },
]

/** Contacts dropdown — SX-Contacts-UI.html CRM subnav. */
const contactsNavSubmenu: NavSubItem[] = [
  // Previous options:
  // { label: "CRM", to: "/contacts/crm", icon: LayoutGrid },
  // { label: "All contacts", to: "/contacts", icon: Users },

  // From SX-Contacts-UI.html:
  { label: "Overview", to: "/contacts/overview", icon: LayoutDashboard },
  { label: "All Contacts", to: "/contacts", icon: List },
  { label: "Pipeline", to: "/contacts/pipeline", icon: Columns3 },
  { label: "Inbox", to: "/contacts/inbox", icon: Inbox },
  { label: "Campaigns", to: "/contacts/campaigns", icon: Megaphone },
  { label: "Email Templates", to: "/contacts/email-templates", icon: Mails },
  { label: "Meetings", to: "/contacts/meetings", icon: Calendar },
  { label: "Pages & Branding", to: "/contacts/pages", icon: Layers },
  { label: "Import", to: "/contacts/import", icon: Upload },
  { label: "Investor view", to: "/contacts/investor-view", icon: Eye },
]

const sharedSidebarItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  // { label: "Leads", to: "/leads", icon: UserPlus },
  // Previous parent label: "Contacts"
  {
    label: "CRM",
    icon: ContactRound,
    submenu: contactsNavSubmenu,
  },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Customers", to: "/customers", icon: Building2 },
  // { label: "Billing", to: "/billing", icon: CreditCard },
  // { label: "Members", to: "/members", icon: Users },
]

/** Syndicating — unique `to` per item so only one NavLink is active */
const syndicationPortalNavItems: NavItemLink[] = [
  { label: "Deals", to: "/deals", icon: Briefcase },
  // { label: "E-Sign Templates", to: "/templates", icon: FileSignature },
  // { label: "Investor emails", to: "/deals/investor-emails", icon: Mail },
  { label: "Reporting", to: "/deals/reporting", icon: Files },
]

/** Investing mode — flat nav (reference UI) */
const investingNavItems: NavItemLink[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  // { label: "Company overview", to: "/investing/company", icon: Building2 },
  { label: "Investments", to: "/investing/investments", icon: TrendingUp },
  // { label: "Deals", to: "/investing/investments?tab=deals", icon: Briefcase },
  // { label: "Documents", to: "/investing/documents", icon: FileText },
  { label: "Profiles", to: "/investing/profiles", icon: IdCard },
  { label: "Settings", to: "/account", icon: Settings },
  // { label: "Leave a review", to: "/investing/review", icon: Star },
  { label: "FeedBack", to: "/investing/feedback", icon: Star },
]

/** LP Investor deal participants — investing shell only; no company admin / syndication items */
// const lpInvestorInvestingNavItems: NavItem[] = [
//   { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
//   { label: "Deals", to: "/investing/deals", icon: Briefcase },
//   { label: "Portfolio", to: "/investing/investments", icon: TrendingUp },
//   { label: "Cashflows", to: "/investing/cashflows", icon: Banknote },
//   { label: "Contacts", to: "/contacts", icon: ContactRound },
// ]

function PageLayoutInner() {
  const location = useLocation()
  useUserActivityTracking()
  const { mode, setMode, portalSwitchOverlay } = usePortalMode()
  const lpInvestor = isLpInvestorSessionUser()
  const { sidebarLogoSrc: workspaceSidebarLogoSrc } = useAppShellBranding()
  const hasTenantSidebarLogo = Boolean(workspaceSidebarLogoSrc)
  const sidebarHeaderLogoSrc = workspaceSidebarLogoSrc ?? SX_SIDENAV_LOGO

  useEffect(() => {
    if (!portalSwitchOverlay) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [portalSwitchOverlay])

  useEffect(() => {
    setAppDocumentTitle(
      pageTitleForAppPathname(location.pathname, location.search),
    )
  }, [location.pathname, location.search])

  /** After Contacts group: Settings, Customers, Billing, Members — filtered by {@link canAccessSyndicationSidebarPath} */
  const sharedSidebarTail = sharedSidebarItems
    .slice(2)
    .filter((item) => {
      const path = "to" in item && item.to ? item.to : null
      if (!path) return true
      return canAccessSyndicationSidebarPath(path, getStoredUserRole())
    })

  const platformMetricsNav = isPlatformAdmin()
    ? platformAdminNavItems.filter((item) =>
        canAccessSyndicationSidebarPath(item.to, getStoredUserRole()),
      )
    : []

  const sidebarItems: NavItem[] = [
    ...platformMetricsNav,
    sharedSidebarItems[0],
    // [1] is CRM group (Overview, All Contacts, Pipeline, Inbox… — SX-Contacts-UI)
    sharedSidebarItems[1],
    ...syndicationPortalNavItems,
    ...sharedSidebarTail,
  ]

  /**
   * Sidebar nav set:
   * - Investing: Dashboard, Investments, Profiles, Settings, FeedBack
   * - Syndicating: Dashboard, Contacts, Deals, Reporting, Settings, …
   *
   * `/account` must not flip to Investing nav (Lead / Admin / Co-sponsor My account in Syndicating).
   * `/investing/*` aligns portal mode so the footer label matches the nav (avoids misaligned UX).
   */
  useEffect(() => {
    if (lpInvestor) return
    if (isInvestingPath(location.pathname) && mode !== "investing") {
      setMode("investing")
    }
  }, [location.pathname, mode, lpInvestor, setMode])

  const showInvestingSidebar =
    lpInvestor || mode === "investing" || isInvestingPath(location.pathname)
  const modeLabel = showInvestingSidebar ? "Investing" : "Syndicating"
  const investingSidebarItems = lpInvestor
    ? investingNavItems
    : investingNavItems

  return (
    <div className="app_shell">
      {portalSwitchOverlay ? (
        <PortalSwitchLoader caption={portalSwitchOverlay.caption} />
      ) : null}
      <aside className="app_sidebar">
        <div
          className={`app_sidebar_brand app_sidebar_brand_static${
            hasTenantSidebarLogo
              ? " app_sidebar_brand_static--tenant"
              : " app_sidebar_brand_static--default"
          }`}
        >
          <div className="app_sidebar_brand_mark">
            <img
              className={`app_sidebar_brand_logo${
                hasTenantSidebarLogo
                  ? " app_sidebar_brand_logo--tenant"
                  : " app_sidebar_brand_logo--default"
              }`}
              src={sidebarHeaderLogoSrc}
              alt="SyndicationX"
              width={hasTenantSidebarLogo ? 200 : 240}
              height={hasTenantSidebarLogo ? 72 : 96}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              key={sidebarHeaderLogoSrc}
            />
          </div>
          <h1 className="app_sidebar_title app_sidebar_title_sr_only">SyndicationX</h1>
        </div>
        <div className="app_sidebar_nav_region">
          <nav className="app_sidebar_nav" aria-label="Main navigation">
            {showInvestingSidebar
              ? investingSidebarItems.map((item) => {
                  const Icon = item.icon
                  if (item.to === "/investing/investments") {
                    return (
                      <SidebarNavItem
                        key={item.label}
                        to={item.to}
                        label={item.label}
                        icon={Icon}
                        isActive={isInvestingInvestmentsNavActive(
                          location.pathname,
                        )}
                      />
                    )
                  }
                  if (item.to === "/investing/profiles") {
                    return (
                      <SidebarNavItem
                        key={item.label}
                        to={item.to}
                        label={item.label}
                        icon={Icon}
                        isActive={location.pathname.startsWith(
                          "/investing/profiles",
                        )}
                      />
                    )
                  }
                  if (item.label === "Settings") {
                    return (
                      <SidebarNavItem
                        key={item.label}
                        to={item.to}
                        label={item.label}
                        icon={Icon}
                        isActive={isAccountPath(location.pathname)}
                      />
                    )
                  }
                  return (
                    <SidebarNavItem
                      key={item.label}
                      to={item.to}
                      label={item.label}
                      icon={Icon}
                      end={item.to === "/dashboard"}
                    />
                  )
                })
              : sidebarItems.map((item) => {
                  if (isNavItemGroup(item)) {
                    return (
                      <SidebarNavGroup
                        key={item.label}
                        label={item.label}
                        icon={item.icon}
                        items={item.submenu}
                        pathname={location.pathname}
                        isPathInGroup={(p) =>
                          p === "/contacts" || p.startsWith("/contacts/")
                        }
                      />
                    )
                  }

                  const { label, to, icon: Icon } = item

                  if (to === "/deals") {
                    return (
                      <SidebarNavItem
                        key={label}
                        to={to}
                        label={label}
                        icon={Icon}
                        isActive={isSyndicatingDealsNavActive(location.pathname)}
                      />
                    )
                  }

                  if (label === "Settings") {
                    const settingsTo = resolveSyndicationSettingsNavPath()
                    const settingsActive =
                      location.pathname === "/settings" ||
                      location.pathname.startsWith("/settings/") ||
                      isAccountPath(location.pathname)
                    return (
                      <SidebarNavItem
                        key={label}
                        to={settingsTo}
                        label={label}
                        icon={Icon}
                        isActive={settingsActive}
                      />
                    )
                  }

                  const linkEnd = to === "/dashboard" || to === "/metrics"
                  return (
                    <SidebarNavItem
                      key={label}
                      to={to}
                      label={label}
                      icon={Icon}
                      end={linkEnd}
                    />
                  )
                })}
          </nav>
        </div>
        <footer
          className="app_sidebar_mode_footer"
          role="status"
          aria-live="polite"
          aria-label="Workspace mode and platform attribution"
        >
          <p className="app_sidebar_mode_workspace">{modeLabel}</p>
          <div
            className="app_sidebar_powered_lockup"
            aria-label="Powered by SyndicationX"
          >
            {/* <img
              className="app_sidebar_powered_logo"
              src={SX_SIDENAV_LOGO}
              alt=""
              width={200}
              height={40}
              loading="lazy"
              decoding="async"
            /> */}
            <span className="app_sidebar_powered_accent" aria-hidden />
            <div className="app_sidebar_powered_text">
              <span className="app_sidebar_powered_by">Powered by</span>
              <span className="app_sidebar_powered_brand">SyndicationX</span>
            </div>
          </div>
        </footer>
      </aside>

      <section className="app_main_section">
        <TopNavBar />
        <main className="app_main_content">
          <Outlet />
        </main>
      </section>
    </div>
  )
}

export function PageLayout() {
  return (
    <PortalModeProvider>
      <NotificationsProvider>
        <PageLayoutInner />
      </NotificationsProvider>
    </PortalModeProvider>
  )
}
