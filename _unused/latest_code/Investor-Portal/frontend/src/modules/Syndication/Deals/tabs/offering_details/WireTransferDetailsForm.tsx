import { useId } from "react"
import { digitsFromAbaRoutingInput } from "@/common/bank/usAbaRoutingNumber"
import { InfoIconPanel } from "./FieldInfoHeading"

const WIRE_REFERENCE_HELP =
  "When using a Cash Flow Portal bank account, a unique identifier is generated for each investor and inserted into this field automatically. Adding any custom information to this field will disable this functionality."
const WIRE_OTHER_INSTRUCTIONS_HELP =
  "Use this field to provide the LP with any additional instructions when sending their wire transfer."

type WireTransferDetailsFormProps = {
  baseId: string
  receivingBank: string
  onReceivingBankChange: (value: string) => void
  bankAddress: string
  onBankAddressChange: (value: string) => void
  routingNumber: string
  onRoutingNumberChange: (value: string) => void
  accountNumber: string
  onAccountNumberChange: (value: string) => void
  accountType: "checking" | "savings"
  onAccountTypeChange: (value: "checking" | "savings") => void
  beneficiaryAccountName: string
  onBeneficiaryAccountNameChange: (value: string) => void
  beneficiaryAddress: string
  onBeneficiaryAddressChange: (value: string) => void
  reference: string
  onReferenceChange: (value: string) => void
  otherInstructions: string
  onOtherInstructionsChange: (value: string) => void
  routingNumberError?: string
}

type WireTextRowProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

