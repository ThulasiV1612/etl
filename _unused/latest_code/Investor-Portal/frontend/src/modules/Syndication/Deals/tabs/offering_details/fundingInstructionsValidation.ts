import { abaRoutingNumberFieldError } from "@/common/bank/usAbaRoutingNumber"
import type { FundingInstructionsState } from "./fundingInstructions"

export type FundingInstructionsFieldErrors = {
  achRoutingNumber?: string
  wireRoutingNumber?: string
}

export function validateFundingInstructionsForm(
  form: FundingInstructionsState,
): FundingInstructionsFieldErrors {
  const errors: FundingInstructionsFieldErrors = {}

  if (form.achEnabled) {
    const err = abaRoutingNumberFieldError(form.achRoutingNumber, {
      allowEmpty: true,
    })
    if (err) errors.achRoutingNumber = err
  }

  if (form.wireEnabled) {
    const err = abaRoutingNumberFieldError(form.routingNumber, {
      allowEmpty: true,
    })
    if (err) errors.wireRoutingNumber = err
  }

  return errors
}

export function fundingInstructionsFieldErrorsActive(
  errors: FundingInstructionsFieldErrors,
): boolean {
  return Boolean(errors.achRoutingNumber || errors.wireRoutingNumber)
}

/** Map API validation messages back to inline field errors when possible. */
export function fundingInstructionsFieldErrorsFromApiMessage(
  message: string,
): FundingInstructionsFieldErrors {
  const m = message.trim()
  if (!m) return {}
  const errors: FundingInstructionsFieldErrors = {}
  const achMatch = m.match(/^ACH routing number:\s*(.+)$/i)
  if (achMatch) {
    errors.achRoutingNumber = achMatch[1]!.trim() || m
    return errors
  }
  const wireMatch = m.match(/^Wire routing number:\s*(.+)$/i)
  if (wireMatch) {
    errors.wireRoutingNumber = wireMatch[1]!.trim() || m
    return errors
  }
  return errors
}
