import type { ReactNode } from "react"
import { DollarSign } from "lucide-react"
import { MandatoryFieldMark } from "../../../../../common/components/form-tooltip/FormTooltip"
import { InfoIconPanel } from "./FieldInfoHeading"
import {
  blurFormatMoneyInputTwoDecimals,
  blurFormatPercentTwoDecimalsInput,
  formatCurrencyUsdTypeInput,
  formatPercentTypeInput,
} from "../../utils/offeringMoneyFormat"
export const INVESTMENT_FEE_OPTIONS = [
  { value: "none", label: "No fee" },
  { value: "flat", label: "Amount" },
  { value: "percent", label: "Percentage" },
] as const

const FEE_HANDLING_OPTIONS = [
  {
    value: "in_addition",
    label: "In addition to investment amount (standard)",
  },
  { value: "included", label: "Included in investment amount" },
] as const

const INVESTMENT_FEE_HELP_P1 =
  'Investment fees are additional charges for an investment that does not count toward the investment amount. For example, this could be a flat fee charged for an investment payment, or a "true up" as a result of a previous tranche.'
const INVESTMENT_FEE_HELP_P2 =
  'Investment fees are not enforced with wire transfers. For wire transfers, please indicate the fee amount within the "Wire transfer details" section.'

const FEE_HANDLING_HINT =
  "Choose whether the LP's specified investment amount includes the fee or if the fee is added on top."
const FEE_HANDLING_HELP_ICON =
  "Example: the LP inputs a $50,000 investment amount, and there is a $1,000 fee. If the fee is included, they will fund $50,000 and their actual investment will be $49,000. If the fee is additional, they will fund $51,000 and their actual investment will be $50,000."
const FEE_AMOUNT_HELP =
  "The fee charged to new investments made in New class for their initial payment."
const INVESTMENT_FEE_METHOD_FLAT_HELP = "Fixed fee amount"
const INVESTMENT_FEE_METHOD_PERCENT_HELP =
  "A percentage fee, relative to the total investment amount. E.g. 1% of the total investment amount."

type InvestmentFeeFieldsProps = {
  baseId: string
  investmentFeeMethod: string
  onInvestmentFeeMethodChange: (value: string) => void
  feeHandlingMethod: string
  onFeeHandlingMethodChange: (value: string) => void
  feeAmount: string
  onFeeAmountChange: (value: string) => void
}

type FeeLabelWithHelpProps = {
  labelId: string
  htmlFor?: string
  label: string
  helpAriaLabel: string
  helpContent: ReactNode
  required?: boolean
}

function FeeLabelWithHelp({
  labelId,
  htmlFor,
  label,
  helpAriaLabel,
  helpContent,
  required,
}: FeeLabelWithHelpProps) {
  const labelEl = (
    <span className="form_label_inline_row">
      <span>{label}</span>
      {required ? <MandatoryFieldMark /> : null}
    </span>
  )

  return (
    <div className="deal_fi_wire_label deal_fi_wire_label_with_help">
      {htmlFor ? (
        <label id={labelId} htmlFor={htmlFor}>
          {labelEl}
        </label>
      ) : (
        <span id={labelId}>{labelEl}</span>
      )}
      <InfoIconPanel ariaLabel={helpAriaLabel} infoContent={helpContent} />
    </div>
  )
}

