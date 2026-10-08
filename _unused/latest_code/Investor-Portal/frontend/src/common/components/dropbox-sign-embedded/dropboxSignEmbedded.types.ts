/** Payload from hellosign-embedded `createTemplate` event after user saves the template. */
export type DropboxSignCreateTemplateEvent = {
  templateId: string
  templateInfo?: {
    title?: string
    message?: string
    signerRoles?: { name: string; order?: number }[]
    ccRoles?: string[]
  }
}

export type DropboxSignEmbeddedOpenOptions = {
  clientId: string
  testMode: boolean
  skipDomainVerification?: boolean
}