function WireTextRow({ id, label, value, onChange }: WireTextRowProps) {
  return (
    <div className="deal_fi_wire_row">
      <label className="deal_fi_wire_label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="deal_fi_wire_input"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

type WireLabelWithHelpProps = {
  labelId: string
  label: string
  helpAriaLabel: string
  helpContent: string
}

function WireLabelWithHelp({
  labelId,
  label,
  helpAriaLabel,
  helpContent,
}: WireLabelWithHelpProps) {
  return (
    <div className="deal_fi_wire_label deal_fi_wire_label_with_help">
      <span id={labelId}>{label}</span>
      <InfoIconPanel ariaLabel={helpAriaLabel} infoContent={<p>{helpContent}</p>} />
    </div>
  )
}

export function WireTransferDetailsForm({
  baseId,
  receivingBank,
  onReceivingBankChange,
  bankAddress,
  onBankAddressChange,
  routingNumber,
  onRoutingNumberChange,
  accountNumber,
  onAccountNumberChange,
  accountType,
  onAccountTypeChange,
  beneficiaryAccountName,
  onBeneficiaryAccountNameChange,
  beneficiaryAddress: _beneficiaryAddress,
  onBeneficiaryAddressChange: _onBeneficiaryAddressChange,
  reference,
  onReferenceChange,
  otherInstructions,
  onOtherInstructionsChange,
  routingNumberError,
}: WireTransferDetailsFormProps) {
  const accountTypeGroupId = useId()
  const referenceLabelId = `${baseId}-wire-reference-label`
  const otherInstructionsLabelId = `${baseId}-wire-other-label`

  return (
    <div className="deal_fi_wire_form">
      <section className="deal_fi_wire_group" aria-labelledby={`${baseId}-wire-account-heading`}>
        <h4 className="deal_fi_wire_group_title" id={`${baseId}-wire-account-heading`}>
          Account details
        </h4>
        <WireTextRow
          id={`${baseId}-receiving-bank`}
          label="Receiving bank"
          value={receivingBank}
          onChange={onReceivingBankChange}
        />
        <WireTextRow
          id={`${baseId}-bank-address`}
          label="Bank address"
          value={bankAddress}
          onChange={onBankAddressChange}
        />
        <div className="deal_fi_wire_row deal_fi_wire_row_stacked_field">
          <label className="deal_fi_wire_label" htmlFor={`${baseId}-routing-number`}>
            Routing number
          </label>
          <input
            id={`${baseId}-routing-number`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={[
              "deal_fi_wire_input",
              routingNumberError ? "um_field_input_invalid" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            value={routingNumber}
            onChange={(e) =>
              onRoutingNumberChange(digitsFromAbaRoutingInput(e.target.value))
            }
            aria-invalid={Boolean(routingNumberError)}
            aria-describedby={
              routingNumberError ? `${baseId}-routing-number-err` : undefined
            }
            maxLength={9}
          />
          {routingNumberError ? (
            <p
              id={`${baseId}-routing-number-err`}
              className="deal_fi_field_error"
              role="alert"
            >
              {routingNumberError}
            </p>
          ) : null}
        </div>
        <WireTextRow
          id={`${baseId}-account-number`}
          label="Account number"
          value={accountNumber}
          onChange={onAccountNumberChange}
        />
        <div className="deal_fi_wire_row">
          <span className="deal_fi_wire_label" id={`${baseId}-account-type-label`}>
            Account type
          </span>
          <div
            className="deal_fi_wire_radios"
            role="radiogroup"
            aria-labelledby={`${baseId}-account-type-label`}
            id={accountTypeGroupId}
          >
            <label className="deal_fi_wire_radio">
              <input
                type="radio"
                name={`${baseId}-account-type`}
                value="checking"
                checked={accountType === "checking"}
                onChange={() => onAccountTypeChange("checking")}
              />
              <span>Checking</span>
            </label>
            <label className="deal_fi_wire_radio">
              <input
                type="radio"
                name={`${baseId}-account-type`}
                value="savings"
                checked={accountType === "savings"}
                onChange={() => onAccountTypeChange("savings")}
              />
              <span>Savings</span>
            </label>
          </div>
        </div>
      </section>

      <section className="deal_fi_wire_group" aria-labelledby={`${baseId}-wire-beneficiary-heading`}>
        <h4 className="deal_fi_wire_group_title" id={`${baseId}-wire-beneficiary-heading`}>
          Beneficiary info
        </h4>
        <WireTextRow
          id={`${baseId}-beneficiary-name`}
          label="Beneficiary account name"
          value={beneficiaryAccountName}
          onChange={onBeneficiaryAccountNameChange}
        />
        {/* Beneficiary address — hidden per product. */}
        {/* <WireTextRow
          id={`${baseId}-beneficiary-address`}
          label="Beneficiary address"
          value={beneficiaryAddress}
          onChange={onBeneficiaryAddressChange}
        /> */}
      </section>

      <section className="deal_fi_wire_group" aria-labelledby={`${baseId}-wire-other-heading`}>
        <h4 className="deal_fi_wire_group_title" id={`${baseId}-wire-other-heading`}>
          Other info
        </h4>
        <div className="deal_fi_wire_row">
          <WireLabelWithHelp
            labelId={referenceLabelId}
            label="Reference"
            helpAriaLabel="More information: wire reference"
            helpContent={WIRE_REFERENCE_HELP}
          />
          <input
            id={`${baseId}-reference`}
            type="text"
            className="deal_fi_wire_input"
            autoComplete="off"
            aria-labelledby={referenceLabelId}
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
          />
        </div>
        <div className="deal_fi_wire_row deal_fi_wire_row_textarea">
          <WireLabelWithHelp
            labelId={otherInstructionsLabelId}
            label="Other instructions"
            helpAriaLabel="More information: other wire instructions"
            helpContent={WIRE_OTHER_INSTRUCTIONS_HELP}
          />
          <textarea
            id={`${baseId}-other-instructions`}
            className="deal_fi_wire_textarea"
            rows={4}
            aria-labelledby={otherInstructionsLabelId}
            value={otherInstructions}
            onChange={(e) => onOtherInstructionsChange(e.target.value)}
          />
        </div>
      </section>
    </div>
  )
}
