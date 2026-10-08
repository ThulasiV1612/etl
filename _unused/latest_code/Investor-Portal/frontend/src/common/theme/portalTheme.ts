export type PortalTheme = "light" | "dark"

export type PortalThemePreference = PortalTheme | "system"

export const PORTAL_THEME_STORAGE_KEY = "portal-theme"

export function getStoredPortalThemePreference(): PortalThemePreference {
  try {
    const raw = localStorage.getItem(PORTAL_THEME_STORAGE_KEY)
    if (raw === "light" || raw === "dark" || raw === "system") return raw
  } catch {
    /* private mode */
  }
  return "system"
}

/** @deprecated Use {@link getStoredPortalThemePreference}. */
export function getStoredPortalTheme(): PortalTheme | null {
  const pref = getStoredPortalThemePreference()
  if (pref === "system") return null
  return pref
}

export function resolveSystemPortalTheme(): PortalTheme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark"
  }
  return "light"
}

export function resolvePortalThemeFromPreference(
  preference: PortalThemePreference,
): PortalTheme {
  if (preference === "system") return resolveSystemPortalTheme()
  return preference
}

/** Apply resolved light/dark on `document.documentElement` only. */
export function applyResolvedPortalTheme(theme: PortalTheme): void {
  const root = document.documentElement
  root.setAttribute("data-theme", theme)
  root.classList.remove("light", "dark")
  root.classList.add(theme)
}

export function persistPortalThemePreference(
  preference: PortalThemePreference,
): void {
  try {
    localStorage.setItem(PORTAL_THEME_STORAGE_KEY, preference)
  } catch {
    /* private mode */
  }
}

export function applyPortalThemePreference(
  preference: PortalThemePreference,
): PortalTheme {
  const resolved = resolvePortalThemeFromPreference(preference)
  applyResolvedPortalTheme(resolved)
  persistPortalThemePreference(preference)
  return resolved
}

/** @deprecated Use {@link applyPortalThemePreference} with light/dark. */
export function applyPortalTheme(theme: PortalTheme): void {
  applyPortalThemePreference(theme)
}

/** @deprecated Use {@link resolvePortalThemeFromPreference}. */
export function resolvePortalTheme(): PortalTheme {
  return resolvePortalThemeFromPreference(getStoredPortalThemePreference())
}

export function initPortalThemeOnDocument(): PortalThemePreference {
  const preference = getStoredPortalThemePreference()
  applyPortalThemePreference(preference)
  return preference
}
