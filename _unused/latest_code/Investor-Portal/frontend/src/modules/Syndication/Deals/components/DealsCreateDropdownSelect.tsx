import {
  DropdownSelect,
  MODAL_DROPDOWN_SELECT_PROPS,
  type DropdownSelectProps,
} from "../../../../common/components/dropdown-select"
import "./deals-create-dropdown.css"

export { MODAL_DROPDOWN_SELECT_PROPS }

/**
 * Create-deal / asset forms: custom dropdown aligned with `.deals_create_input` typography
 * and focus/error styles. Panel is portaled to avoid clipping in scroll regions.
 */
export function DealsCreateDropdownSelect({
  className,
  panelClassName,
  ...rest
}: DropdownSelectProps) {
  return (
    <DropdownSelect
      {...rest}
      {...MODAL_DROPDOWN_SELECT_PROPS}
      className={["deals_create_dropdown_select", className]
        .filter(Boolean)
        .join(" ")}
      panelClassName={["deals_create_dropdown_panel", panelClassName]
        .filter(Boolean)
        .join(" ")}
    />
  )
}
