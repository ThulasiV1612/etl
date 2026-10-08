import { SESSION_USER_DETAILS_KEY } from "./sessionKeys"

export type SessionCompanyOption = {
  companyId: string
  companyName: string
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readSessionUserRoot(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      Array.isArray(parsed) &&
      parsed[0] &&
      typeof parsed[0] === "object" &&
      !Array.isArray(parsed[0])
    ) {
      return parsed[0] as Record<string, unknown>
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

function primaryOrganizationIdFromUser(
  o: Record<string, unknown> | null,
): string | null {
  if (!o) return null
  const id = o.organization_id ?? o.organizationId ?? o.organizationID
  if (id == null || id === "") return null
  const s = typeof id === "string" ? id.trim() : String(id).trim()
  return ORG_UUID_RE.test(s) ? s.toLowerCase() : null
}

function companyNameFromUser(o: Record<string, unknown> | null): string {
  if (!o) return ""
  return String(
    o.companyName ??
      o.company_name ??
      o.organizationName ??
      o.organization_name ??
      "",
  ).trim()
}

/** Primary org display name from sign-in `userDetails` (not workspace-selected). */
export function getSessionPrimaryCompanyName(): string {
  return companyNameFromUser(readSessionUserRoot())
}

/** Distinct companies the signed-in user may work in (primary org + junction memberships). */
export function getSessionAccessibleCompanies(): SessionCompanyOption[] {
  const root = readSessionUserRoot()
  const out: SessionCompanyOption[] = []
  const seen = new Set<string>()
  const namesById = new Map<string, string>()

  const add = (companyId: string, companyName: string) => {
    const id = companyId.trim().toLowerCase()
    if (!ORG_UUID_RE.test(id) || seen.has(id)) return
    seen.add(id)
    out.push({
      companyId: id,
      companyName: companyName.trim() || "Company",
    })
  }

  const raw = root?.memberships
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        continue
      }
      const rec = item as Record<string, unknown>
      const companyId = String(
        rec.companyId ?? rec.company_id ?? "",
      ).trim()
      const companyName = String(
        rec.companyName ??
          rec.company_name ??
          rec.company ??
          rec.organization_name ??
          "",
      ).trim()
      if (companyId && ORG_UUID_RE.test(companyId)) {
        namesById.set(companyId.trim().toLowerCase(), companyName)
        add(companyId, companyName)
      }
    }
  }

  const primaryId = primaryOrganizationIdFromUser(root)
  const primaryName =
    (primaryId ? namesById.get(primaryId) : "") || companyNameFromUser(root)
  if (primaryId) add(primaryId, primaryName)

  return out
}

export function userHasMultipleAccessibleCompanies(): boolean {
  return getSessionAccessibleCompanies().length > 1
}

export function isAccessibleCompanyId(companyId: string): boolean {
  const id = companyId.trim().toLowerCase()
  return getSessionAccessibleCompanies().some((c) => c.companyId === id)
}
