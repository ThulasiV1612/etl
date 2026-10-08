import {
  type LucideIcon,
  ArrowLeftRight,
  Check,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sun,
  UserPlus,
  UserRound,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { isLpInvestorSessionUser } from "../../auth/roleUtils"
import { performPortalLogout } from "../../auth/portalLogout"
import { getSessionUserDisplayName } from "../../auth/sessionUserDisplayName"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { NotificationsNavButton } from "@/modules/notifications"
import { usePortalTheme } from "@/common/theme/ThemeProvider"
import type { PortalThemePreference } from "@/common/theme/portalTheme"
import { CompanySwitcher } from "../CompanySwitcher/CompanySwitcher"
import { HeaderDealsSearch } from "./HeaderDealsSearch"
import "./header-deals-search.css"
import "./top_navbar.css"

interface TopNavBarProps {
  userName?: string
  userEmail?: string
}

function initialsFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface ProfileMenuRowProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  variant?: "default" | "logout"
}

function ProfileMenuRow({
  icon: Icon,
  label,
  onClick,
  variant = "default",
}: ProfileMenuRowProps) {
  return (
    <li role="none">
      <button
        type="button"
        className={`top_navbar_dd_item${variant === "logout" ? " top_navbar_dd_item_logout" : ""}`}
        role="menuitem"
        onClick={onClick}
      >
        <Icon
          className="top_navbar_dd_item_icon"
          size={18}
          strokeWidth={2}
          aria-hidden
        />
        <span>{label}</span>
      </button>
    </li>
  )
}

const THEME_OPTIONS: ReadonlyArray<{
  preference: PortalThemePreference
  icon: LucideIcon
  label: string
}> = [
  { preference: "light", icon: Sun, label: "Light" },
  { preference: "dark", icon: Moon, label: "Dark" },
  { preference: "system", icon: Monitor, label: "System" },
]

interface ProfileThemePickerProps {
  open: boolean
  onToggle: () => void
}

