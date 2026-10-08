import { useLayoutEffect, useMemo, useRef } from "react"

import { buildSignFlowEmbedSignUrlClient } from "@/modules/Syndication/Deals/utils/esignSignflowEditorUrl"
import "../dropbox-sign-embedded/dropbox-sign-embedded.css"



export type SignFlowEmbeddedSignerProps = {

  signUrl: string

  documentId: string

  embedApiKey?: string | null

  appBaseUrl?: string | null

  useInlineContainer?: boolean

  onSign?: () => void

  onFinish?: () => void

  onCancel?: () => void

  onError?: (message: string) => void

  onOpened?: () => void

}



type SignFlowEmbedMessage = {

  source?: string

  event?: string

  documentId?: string

}



/** Embedded investor signing via SignFlow public embed URL (no SignFlow login). */

export function SignFlowEmbeddedSigner({

  signUrl,

  embedApiKey,

  useInlineContainer = false,

  onSign,

  onFinish,

  onError,

  onOpened,

}: SignFlowEmbeddedSignerProps) {

  const hostRef = useRef<HTMLDivElement>(null)

  const finishHandledRef = useRef(false)

  const onFinishRef = useRef(onFinish)

  const onSignRef = useRef(onSign)

  const onOpenedRef = useRef(onOpened)

  const onErrorRef = useRef(onError)



  onFinishRef.current = onFinish

  onSignRef.current = onSign

  onOpenedRef.current = onOpened

  onErrorRef.current = onError

  const embedSignUrl = useMemo(
    () =>
      buildSignFlowEmbedSignUrlClient(signUrl, {
        embedApiKey,
        parentOrigin:
          typeof window !== "undefined" ? window.location.origin : null,
      }),
    [signUrl, embedApiKey],
  )

  useLayoutEffect(() => {

    const url = embedSignUrl?.trim()

    if (!url) return



    finishHandledRef.current = false



    const host = useInlineContainer ? hostRef.current : null

    if (useInlineContainer && !host) return



    const iframe = document.createElement("iframe")

    iframe.src = url

    iframe.title = "SignFlow document signing"

    iframe.className = "dropbox_sign_embedded_host_inline"

    iframe.style.width = "100%"

    iframe.style.height = "100%"

    iframe.style.border = "0"

    iframe.allow = "clipboard-write"



    const handleMessage = (event: MessageEvent) => {

      const data = event.data as SignFlowEmbedMessage | undefined

      if (!data || typeof data !== "object") return



      if (data.source === "signflow-embed" && data.event === "loaded") {

        onOpenedRef.current?.()

        return

      }



      if (

        (data.source === "signflow-embed" && data.event === "completed") ||

        data.event === "document.completed"

      ) {

        onSignRef.current?.()

        if (finishHandledRef.current) return

        finishHandledRef.current = true

        onFinishRef.current?.()

      }

    }



    window.addEventListener("message", handleMessage)



    iframe.addEventListener("load", () => {

      onOpenedRef.current?.()

    })

    iframe.addEventListener("error", () => {

      onErrorRef.current?.("Could not load the SignFlow signing session")

    })



    host?.replaceChildren(iframe)



    return () => {

      window.removeEventListener("message", handleMessage)

      host?.replaceChildren()

    }

  }, [embedSignUrl, useInlineContainer])



  if (!useInlineContainer) return null



  return (

    <div

      ref={hostRef}

      className="dropbox_sign_embedded_host dropbox_sign_embedded_host_inline"

      role="region"

      aria-label="SignFlow document signing"

    />

  )

}


