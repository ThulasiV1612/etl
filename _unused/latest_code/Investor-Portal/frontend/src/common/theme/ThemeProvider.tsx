import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  applyPortalThemePreference,
  applyResolvedPortalTheme,
  getStoredPortalThemePreference,
  initPortalThemeOnDocument,
  resolvePortalThemeFromPreference,
  type PortalTheme,
  type PortalThemePreference,
} from "./portalTheme"

interface ThemeContextValue {
  /** Resolved light/dark applied to the document. */
  theme: PortalTheme
  themePreference: PortalThemePreference
  setThemePreference: (preference: PortalThemePreference) => void
  setTheme: (theme: PortalTheme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] =
    useState<PortalThemePreference>(() => getStoredPortalThemePreference())
  const [theme, setThemeState] = useState<PortalTheme>(() =>
    resolvePortalThemeFromPreference(getStoredPortalThemePreference()),
  )

  useEffect(() => {
    initPortalThemeOnDocument()
  }, [])

  const setThemePreference = useCallback((preference: PortalThemePreference) => {
    const resolved = applyPortalThemePreference(preference)
    setThemePreferenceState(preference)
    setThemeState(resolved)
  }, [])

  const setTheme = useCallback(
    (next: PortalTheme) => {
      setThemePreference(next)
    },
    [setThemePreference],
  )

  const toggleTheme = useCallback(() => {
    setThemePreferenceState((prev) => {
      const current = resolvePortalThemeFromPreference(prev)
      const next: PortalTheme = current === "light" ? "dark" : "light"
      const resolved = applyPortalThemePreference(next)
      setThemeState(resolved)
      return next
    })
  }, [])

  useEffect(() => {
    if (themePreference !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function onChange() {
      const resolved = resolvePortalThemeFromPreference("system")
      applyResolvedPortalTheme(resolved)
      setThemeState(resolved)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [themePreference])

  const value = useMemo(
    () => ({
      theme,
      themePreference,
      setThemePreference,
      setTheme,
      toggleTheme,
    }),
    [theme, themePreference, setThemePreference, setTheme, toggleTheme],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function usePortalTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("usePortalTheme must be used within ThemeProvider")
  }
  return ctx
}