function ProfileThemePicker({ open, onToggle }: ProfileThemePickerProps) {
  const { themePreference, setThemePreference } = usePortalTheme()

  return (
    <li role="none" className="top_navbar_dd_theme_block">
      <button
        type="button"
        className={`top_navbar_dd_item top_navbar_dd_theme_trigger${
          open ? " top_navbar_dd_theme_trigger--open" : ""
        }`}
        role="menuitem"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={onToggle}
      >
        <Palette
          className="top_navbar_dd_item_icon"
          size={18}
          strokeWidth={2}
          aria-hidden
        />
        <span>Choose Theme</span>
      </button>
      {open ? (
        <div
          className="top_navbar_dd_theme_panel"
          role="group"
          aria-label="Theme options"
        >
          <ul className="top_navbar_dd_theme_list">
            {THEME_OPTIONS.map(({ preference, icon: Icon, label }) => {
              const selected = themePreference === preference
              return (
                <li key={preference} role="none">
                  <button
                    type="button"
                    className={`top_navbar_dd_theme_option${selected ? " top_navbar_dd_theme_option_active" : ""}`}
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => setThemePreference(preference)}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden />
                    <span>{label}</span>
                    {selected ? (
                      <Check
                        className="top_navbar_dd_theme_check"
                        size={16}
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

export function TopNavBar({ userName: userNameProp }: TopNavBarProps) {
  const location = useLocation()
  const [sessionUserName, setSessionUserName] = useState(() =>
    getSessionUserDisplayName(),
  )
  const userName = userNameProp ?? (sessionUserName || "User")

  useEffect(() => {
    setSessionUserName(getSessionUserDisplayName())
  }, [location.pathname])

  useEffect(() => {
    function onSessionUserUpdated() {
      setSessionUserName(getSessionUserDisplayName())
    }
    window.addEventListener("portal-session-user-updated", onSessionUserUpdated)
    return () =>
      window.removeEventListener(
        "portal-session-user-updated",
        onSessionUserUpdated,
      )
  }, [])

  const initials = initialsFromFullName(userName)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const { mode, switchToInvesting, switchToSyndicating } = usePortalMode()
  const hideModeSwitch = isLpInvestorSessionUser()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pendingModeSwitchRef = useRef<"investing" | "syndicating" | null>(null)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setThemePickerOpen(false)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) closeMenu()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu()
    }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen, closeMenu])

  const applyPendingModeSwitch = useCallback(() => {
    const target = pendingModeSwitchRef.current
    if (!target) return
    pendingModeSwitchRef.current = null
    if (target === "investing") switchToInvesting()
    else switchToSyndicating()
  }, [switchToInvesting, switchToSyndicating])

  useEffect(() => {
    if (location.pathname !== "/dashboard") return
    applyPendingModeSwitch()
  }, [location.pathname, applyPendingModeSwitch])

  function handleMyAccount() {
    closeMenu()
    navigate("/account")
  }

  function handleRefer() {
    closeMenu()
    navigate("/refer-a-friend")
  }

  async function handleLogout() {
    closeMenu()
    await performPortalLogout()
    navigate("/signin")
  }

  function handleSwitchToInvesting() {
    closeMenu()
    if (location.pathname === "/dashboard") {
      switchToInvesting()
      return
    }
    pendingModeSwitchRef.current = "investing"
    navigate("/dashboard", { replace: true })
  }

  function handleSwitchToSyndicating() {
    closeMenu()
    if (location.pathname === "/dashboard") {
      switchToSyndicating()
      return
    }
    pendingModeSwitchRef.current = "syndicating"
    navigate("/dashboard", { replace: true })
  }

  return (
    <header className="top_navbar">
      <div className="top_navbar_start">
        {/* <h2 className="top_navbar_page_title">{pageTitle}</h2> */}
      </div>
      <div className="top_navbar_center">
        <HeaderDealsSearch />
      </div>
      <div className="top_navbar_end">
        <div className="top_navbar_tools">
          <CompanySwitcher />
          <NotificationsNavButton />
          <span className="top_navbar_divider" aria-hidden />
          <div className="top_navbar_user_wrap" ref={wrapRef}>
            <button
              type="button"
              className="top_navbar_profile_chip"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="top_navbar_avatar" aria-hidden>
                {initials}
              </span>
              <span className="top_navbar_user_name">{userName}</span>
            </button>
        {menuOpen ? (
          <div className="top_navbar_dd" role="menu">
            {/* <div className="top_navbar_dd_header">
              <p className="top_navbar_dd_name">{userName}</p>
              <p className="top_navbar_dd_email">{userEmail}</p>
            </div> */}
            <ul className="top_navbar_dd_list">
              {/* <ProfileMenuRow
                icon={UserRound}
                label="My account"
                onClick={handleMyAccount}
              /> */}
              {!hideModeSwitch ? (
                mode === "syndicating" ? (
                  <ProfileMenuRow
                    icon={ArrowLeftRight}
                    label="Switch to investing"
                    onClick={handleSwitchToInvesting}
                  />
                ) : (
                  <ProfileMenuRow
                    icon={ArrowLeftRight}
                    label="Switch to Syndicating"
                    onClick={handleSwitchToSyndicating}
                  />
                )
              ) : null}
              <ProfileMenuRow
                icon={UserPlus}
                label="Refer a friend"
                onClick={handleRefer}
              />
              <ProfileThemePicker
                open={themePickerOpen}
                onToggle={() => setThemePickerOpen((v) => !v)}
              />
              {/* <ProfileMenuRow
                icon={FileText}
                label="Terms & policies"
                onClick={handleTerms}
              /> */}
              {/* <ProfileMenuRow
                icon={Headphones}
                label="Help"
                onClick={handleHelp}
              /> */}
              <ProfileMenuRow
                icon={UserRound}
                label="My account"
                onClick={handleMyAccount}
              />
              <ProfileMenuRow
                icon={LogOut}
                label="Log out"
                onClick={handleLogout}
                variant="logout"
              />
            </ul>
          </div>
        ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
