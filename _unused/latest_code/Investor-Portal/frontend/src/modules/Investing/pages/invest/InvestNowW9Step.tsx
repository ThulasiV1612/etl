import { InvestNowStepLayout } from "./InvestNowStepLayout"
import { InvestNowW9Form } from "./InvestNowW9Form"
import type { InvestNowW9FormValues } from "./investNowW9.types"

export interface InvestNowW9StepProps {
  w9Values: InvestNowW9FormValues
  onW9Change: (v: InvestNowW9FormValues) => void
  disabled: boolean
  error?: string
  fieldErrors?: Partial<Record<"w9-name" | "w9-address" | "w9-ssn", string>>
}

export function InvestNowW9Step({
  w9Values,
  onW9Change,
  disabled,
  error,
  fieldErrors,
}: InvestNowW9StepProps) {
  return (
    <InvestNowStepLayout
      titleId="invest-now-step-w9-title"
      title="W-9 form"
      hint="Please complete the W-9 form below. This is a requirement from the IRS to collect taxpayer information. Note that questions marked with an asterisk are required fields."
      error={error}
    >
      <InvestNowW9Form
        values={w9Values}
        onChange={onW9Change}
        disabled={disabled}
        fieldErrors={fieldErrors}
      />
    </InvestNowStepLayout>
  )
}
