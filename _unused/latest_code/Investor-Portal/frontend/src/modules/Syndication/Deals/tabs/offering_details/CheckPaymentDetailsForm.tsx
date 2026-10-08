type CheckPaymentDetailsFormProps = {
  baseId: string
  mailingAddress: string
  onMailingAddressChange: (value: string) => void
  beneficiary: string
  onBeneficiaryChange: (value: string) => void
  beneficiaryAddress: string
  onBeneficiaryAddressChange: (value: string) => void
  memo: string
  onMemoChange: (value: string) => void
  otherInstructions: string
  onOtherInstructionsChange: (value: string) => void
}

type CheckTextRowProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

function CheckTextRow({ id, label, value, onChange }: CheckTextRowProps) {
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

export function CheckPaymentDetailsForm({
  baseId,
  mailingAddress,
  onMailingAddressChange,
  beneficiary,
  onBeneficiaryChange,
  beneficiaryAddress: _beneficiaryAddress,
  onBeneficiaryAddressChange: _onBeneficiaryAddressChange,
  memo,
  onMemoChange,
  otherInstructions,
  onOtherInstructionsChange,
}: CheckPaymentDetailsFormProps) {
  const otherInstructionsLabelId = `${baseId}-check-other-label`

  return (
    <div className="deal_fi_wire_form">
      <section className="deal_fi_wire_group" aria-label="Check payment details">
        <CheckTextRow
          id={`${baseId}-beneficiary`}
          label="Beneficiary Name"
          value={beneficiary}
          onChange={onBeneficiaryChange}
        />
        <CheckTextRow
          id={`${baseId}-mailing-address`}
          label="Mailing address"
          value={mailingAddress}
          onChange={onMailingAddressChange}
        />
        {/* Beneficiary address — hidden per product (use Mailing address above). */}
        {/* <CheckTextRow
          id={`${baseId}-beneficiary-address`}
          label="Beneficiary address"
          value={beneficiaryAddress}
          onChange={onBeneficiaryAddressChange}
        /> */}
        <CheckTextRow
          id={`${baseId}-memo`}
          label="Memo"
          value={memo}
          onChange={onMemoChange}
        />
      </section>
      <section
        className="deal_fi_wire_group"
        aria-labelledby={`${baseId}-check-other-heading`}
      >
        <h4 className="deal_fi_wire_group_title" id={`${baseId}-check-other-heading`}>
          Other info
        </h4>
        <div className="deal_fi_wire_row deal_fi_wire_row_textarea">
        <label
          className="deal_fi_wire_label"
          id={otherInstructionsLabelId}
          htmlFor={`${baseId}-other-instructions`}
        >
          Other instructions
        </label>
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
