import type { DealMyEsignScopeQuery } from "@/modules/Syndication/Deals/api/dealsApi"

export type InvestmentEsignSignedResult = {
  esignCompleted: boolean
  esignPending?: boolean
}

export type InvestmentEsignSignModalProps = {
  open: boolean
  dealId: string
  /** When set, opens signing for this Dropbox Sign request (profile send). */
  signatureRequestId?: string | null
  /** Pins eSign to a specific Invest Now commitment (saved profile / investment row). */
  esignScope?: DealMyEsignScopeQuery
  onClose: () => void
  /** Called after the investor finishes in Dropbox Sign (before the modal closes). */
  onSignedComplete?: (
    result: InvestmentEsignSignedResult,
  ) => void | Promise<void>
}
