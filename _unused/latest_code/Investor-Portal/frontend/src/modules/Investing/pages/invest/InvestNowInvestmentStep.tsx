import {
  blurFormatMoneyInputBare,
  formatCurrencyUsdTypeInputBare,
} from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import "@/modules/Syndication/Deals/components/deals-create-dropdown.css"
import { INVEST_NOW_FUNDING_METHOD_OPTIONS } from "./investNowFundingMethods"
import { InvestNowFormField } from "./InvestNowFormField"
import { InvestNowStepLayout } from "./InvestNowStepLayout"

export interface InvestNowInvestmentStepProps {
  amount: string
  fundingMethod: string
  minimumHint: string
  belowMinimumNotice?: string | null
  onAmountChange: (v: string) => void
  onFundingMethodChange: (v: string) => void
  onAmountBlur?: () => void
  disabled: boolean
  error?: string
  fieldErrors?: Partial<Record<"amount" | "fundingMethod", string>>
}

export function InvestNowInvestmentStep({
  amount,
  fundingMethod,
  minimumHint,
  belowMinimumNotice,
  onAmountChange,
  onFundingMethodChange,
  onAmountBlur,
  disabled,
  error,
  fieldErrors = {},
}: InvestNowInvestmentStepProps) {
  const amountId = "invest-now-amount"
  const fundingId = "invest-now-funding-method"
  const titleId = "invest-now-step-investment-title"

  return (
    <InvestNowStepLayout
      titleId={titleId}
      title="Investment"
      hint="Input the amount you would like to invest and the method you will use."
      error={error}
    >
      <InvestNowFormField
        id={amountId}
        label="Investment amount"
        required
        hint={minimumHint || undefined}
        notice={belowMinimumNotice || undefined}
        error={fieldErrors.amount}
      >
        <div className="invest_now_money_input_wrap">
          <span className="invest_now_money_prefix" aria-hidden>
            $
          </span>
          <input
            id={amountId}
            type="text"
            inputMode="decimal"
            className="deals_create_input invest_now_money_input"
            value={amount}
            disabled={disabled}
            placeholder="0"
            onChange={(e) =>
              onAmountChange(formatCurrencyUsdTypeInputBare(e.target.value))
            }
            onBlur={() => {
              if (!amount.trim()) {
                onAmountChange("")
                return
              }
              onAmountChange(blurFormatMoneyInputBare(amount))
              onAmountBlur?.()
            }}
            aria-invalid={Boolean(fieldErrors.amount) || undefined}
          />
        </div>
      </InvestNowFormField>

      <InvestNowFormField
        id={fundingId}
        label="Funding method"
        required
        error={fieldErrors.fundingMethod}
      >
        <DealsCreateDropdownSelect
          id={fundingId}
          options={[...INVEST_NOW_FUNDING_METHOD_OPTIONS]}
          value={fundingMethod}
          onChange={onFundingMethodChange}
          placeholder="Select funding method"
          ariaLabel="Funding method"
          invalid={Boolean(fieldErrors.fundingMethod)}
          disabled={disabled}
        />
      </InvestNowFormField>
    </InvestNowStepLayout>
  )
}
