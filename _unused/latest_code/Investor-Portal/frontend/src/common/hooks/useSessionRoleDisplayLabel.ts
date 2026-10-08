import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { dealMemberRoleDisplayForShell } from "../../modules/Syndication/usermanagement/memberAdminShared"
import { readSessionUser } from "../../modules/myaccount/sessionUser"

function computeLabel(): string {
  const u = readSessionUser()
  if (!u) return ""
  return dealMemberRoleDisplayForShell(u)
}

/**
 * Deal-level role label from session (`deal_member.deal_member_role`), for shell badges only.
 * Empty when not a deal-roster user or no role stored.
 */
export function useSessionRoleDisplayLabel(): string {
  const location = useLocation()
  const [label, setLabel] = useState(computeLabel)

  useEffect(() => {
    setLabel(computeLabel())
  }, [location.pathname])

  useEffect(() => {
    function onUpdate() {
      setLabel(computeLabel())
    }
    window.addEventListener("portal-session-user-updated", onUpdate)
    return () => window.removeEventListener("portal-session-user-updated", onUpdate)
  }, [])

  return label
}
