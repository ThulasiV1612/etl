import {
  blurFormatMoneyInputTwoDecimals,
  blurFormatPercentTwoDecimalsInput,
} from "../../utils/offeringMoneyFormat"

export type FundingAccountType = "checking" | "savings"

export type FundingInstructionsState = {
  achEnabled: boolean
  achReceivingBank: string
  achBankAddress: string
  achRoutingNumber: string
  achAccountNumber: string
  achAccountType: FundingAccountType
  achBeneficiaryAccountName: string
  achBeneficiaryAddress: string
  achReference: string
  achOtherInstructions: string
  wireEnabled: boolean
  receivingBank: string
  bankAddress: string
  routingNumber: string
  accountNumber: string
  accountType: FundingAccountType
  beneficiaryAccountName: string
  beneficiaryAddress: string
  wireReference: string
  wireOtherInstructions: string
  checksEnabled: boolean
  checkMailingAddress: string
  checkBeneficiary: string
  checkBeneficiaryAddress: string
  checkMemo: string
  checkOtherInstructions: string
  investmentFeeMethod: string
  feeHandlingMethod: string
  feeAmount: string
}

export const defaultFundingInstructionsState = (): FundingInstructionsState => ({
  achEnabled: false,
  achReceivingBank: "",
  achBankAddress: "",
  achRoutingNumber: "",
  achAccountNumber: "",
  achAccountType: "checking",
  achBeneficiaryAccountName: "",
  achBeneficiaryAddress: "",
  achReference: "",
  achOtherInstructions: "",
  wireEnabled: true,
  receivingBank: "",
  bankAddress: "",
  routingNumber: "",
  accountNumber: "",
  accountType: "checking",
  beneficiaryAccountName: "",
  beneficiaryAddress: "",
  wireReference: "",
  wireOtherInstructions: "",
  checksEnabled: false,
  checkMailingAddress: "",
  checkBeneficiary: "",
  checkBeneficiaryAddress: "",
  checkMemo: "",
  checkOtherInstructions: "",
  investmentFeeMethod: "none",
  feeHandlingMethod: "in_addition",
  feeAmount: "",
})

function clipAccountType(v: unknown): FundingAccountType {
  return v === "savings" ? "savings" : "checking"
}

function clipFeeMethod(v: unknown): string {
  const s = typeof v === "string" ? v : ""
  if (s === "flat" || s === "percent") return s
  return "none"
}

function clipFeeHandling(v: unknown): string {
  return v === "included" ? "included" : "in_addition"
}

function normalizeStoredFeeAmount(method: string, amount: string): string {
  const t = amount.trim()
  if (!t) return ""
  if (method === "flat") return blurFormatMoneyInputTwoDecimals(t)
  if (method === "percent") return blurFormatPercentTwoDecimalsInput(t)
  return t
}

