import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { pageTitleForAppPathname } from "../utils/appDocumentTitle"
import {
  ensureActivitySession,
  getStoredActivitySessionId,
  recordActivityPageView,
} from "../auth/userActivityApi"

const SKIP_PATH_PREFIXES = ["/signin", "/signup", "/forgot-password", "/reset-password"]

function shouldTrackPath(pathname: string): boolean {
  return !SKIP_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

/**
 * Records page navigations for the signed-in user's current portal session.
 * Mount once inside the authenticated app shell (PageLayout).
 */
export function useUserActivityTracking(): void {
  const location = useLocation()
  const lastPathRef = useRef<string | null>(null)
  const sessionReadyRef = useRef(false)

  useEffect(() => {
    if (!getStoredActivitySessionId()) {
      void ensureActivitySession().then((id) => {
        sessionReadyRef.current = Boolean(id)
      })
    } else {
      sessionReadyRef.current = true
    }
  }, [])

  useEffect(() => {
    const path = location.pathname
    if (!shouldTrackPath(path)) return
    if (lastPathRef.current === path) return
    lastPathRef.current = path

    const label = pageTitleForAppPathname(path, location.search)
    const timer = window.setTimeout(() => {
      void recordActivityPageView(path, label)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search])
}
