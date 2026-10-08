import type { DropdownSelectOption } from "@/common/components/dropdown-select"

export type InvestNowBookProfileOption = {
  id: string
  profileName: string
  profileType: string
}

/** Profile row in Invest Now dropdowns: name on top, profile type beneath (panel only). */
export function investNowProfileDropdownOption(
  p: InvestNowBookProfileOption,
  disabled?: boolean,
): DropdownSelectOption {
  const name = p.profileName?.trim() || "—"
  const type = p.profileType?.trim() || "—"
  return {
    value: p.id,
    label: `${name} ${type}`.trim(),
    disabled,
    labelContent: (
      <span className="invest_now_profile_option">
        <span className="invest_now_profile_option_name">{name}</span>
        <span className="invest_now_profile_option_type">{type}</span>
      </span>
    ),
  }
}
