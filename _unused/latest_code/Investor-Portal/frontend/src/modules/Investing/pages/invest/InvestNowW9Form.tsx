import { ChevronDown, CircleHelp } from "lucide-react"
import { useState } from "react"
import { SsnItinMaskedInput } from "@/common/components/SsnItinMaskedInput"
import { formatInvestNowW9AddressLine } from "./investNowW9FormUtils"
import type { InvestNowW9FormValues } from "./investNowW9.types"
import {
  INVEST_NOW_W9_NAME_HELP,
  INVEST_NOW_W9_NAME_LABEL,
} from "./investNowW9.types"
import { InvestNowFormField } from "./InvestNowFormField"

export interface InvestNowW9FormProps {
  values: InvestNowW9FormValues
  onChange: (next: InvestNowW9FormValues) => void
  disabled?: boolean
  fieldErrors?: Partial<Record<"w9-name" | "w9-address" | "w9-ssn", string>>
}

export function InvestNowW9Form({
  values,
  onChange,
  disabled = false,
  fieldErrors = {},
}: InvestNowW9FormProps) {
  const nameId = "invest-now-w9-name"
  const addressId = "invest-now-w9-address"
  const ssnId = "invest-now-w9-ssn"
  const [addressDetailsOpen, setAddressDetailsOpen] = useState(true)

  function patch(partial: Partial<InvestNowW9FormValues>) {
    onChange({ ...values, ...partial })
  }

  function patchAddressParts(
    partial: Partial<
      Pick<
        InvestNowW9FormValues,
        "street1" | "street2" | "city" | "state" | "zip"
      >
    >,
  ) {
    const next = { ...values, ...partial }
    next.addressLine = formatInvestNowW9AddressLine(next)
    onChange(next)
  }

  return (
    <div className="invest_now_w9_form deals_create_fields">
      <InvestNowFormField
        id={nameId}
        label={INVEST_NOW_W9_NAME_LABEL}
        required
        className="invest_now_w9_name_field"
        error={fieldErrors["w9-name"]}
      >
        <div className="invest_now_w9_name_row">
          <input
            id={nameId}
            type="text"
            className="deals_create_input"
            value={values.name}
            disabled={disabled}
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors["w9-name"]) || undefined}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <button
            type="button"
            className="invest_now_field_help_btn"
            title={INVEST_NOW_W9_NAME_HELP}
            aria-label={INVEST_NOW_W9_NAME_HELP}
            disabled={disabled}
          >
            <CircleHelp size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </InvestNowFormField>

      <InvestNowFormField
        id={addressId}
        label="Address"
        required
        error={fieldErrors["w9-address"]}
      >
        <div className="invest_now_address_field_stack">
          <div className="invest_now_address_field_wrap">
            <input
              id={addressId}
              type="text"
              className="deals_create_input invest_now_address_line_input"
              value={values.addressLine}
              disabled={disabled}
              autoComplete="street-address"
              aria-invalid={Boolean(fieldErrors["w9-address"]) || undefined}
              onChange={(e) => patch({ addressLine: e.target.value })}
            />
            <button
              type="button"
              className="invest_now_address_details_btn"
              aria-expanded={addressDetailsOpen}
              aria-controls={`${addressId}-details`}
              disabled={disabled}
              onClick={() => setAddressDetailsOpen((o) => !o)}
            >
              Details
              <span
                className="invest_now_address_details_chevron"
                aria-hidden
              >
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={
                    addressDetailsOpen
                      ? "invest_now_address_details_chevron_open"
                      : undefined
                  }
                />
              </span>
            </button>
          </div>
          <div
            id={`${addressId}-details`}
            className={
              addressDetailsOpen
                ? "invest_now_address_details_panel invest_now_address_details_panel_open"
                : "invest_now_address_details_panel"
            }
            aria-hidden={!addressDetailsOpen}
            {...(!addressDetailsOpen ? { inert: true } : {})}
          >
            <div
              className="invest_now_address_details_grid"
              role="group"
              aria-label="Address details"
            >
              <input
                type="text"
                className="deals_create_input"
                placeholder="Street address"
                value={values.street1}
                disabled={disabled}
                autoComplete="address-line1"
                onChange={(e) => patchAddressParts({ street1: e.target.value })}
              />
              <input
                type="text"
                className="deals_create_input"
                placeholder="Apt, suite, etc. (optional)"
                value={values.street2}
                disabled={disabled}
                autoComplete="address-line2"
                onChange={(e) => patchAddressParts({ street2: e.target.value })}
              />
              <div className="invest_now_address_details_city_row">
                <input
                  type="text"
                  className="deals_create_input"
                  placeholder="City"
                  value={values.city}
                  disabled={disabled}
                  autoComplete="address-level2"
                  onChange={(e) => patchAddressParts({ city: e.target.value })}
                />
                <input
                  type="text"
                  className="deals_create_input"
                  placeholder="State"
                  value={values.state}
                  disabled={disabled}
                  autoComplete="address-level1"
                  onChange={(e) => patchAddressParts({ state: e.target.value })}
                />
                <input
                  type="text"
                  className="deals_create_input"
                  placeholder="ZIP"
                  value={values.zip}
                  disabled={disabled}
                  autoComplete="postal-code"
                  inputMode="numeric"
                  onChange={(e) => patchAddressParts({ zip: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </InvestNowFormField>

      <InvestNowFormField
        id={ssnId}
        label="Social Security Number"
        required
        error={fieldErrors["w9-ssn"]}
      >
        <SsnItinMaskedInput
          id={ssnId}
          className="deals_create_input"
          value={values.ssn}
          disabled={disabled}
          showToggle
          allowReveal
          revealLabel="Show SSN"
          hideLabel="Hide SSN"
          aria-invalid={Boolean(fieldErrors["w9-ssn"]) || undefined}
          onValueChange={(ssn) => patch({ ssn })}
        />
      </InvestNowFormField>
    </div>
  )
}
