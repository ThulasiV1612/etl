import { useMemo } from "react"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import type { InvestorSharedConnectBank } from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import { formatSharedBankOptionLabel } from "./InvestingBankAccountsTab"
import "@/modules/Syndication/Deals/components/deals-create-dropdown.css"

/** Portal dropdown to assign a shared ACH bank to a profile (SavedAddressSelect pattern). */
export function ProfileBankSelect({
  id,
  value,
  onChange,
  banks,
  ariaLabel,
  disabled,
  onAddBank,
}: {
  id: string
  value: string
  onChange: (accountId: string) => void
  banks: InvestorSharedConnectBank[]
  ariaLabel: string
  disabled?: boolean
  onAddBank: () => void
}) {
  const placeholder = banks.length > 0 ? "Select bank…" : "No bank selected"
  const options = useMemo(
    () => [
      { value: "", label: placeholder, disabled: true },
      ...banks.map((bank) => ({
        value: bank.accountId,
        label: `${formatSharedBankOptionLabel(bank)}${
          bank.payoutsEnabled ? "" : " (pending)"
        }`,
      })),
    ],
    [banks, placeholder],
  )

  return (
    <div
      className="investing_profile_bank_select_wrap"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <DealsCreateDropdownSelect
        id={id}
        options={options}
        value={value}
        onChange={(next) => {
          if (!next.trim()) return
          onChange(next)
        }}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        disabled={disabled}
        triggerClassName="investing_profile_bank_select_trigger"
        panelClassName="deals_create_dropdown_panel investing_profile_bank_select_panel"
        header={{
          label:
            banks.length > 0 ? "+ Add different bank" : "+ Add bank account",
          onClick: onAddBank,
        }}
      />
    </div>
  )
}
