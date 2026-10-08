import {
  COMPANY_ADMIN,
  PLATFORM_ADMIN,
} from "../auth/roleUtils"

/**
 * Syndication sidebar (`PageLayout` → syndicating mode): which roles may see each link.
 *
 * - Keys match NavLink `to` values (exact path).
 * - Paths **not listed here** are visible to every authenticated syndication user.
 * - To restrict a new item: add `{ "/path": [ROLE_A, ROLE_B] }`.
 *
 * Keep in sync with route guards (e.g. `MembersLayout` for `/members`) when adding rules.
 */
export const SYNDICATION_SIDEBAR_PATH_ROLES: Partial<
  Record<string, readonly string[]>
> = {
  /** Platform admin only — application-wide KPIs */
  "/metrics": [PLATFORM_ADMIN],

  /** Platform admin only — customer companies directory */
  "/customers": [PLATFORM_ADMIN],

  /** User management — platform + company admins */
  "/members": [PLATFORM_ADMIN, COMPANY_ADMIN],
}

/**
 * Whether the current user may see a syndication sidebar item for `path`.
 */
export function canAccessSyndicationSidebarPath(
  path: string,
  userRole: string | null,
): boolean {
  const allowed = SYNDICATION_SIDEBAR_PATH_ROLES[path]
  if (!allowed || allowed.length === 0) return true
  if (userRole == null || userRole === "") return false
  return allowed.includes(userRole)
}