export function InvestmentFeeFields({
  baseId,
  investmentFeeMethod,
  onInvestmentFeeMethodChange,
  feeHandlingMethod,
  onFeeHandlingMethodChange,
  feeAmount,
  onFeeAmountChange,
}: InvestmentFeeFieldsProps) {
  const showsFeeDetails =
    investmentFeeMethod === "percent" || investmentFeeMethod === "flat"
  const feeMethodLabelId = `${baseId}-fee-method-label`
  const feeHandlingLabelId = `${baseId}-fee-handling-label`
  const feeAmountLabelId = `${baseId}-fee-amount-label`
  const isFlatFee = investmentFeeMethod === "flat"
  const isPercentFee = investmentFeeMethod === "percent"

  return (
    <div className="deal_fi_wire_form deal_fi_fee_form">
      <section className="deal_fi_wire_group" aria-label="Investment fee settings">
        <div className="deal_fi_wire_row">
          <FeeLabelWithHelp
            labelId={feeMethodLabelId}
            htmlFor={`${baseId}-fee-method`}
            label="Investment fee method"
            helpAriaLabel="More information: investment fee method"
            helpContent={
              <>
                <p>{INVESTMENT_FEE_HELP_P1}</p>
                <p>{INVESTMENT_FEE_HELP_P2}</p>
              </>
            }
          />
          <div className="deal_fi_wire_select_row">
            <select
              id={`${baseId}-fee-method`}
              className="deal_fi_wire_select"
              aria-labelledby={feeMethodLabelId}
              value={investmentFeeMethod}
              onChange={(e) => onInvestmentFeeMethodChange(e.target.value)}
            >
              {INVESTMENT_FEE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {investmentFeeMethod === "flat" ? (
              <InfoIconPanel
                ariaLabel="More information: Amount investment fee method"
                infoContent={<p>{INVESTMENT_FEE_METHOD_FLAT_HELP}</p>}
              />
            ) : null}
            {investmentFeeMethod === "percent" ? (
              <InfoIconPanel
                ariaLabel="More information: Percentage investment fee method"
                infoContent={<p>{INVESTMENT_FEE_METHOD_PERCENT_HELP}</p>}
              />
            ) : null}
          </div>
        </div>
      </section>

      {showsFeeDetails ? (
        <section
          className="deal_fi_wire_group"
          aria-labelledby={`${baseId}-new-class-fees-heading`}
        >
          <h4
            className="deal_fi_wire_group_title deal_fi_fee_class_heading"
            id={`${baseId}-new-class-fees-heading`}
          >
            New class investment fees
          </h4>
          <div className="deal_fi_wire_row deal_fi_wire_row_stacked_field">
            <FeeLabelWithHelp
              labelId={feeHandlingLabelId}
              htmlFor={`${baseId}-fee-handling`}
              label="Fee handling method"
              helpAriaLabel="More information: fee handling method"
              helpContent={<p>{FEE_HANDLING_HELP_ICON}</p>}
            />
            <div className="deal_fi_wire_field_col">
              <select
                id={`${baseId}-fee-handling`}
                className="deal_fi_wire_select"
                aria-labelledby={feeHandlingLabelId}
                value={feeHandlingMethod}
                onChange={(e) => onFeeHandlingMethodChange(e.target.value)}
              >
                {FEE_HANDLING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="deal_fi_wire_hint">{FEE_HANDLING_HINT}</p>
            </div>
          </div>

          <div
            className="deal_fi_wire_row"
            role="group"
            aria-labelledby={`${baseId}-new-class-fees-heading`}
          >
            <div className="deal_fi_wire_label deal_fi_wire_label_with_help">
              <label
                id={feeAmountLabelId}
                htmlFor={`${baseId}-fee-amount`}
                className="deal_fi_fee_amount_label"
              >
                <span className="form_label_inline_row">
                  {isFlatFee ? (
                    <DollarSign
                      className="deal_fi_fee_amount_label_icon"
                      size={17}
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                  <span>Fee amount</span>
                  <MandatoryFieldMark />
                </span>
              </label>
              <InfoIconPanel
                ariaLabel="More information: fee amount"
                infoContent={<p>{FEE_AMOUNT_HELP}</p>}
              />
            </div>
            <input
              id={`${baseId}-fee-amount`}
              type="text"
              className="deal_fi_wire_input"
              inputMode="decimal"
              autoComplete="off"
              aria-required
              aria-labelledby={feeAmountLabelId}
              placeholder={isFlatFee ? "$0.00" : "0.00%"}
              value={feeAmount}
              onChange={(e) => {
                const raw = e.target.value
                if (isFlatFee) {
                  onFeeAmountChange(formatCurrencyUsdTypeInput(raw))
                  return
                }
                if (isPercentFee) {
                  onFeeAmountChange(formatPercentTypeInput(raw))
                  return
                }
                onFeeAmountChange(raw)
              }}
              onBlur={(e) => {
                const raw = e.target.value
                if (isFlatFee) {
                  onFeeAmountChange(blurFormatMoneyInputTwoDecimals(raw))
                  return
                }
                if (isPercentFee) {
                  onFeeAmountChange(blurFormatPercentTwoDecimalsInput(raw))
                }
              }}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}