export function fundingInstructionsFromStoredJson(
  stored: string | null | undefined,
): FundingInstructionsState {
  const base = defaultFundingInstructionsState()
  const t = stored?.trim()
  if (!t) return base
  try {
    const parsed = JSON.parse(t) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base
    const o = parsed as Record<string, unknown>
    const ach =
      o.ach && typeof o.ach === "object" && !Array.isArray(o.ach)
        ? (o.ach as Record<string, unknown>)
        : {}
    const wire =
      o.wire && typeof o.wire === "object" && !Array.isArray(o.wire)
        ? (o.wire as Record<string, unknown>)
        : {}
    const checks =
      o.checks && typeof o.checks === "object" && !Array.isArray(o.checks)
        ? (o.checks as Record<string, unknown>)
        : {}
    const investmentFee =
      o.investmentFee &&
      typeof o.investmentFee === "object" &&
      !Array.isArray(o.investmentFee)
        ? (o.investmentFee as Record<string, unknown>)
        : {}
    return {
      achEnabled: ach.enabled === true,
      achReceivingBank:
        typeof ach.receivingBank === "string" ? ach.receivingBank : "",
      achBankAddress:
        typeof ach.bankAddress === "string" ? ach.bankAddress : "",
      achRoutingNumber:
        typeof ach.routingNumber === "string" ? ach.routingNumber : "",
      achAccountNumber:
        typeof ach.accountNumber === "string" ? ach.accountNumber : "",
      achAccountType: clipAccountType(ach.accountType),
      achBeneficiaryAccountName:
        typeof ach.beneficiaryAccountName === "string"
          ? ach.beneficiaryAccountName
          : "",
      achBeneficiaryAddress:
        typeof ach.beneficiaryAddress === "string"
          ? ach.beneficiaryAddress
          : "",
      achReference: typeof ach.reference === "string" ? ach.reference : "",
      achOtherInstructions:
        typeof ach.otherInstructions === "string"
          ? ach.otherInstructions
          : "",
      wireEnabled: wire.enabled !== false,
      receivingBank:
        typeof wire.receivingBank === "string" ? wire.receivingBank : "",
      bankAddress: typeof wire.bankAddress === "string" ? wire.bankAddress : "",
      routingNumber:
        typeof wire.routingNumber === "string" ? wire.routingNumber : "",
      accountNumber:
        typeof wire.accountNumber === "string" ? wire.accountNumber : "",
      accountType: clipAccountType(wire.accountType),
      beneficiaryAccountName:
        typeof wire.beneficiaryAccountName === "string"
          ? wire.beneficiaryAccountName
          : "",
      beneficiaryAddress:
        typeof wire.beneficiaryAddress === "string"
          ? wire.beneficiaryAddress
          : "",
      wireReference: typeof wire.reference === "string" ? wire.reference : "",
      wireOtherInstructions:
        typeof wire.otherInstructions === "string"
          ? wire.otherInstructions
          : "",
      checksEnabled: checks.enabled === true,
      checkMailingAddress:
        typeof checks.mailingAddress === "string" ? checks.mailingAddress : "",
      checkBeneficiary:
        typeof checks.beneficiary === "string" ? checks.beneficiary : "",
      checkBeneficiaryAddress:
        typeof checks.beneficiaryAddress === "string"
          ? checks.beneficiaryAddress
          : "",
      checkMemo: typeof checks.memo === "string" ? checks.memo : "",
      checkOtherInstructions:
        typeof checks.otherInstructions === "string"
          ? checks.otherInstructions
          : "",
      investmentFeeMethod: clipFeeMethod(investmentFee.method),
      feeHandlingMethod: clipFeeHandling(investmentFee.handlingMethod),
      feeAmount: normalizeStoredFeeAmount(
        clipFeeMethod(investmentFee.method),
        typeof investmentFee.amount === "string" ? investmentFee.amount : "",
      ),
    }
  } catch {
    return base
  }
}

export function serializeFundingInstructions(
  state: FundingInstructionsState,
): string {
  return JSON.stringify({
    v: 1,
    ach: {
      enabled: state.achEnabled,
      receivingBank: state.achReceivingBank,
      bankAddress: state.achBankAddress,
      routingNumber: state.achRoutingNumber,
      accountNumber: state.achAccountNumber,
      accountType: state.achAccountType,
      beneficiaryAccountName: state.achBeneficiaryAccountName,
      beneficiaryAddress: "", // hidden field — use bank / mailing address instead
      reference: state.achReference,
      otherInstructions: state.achOtherInstructions,
    },
    wire: {
      enabled: state.wireEnabled,
      receivingBank: state.receivingBank,
      bankAddress: state.bankAddress,
      routingNumber: state.routingNumber,
      accountNumber: state.accountNumber,
      accountType: state.accountType,
      beneficiaryAccountName: state.beneficiaryAccountName,
      beneficiaryAddress: "", // hidden field
      reference: state.wireReference,
      otherInstructions: state.wireOtherInstructions,
    },
    checks: {
      enabled: state.checksEnabled,
      mailingAddress: state.checkMailingAddress,
      beneficiary: state.checkBeneficiary,
      beneficiaryAddress: "", // hidden field — use Mailing address instead
      memo: state.checkMemo,
      otherInstructions: state.checkOtherInstructions,
    },
    investmentFee: {
      method: state.investmentFeeMethod,
      handlingMethod: state.feeHandlingMethod,
      amount: normalizeStoredFeeAmount(
        state.investmentFeeMethod,
        state.feeAmount,
      ),
    },
  })
}

export function fundingInstructionsEqual(
  a: FundingInstructionsState,
  b: FundingInstructionsState,
): boolean {
  return serializeFundingInstructions(a) === serializeFundingInstructions(b)
}

export function cloneFundingInstructions(
  state: FundingInstructionsState,
): FundingInstructionsState {
  return { ...state }
}
