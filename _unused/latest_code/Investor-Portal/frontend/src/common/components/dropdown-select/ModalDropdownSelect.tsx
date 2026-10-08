import {
  DropdownSelect,
  type DropdownSelectProps,
} from "./DropdownSelect"

/** Props for `DropdownSelect` inside modals / scroll regions (portaled menu). */
export const MODAL_DROPDOWN_SELECT_PROPS = { useFixedPanel: true } as const

/**
 * Dropdown for modals and fixed-height panels — menu is portaled so opening it
 * does not grow the parent layout.
 */
export function ModalDropdownSelect(props: DropdownSelectProps) {
  return <DropdownSelect {...props} useFixedPanel />
}
