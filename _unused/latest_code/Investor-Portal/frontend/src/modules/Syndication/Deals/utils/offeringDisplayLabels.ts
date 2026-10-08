/** Stored values (API/DB); labels match product copy for the status dropdown. */
export const INVESTOR_CLASS_STATUS_OPTIONS = [
  { value: "closed", label: "Closed (no new investments allowed)" },
  { value: "past_hidden", label: "Past (hidden)" },
] as const

/** Shown when editing older rows that still use legacy status values. */
export const INVESTOR_CLASS_STATUS_LEGACY_OPTIONS: {
  value: string
  label: string
}[] = [
  { value: "draft", label: "Draft" },
  { value: "accepting_reservations", label: "Accepting Reservations" },
  { value: "active", label: "Active" },
]

export const INVESTOR_CLASS_VISIBILITY_OPTIONS: {
  value: string
  label: string
}[] = [
  { value: "", label: "Select visibility" },
  { value: "show_on_dashboard", label: "Show on dashboard" },
  {
    value: "show_on_deal_investors_dashboard",
    label: "Show on deal investors' dashboard",
  },
  { value: "only_visible_with_link", label: "Only visible with link" },
]

/** Previous visibility values (still readable in UI for existing rows). */
const INVESTOR_CLASS_VISIBILITY_LEGACY_OPTIONS: {
  value: string
  label: string
}[] = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
  { value: "invite_only", label: "Invite only" },
]

export function investorClassStatusLabel(v: string): string {
  const found = INVESTOR_CLASS_STATUS_OPTIONS.find((o) => o.value === v)
  if (found) return found.label
  const legacy = INVESTOR_CLASS_STATUS_LEGACY_OPTIONS.find((o) => o.value === v)
  if (legacy) return legacy.label
  return v?.trim() ? v : "—"
}

export function investorClassVisibilityLabel(v: string): string {
  if (!v.trim()) return "—"
  const opt = INVESTOR_CLASS_VISIBILITY_OPTIONS.find((o) => o.value === v)
  if (opt && opt.value !== "") return opt.label
  const leg = INVESTOR_CLASS_VISIBILITY_LEGACY_OPTIONS.find((o) => o.value === v)
  if (leg) return leg.label
  return v
}
