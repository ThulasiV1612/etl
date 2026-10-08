import { Moon, Sun } from "lucide-react"
import { usePortalTheme } from "./ThemeProvider"
import "./theme-toggle.css"

export function ThemeToggleButton() {
  const { theme, toggleTheme } = usePortalTheme()
  const isDark = theme === "dark"

  return (
    <button
      type="button"
      className="portal_theme_toggle"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun size={20} strokeWidth={2} aria-hidden />
      ) : (
        <Moon size={20} strokeWidth={2} aria-hidden />
      )}
    </button>
  )
}
