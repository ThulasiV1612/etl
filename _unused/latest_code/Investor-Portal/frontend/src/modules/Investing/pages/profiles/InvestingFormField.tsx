import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import "./InvestingFormField.css"

/** Single field row: matches Add contact / Add investment (`um_field` + `um_field_label_row` + icon). */
export function InvestingFormField({
  id,
  label,
  Icon,
  children,
  labelSuffix,
  fieldClassName = "um_field",
  tight,
  error,
}: {
  id: string
  label: ReactNode
  Icon: LucideIcon
  children: ReactNode
  labelSuffix?: ReactNode
  fieldClassName?: string
  /** Narrow vertical spacing in two-column groups */
  tight?: boolean
  /** Shown under the field like `AddContactPanel` (`um_field_hint_error`). */
  error?: string
}) {
  const rowClass = tight
    ? "um_field add_contact_field_tight"
    : (fieldClassName || "um_field")
  return (
    <div className={rowClass}>
      <label htmlFor={id} className="um_field_label_row">
        <Icon className="um_field_label_icon" size={17} strokeWidth={1.75} aria-hidden />
        <span className="um_field_label_with_suffix">
          <span className="um_field_label_text">{label}</span>
          {labelSuffix}
        </span>
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="um_field_hint um_field_hint_error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
