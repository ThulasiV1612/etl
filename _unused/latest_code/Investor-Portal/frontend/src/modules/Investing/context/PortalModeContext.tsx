import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { isLpInvestorSessionUser } from "@/common/auth/roleUtils"
import { SESSION_PORTAL_MODE_KEY } from "@/common/auth/sessionKeys"

export type PortalMode = "investing" | "syndicating"

export type PortalSwitchOverlay = { caption: string }

type PortalModeContextValue = {
  mode: PortalMode
  setMode: (mode: PortalMode) => void
  switchToInvesting: () => void
  switchToSyndicating: () => void
  portalSwitchOverlay: PortalSwitchOverlay | null
  setPortalSwitchOverlay: (overlay: PortalSwitchOverlay | null) => void
}

const PortalModeContext = createContext<PortalModeContextValue | null>(null)

function readStoredPortalMode(): PortalMode {
  try {
    const v = sessionStorage.getItem(SESSION_PORTAL_MODE_KEY)
    if (v === "investing" || v === "syndicating") return v
  } catch {
    /* sessionStorage unavailable */
  }
  return "syndicating"
}

function writeStoredPortalMode(next: PortalMode): void {
  try {
    sessionStorage.setItem(SESSION_PORTAL_MODE_KEY, next)
  } catch {
    /* ignore */
  }
}

export function PortalModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PortalMode>(() => {
    if (typeof window !== "undefined" && isLpInvestorSessionUser()) {
      return "investing"
    }
    return readStoredPortalMode()
  })
  const [portalSwitchOverlay, setPortalSwitchOverlay] =
    useState<PortalSwitchOverlay | null>(null)

  const setMode = useCallback((next: PortalMode) => {
    if (isLpInvestorSessionUser() && next === "syndicating") return
    setModeState(next)
    writeStoredPortalMode(next)
  }, [])

  const switchToInvesting = useCallback(() => setMode("investing"), [setMode])
  const switchToSyndicating = useCallback(() => setMode("syndicating"), [setMode])

  useEffect(() => {
    if (!isLpInvestorSessionUser()) return
    setModeState("investing")
    writeStoredPortalMode("investing")
  }, [])

  const value = useMemo(
    () => ({
      mode,
      setMode,
      switchToInvesting,
      switchToSyndicating,
      portalSwitchOverlay,
      setPortalSwitchOverlay,
    }),
    [
      mode,
      portalSwitchOverlay,
      setMode,
      switchToInvesting,
      switchToSyndicating,
    ],
  )
  return (
    <PortalModeContext.Provider value={value}>
      {children}
    </PortalModeContext.Provider>
  )
}

export function usePortalMode(): PortalModeContextValue {
  const ctx = useContext(PortalModeContext)
  if (!ctx) {
    return {
      mode: "syndicating",
      setMode: () => {},
      switchToInvesting: () => {},
      switchToSyndicating: () => {},
      portalSwitchOverlay: null,
      setPortalSwitchOverlay: () => {},
    }
  }
  return ctx
}
