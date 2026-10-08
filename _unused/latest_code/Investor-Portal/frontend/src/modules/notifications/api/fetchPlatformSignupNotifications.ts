import { SESSION_BEARER_KEY } from "@/common/auth/sessionKeys"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"
import type { PortalNotification } from "../types/notification.types"

interface PlatformSignupNotificationApiRow {
  id: string
  userId: string
  contactId: string | null
  signupKind: string
  companyName: string | null
  organizationId: string | null
  userEmail: string
  userDisplayName: string
  userRole: string
  createdAt: string
}

function mapSignupRowToNotification(
  row: PlatformSignupNotificationApiRow,
): Omit<PortalNotification, "read"> {
  const name = row.userDisplayName?.trim() || row.userEmail?.trim() || "User"
  const email = row.userEmail?.trim() || ""
  const kind = row.signupKind?.trim().toLowerCase()

  if (kind === "investor") {
    return {
      id: `platform-signup:${row.id}`,
      title: "New self-registered investor",
      message: email
        ? `${name} (${email}) signed up without a company.`
        : `${name} signed up without a company.`,
      category: "system",
      createdAt: row.createdAt,
      href: "/contacts",
    }
  }

  const company = row.companyName?.trim() || "a company"
  const orgId = row.organizationId?.trim()
  return {
    id: `platform-signup:${row.id}`,
    title: "New company signup",
    message: email
      ? `${name} (${email}) registered and created ${company}.`
      : `${name} registered and created ${company}.`,
    category: "system",
    createdAt: row.createdAt,
    href: orgId
      ? `/customers/${encodeURIComponent(orgId)}`
      : "/customers",
  }
}

export async function fetchPlatformSignupNotifications(): Promise<
  Omit<PortalNotification, "read">[]
> {
  const base = getApiV1Base()
  if (!base) return []

  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  if (!token) return []

  try {
    const res = await fetch(`${base}/platform/signup-notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
    if (!res.ok) return []

    const data = (await res.json().catch(() => ({}))) as {
      notifications?: PlatformSignupNotificationApiRow[]
    }
    const rows = Array.isArray(data.notifications) ? data.notifications : []
    return rows.map(mapSignupRowToNotification)
  } catch {
    return []
  }
}
