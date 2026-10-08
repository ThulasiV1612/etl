import { Building2, ChevronDown } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  getSessionAccessibleCompanies,
  userHasMultipleAccessibleCompanies,
} from "../../auth/sessionMemberships"
import { getSessionOrganizationCompanyId } from "../../auth/sessionOrganization"
import {
  PORTAL_ACTIVE_COMPANY_CHANGED_EVENT,
  setActiveCompanyId,
} from "../../auth/setActiveCompany"
import "./company_switcher.css"

export function CompanySwitcher() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState(() =>
    getSessionOrganizationCompanyId(),
  )
  const wrapRef = useRef<HTMLDivElement>(null)

  const companies = getSessionAccessibleCompanies()
  const show = userHasMultipleAccessibleCompanies()

  const refreshActive = useCallback(() => {
    setActiveId(getSessionOrganizationCompanyId())
  }, [])

  useEffect(() => {
    refreshActive()
  }, [location.pathname, refreshActive])

  useEffect(() => {
    function onChanged() {
      refreshActive()
    }
    window.addEventListener(PORTAL_ACTIVE_COMPANY_CHANGED_EVENT, onChanged)
    return () =>
      window.removeEventListener(PORTAL_ACTIVE_COMPANY_CHANGED_EVENT, onChanged)
  }, [refreshActive])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!show) return null

  const active =
    companies.find((c) => c.companyId === activeId) ?? companies[0]

  function handleSelect(companyId: string, companyName: string) {
    setOpen(false)
    if (companyId === activeId) return
    setActiveCompanyId(companyId, companyName)
    window.location.reload()
  }

  return (
    <div
      className="company_switcher_wrap"
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="company_switcher_btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <Building2 size={20} strokeWidth={2} aria-hidden />
        <span className="company_switcher_label">
          {active?.companyName ?? "Company"}
        </span>
        <ChevronDown size={20} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <ul className="company_switcher_menu" role="listbox">
          {companies.map((c) => (
            <li key={c.companyId} role="option" aria-selected={c.companyId === activeId}>
              <button
                type="button"
                className={
                  c.companyId === activeId
                    ? "company_switcher_item company_switcher_item_active"
                    : "company_switcher_item"
                }
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelect(c.companyId, c.companyName)
                }}
              >
                {c.companyName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
