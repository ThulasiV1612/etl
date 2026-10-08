import { useEffect, useRef } from "react"
import {
  putWorkspaceTabSettings,
  type WorkspaceTabKey,
} from "./companyWorkspaceSettingsApi"

/**
 * After `hydrated` is true, persists `payload` when it changes (debounced).
 * Skips the first snapshot so loading from the server does not trigger a PUT.
 */
export function useDebouncedWorkspaceTabPersist(
  workspaceCompanyId: string | undefined,
  tabKey: WorkspaceTabKey,
  readOnly: boolean,
  hydrated: boolean,
  payload: Record<string, unknown>,
): void {
  const prevSerialized = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    prevSerialized.current = null
  }, [workspaceCompanyId, tabKey])

  const serialized = JSON.stringify(payload)

  useEffect(() => {
    if (!hydrated || !workspaceCompanyId || readOnly) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }
    if (prevSerialized.current === null) {
      prevSerialized.current = serialized
      return
    }
    if (prevSerialized.current === serialized) return
    prevSerialized.current = serialized
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const body = JSON.parse(serialized) as Record<string, unknown>
      void putWorkspaceTabSettings(workspaceCompanyId, tabKey, body).then(
        (r) => {
          if (!r.ok && import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn("debounced workspace put failed", tabKey, r.message)
          }
        },
      )
    }, 650)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [serialized, hydrated, workspaceCompanyId, readOnly, tabKey])
}
