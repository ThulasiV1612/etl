declare module "hellosign-embedded" {
  export type HelloSignEvent =
    | "open"
    | "cancel"
    | "finish"
    | "close"
    | "error"
    | "createTemplate"
    | "message"
    | "sign"

  export type HelloSignOpenOptions = {
    clientId?: string
    skipDomainVerification?: boolean
    allowCancel?: boolean
    debug?: boolean
    timeout?: number
    container?: HTMLElement
  }

  export default class HelloSign {
    constructor(options?: { clientId?: string })
    open(url: string, options?: HelloSignOpenOptions): void
    close(): void
    on(event: HelloSignEvent, callback: (data?: unknown) => void): void
    off(event: HelloSignEvent, callback?: (data?: unknown) => void): void
  }
}
