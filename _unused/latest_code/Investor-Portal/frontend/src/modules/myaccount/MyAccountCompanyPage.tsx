import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { Building2, CircleUser, Shield } from "lucide-react"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { fetchMyProfile } from "./accountApi"
import {
  orgRoleLabelForMyAccount,
  viewerShowsOrgRoleInMyAccount,
} from "./myAccountOrgRole"
import { profileRoleLabelForMyAccount } from "./myAccountProfileRole"
import { getActiveWorkspaceCompanyName } from "../../common/auth/sessionOrganization"
import { PORTAL_ACTIVE_COMPANY_CHANGED_EVENT } from "../../common/auth/setActiveCompany"
import { mergeSessionUserDetails, readSessionUser } from "./sessionUser"

export function MyAccountCompanyPage() {
  const location = useLocation()
  const { mode: portalMode } = usePortalMode()
  const [companyName, setCompanyName] = useState("")
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(
    () => readSessionUser(),
  )
  const portalRoleLabel = profileRoleLabelForMyAccount(portalMode)
  const showOrgRole = viewerShowsOrgRoleInMyAccount(sessionUser)
  const orgRoleLabel = orgRoleLabelForMyAccount(sessionUser)

  const loadFromSession = useCallback(() => {
    const u = readSessionUser()
    setSessionUser(u)
    setCompanyName(getActiveWorkspaceCompanyName())
  }, [])

  useEffect(() => {
    loadFromSession()
    void fetchMyProfile().then((user) => {
      if (user) mergeSessionUserDetails(user)
      loadFromSession()
    })
  }, [location.pathname, loadFromSession])

  useEffect(() => {
    function onSessionUserUpdated() {
      loadFromSession()
    }
    function onActiveCompanyChanged() {
      loadFromSession()
    }
    window.addEventListener("portal-session-user-updated", onSessionUserUpdated)
    window.addEventListener(PORTAL_ACTIVE_COMPANY_CHANGED_EVENT, onActiveCompanyChanged)
    return () => {
      window.removeEventListener(
        "portal-session-user-updated",
        onSessionUserUpdated,
      )
      window.removeEventListener(
        PORTAL_ACTIVE_COMPANY_CHANGED_EVENT,
        onActiveCompanyChanged,
      )
    }
  }, [loadFromSession])

  return (
    <div className="myaccount_form_body">
      <div className="um_field">
        <label htmlFor="myaccount-companyName" className="um_field_label_row">
          <Building2 className="um_field_label_icon" size={17} aria-hidden />
          <span>Company name</span>
        </label>
        <input
          id="myaccount-companyName"
          name="companyName"
          type="text"
          value={companyName}
          onChange={() => {}}
          readOnly
        />
      </div>
      {showOrgRole ? (
        <div className="um_field">
          <label
            htmlFor="myaccount-company-org-role"
            className="um_field_label_row"
          >
            <Shield className="um_field_label_icon" size={17} aria-hidden />
            <span>Org Role</span>
          </label>
          <input
            id="myaccount-company-org-role"
            name="orgRole"
            type="text"
            value={orgRoleLabel}
            onChange={() => {}}
            readOnly
            autoComplete="off"
          />
        </div>
      ) : null}
      <div className="um_field">
        <label htmlFor="myaccount-portal-role" className="um_field_label_row">
          <CircleUser className="um_field_label_icon" size={17} aria-hidden />
          <span>Profile Role</span>
        </label>
        <input
          id="myaccount-portal-role"
          name="portalRole"
          type="text"
          value={portalRoleLabel}
          onChange={() => {}}
          readOnly
          autoComplete="off"
        />
      </div>
    </div>
  )
}
