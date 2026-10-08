import HelloSign from "hellosign-embedded"
import { useCallback, useEffect, useRef } from "react"
import type { DropboxSignCreateTemplateEvent } from "./dropboxSignEmbedded.types"
import "./dropbox-sign-embedded.css"

export type DropboxSignEmbeddedEditorProps = {
  /** `edit_url` from POST .../embedded-draft (server calls create_embedded_draft). */
  editUrl: string
  clientId: string
  testMode: boolean
  /** Called when the user saves the template in the embedded iframe (`createTemplate` event). */
  onTemplateSaved: (data: DropboxSignCreateTemplateEvent) => void
  onCancel?: () => void
  onError?: (message: string) => void
  /** Fired once the hellosign-embedded modal is opened. */
  onOpened?: () => void
}

/**
 * Embedded editor flow — opens Dropbox Sign template builder in a modal iframe.
 *
 * Uses the official `hellosign-embedded` client. The backend supplies `edit_url`;
 * this component listens for `createTemplate` and notifies the parent to
 * persist `template_id` via the complete-embedded-template API.
 */
export function DropboxSignEmbeddedEditor({
  editUrl,
  clientId,
  testMode,
  onTemplateSaved,
  onCancel,
  onError,
  onOpened,
}: DropboxSignEmbeddedEditorProps) {
  const clientRef = useRef<InstanceType<typeof HelloSign> | null>(null)
  const savedRef = useRef(false)

  const handleSaved = useCallback(
    (data: DropboxSignCreateTemplateEvent) => {
      if (savedRef.current) return
      if (!data.templateId) {
        onError?.("Dropbox Sign did not return a template id")
        return
      }
      savedRef.current = true
      onTemplateSaved(data)
    },
    [onError, onTemplateSaved],
  )

  useEffect(() => {
    savedRef.current = false
    if (!editUrl?.trim() || !clientId?.trim()) return

    const client = new HelloSign({ clientId })
    clientRef.current = client

    client.on("createTemplate", (payload) => {
      handleSaved(payload as DropboxSignCreateTemplateEvent)
    })

    client.on("finish", (payload) => {
      const p = payload as DropboxSignCreateTemplateEvent | undefined
      if (p?.templateId) handleSaved(p)
    })

    client.on("cancel", () => {
      onCancel?.()
    })

    client.on("error", (err) => {
      const e = err as { code?: string; message?: string }
      const detail = e?.code ?? e?.message
      onError?.(
        detail ? `Dropbox Sign error: ${detail}` : "Dropbox Sign editor error",
      )
    })

    const openTimer = window.setTimeout(() => {
      try {
        client.open(editUrl, {
          clientId,
          skipDomainVerification: testMode,
          allowCancel: true,
        })
        onOpened?.()
      } catch (err) {
        onError?.(
          err instanceof Error ? err.message : "Could not open Dropbox Sign editor",
        )
      }
    }, 0)

    return () => {
      window.clearTimeout(openTimer)
      try {
        client.close()
      } catch {
        /* ignore */
      }
      clientRef.current = null
    }
  }, [clientId, editUrl, handleSaved, onCancel, onError, onOpened, testMode])

  return (
    <div
      className="dropbox_sign_embedded_host"
      role="region"
      aria-label="Dropbox Sign template editor"
    />
  )
}
