import { useMemo } from "react"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import { formatSavedAddressLabel, type SavedAddress } from "./address.types"

function invClass(base: string, hasError: boolean) {
  return hasError ? `${base} um_field_input_invalid` : base
}

export function SavedAddressSelect({
  id,
  value,
  onChange,
  savedAddresses,
  emptyLabel,
  ariaLabel,
  disabled,
  emptyListHint,
  invalid,
  onAddNew,
  triggerClassName,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  savedAddresses: SavedAddress[]
  emptyLabel: string
  ariaLabel: string
  disabled?: boolean
  emptyListHint?: string
  invalid?: boolean
  /** Opens the add-address form; shown as the first action in the dropdown panel. */
  onAddNew?: () => void
  /** Defaults to `deals_add_inv_field_control` (+ invalid outline when needed). */
  triggerClassName?: string
}) {
  const noAddresses = savedAddresses.length === 0
  const canAddFromDropdown = Boolean(onAddNew)
  const options = useMemo(
    () => [
      { value: "", label: emptyLabel, disabled: true },
      ...savedAddresses.map((a) => ({
        value: a.id,
        label: formatSavedAddressLabel(a),
      })),
    ],
    [savedAddresses, emptyLabel],
  )
  const trigger =
    triggerClassName ??
    invClass("deals_add_inv_field_control", Boolean(invalid))

  return (
    <>
      {noAddresses && !canAddFromDropdown ? (
        <p className="add_profile_sub" style={{ marginBottom: "0.35em" }}>
          {emptyListHint || (
            <>
              Add at least one address in the <strong>Address</strong> tab, then return
              here to select it.
            </>
          )}
        </p>
      ) : null}
      <DealsCreateDropdownSelect
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={emptyLabel}
        ariaLabel={ariaLabel}
        disabled={disabled || (noAddresses && !canAddFromDropdown)}
        invalid={invalid}
        triggerClassName={trigger}
        panelClassName="deals_create_dropdown_panel"
        header={
          canAddFromDropdown
            ? { label: "+ Add Address", onClick: onAddNew! }
            : undefined
        }
      />
    </>
  )
}
