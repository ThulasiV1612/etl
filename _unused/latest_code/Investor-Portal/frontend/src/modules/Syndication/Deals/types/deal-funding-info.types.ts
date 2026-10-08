export type DealFundingInfo = {
  achEnabled: boolean
  wireEnabled: boolean
  checksEnabled: boolean
  receivingBankAccount: string
  investmentFeeMethod: string
  checkInstructions: string
}

export const DEFAULT_DEAL_FUNDING_INFO: DealFundingInfo = {
  achEnabled: false,
  wireEnabled: true,
  checksEnabled: false,
  receivingBankAccount: "",
  investmentFeeMethod: "none",
  checkInstructions: "",
}

export function fundingInfoFromStoredJson(
  stored: string | null | undefined,
): DealFundingInfo {
  const t = stored?.trim()
  if (!t) return { ...DEFAULT_DEAL_FUNDING_INFO }
  try {
    const parsed = JSON.parse(t) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_DEAL_FUNDING_INFO }
    }
    const o = parsed as Record<string, unknown>
    const feeRaw =
      typeof o.investmentFeeMethod === "string"
        ? o.investmentFeeMethod.trim()
        : "none"
    const investmentFeeMethod =
      feeRaw === "flat" || feeRaw === "percent" ? feeRaw : "none"
    return {
      achEnabled: o.achEnabled === true,
      wireEnabled: o.wireEnabled !== false,
      checksEnabled: o.checksEnabled === true,
      receivingBankAccount:
        typeof o.receivingBankAccount === "string"
          ? o.receivingBankAccount
          : "",
      investmentFeeMethod,
      checkInstructions:
        typeof o.checkInstructions === "string" ? o.checkInstructions : "",
    }
  } catch {
    return { ...DEFAULT_DEAL_FUNDING_INFO }
  }
}

export function serializeFundingInfo(info: DealFundingInfo): string {
  return JSON.stringify({
    v: 1,
    achEnabled: info.achEnabled,
    wireEnabled: info.wireEnabled,
    checksEnabled: info.checksEnabled,
    receivingBankAccount: info.receivingBankAccount,
    investmentFeeMethod: info.investmentFeeMethod,
    checkInstructions: info.checkInstructions,
  })
}

export function fundingInfoEqual(a: DealFundingInfo, b: DealFundingInfo): boolean {
  return (
    a.achEnabled === b.achEnabled &&
    a.wireEnabled === b.wireEnabled &&
    a.checksEnabled === b.checksEnabled &&
    a.receivingBankAccount === b.receivingBankAccount &&
    a.investmentFeeMethod === b.investmentFeeMethod &&
    a.checkInstructions === b.checkInstructions
  )
}
