import type { LucideIcon } from "lucide-react"
import type { ElementType, ReactNode } from "react"
import { FormTooltip } from "../form-tooltip/FormTooltip"
import "./form-heading-with-info.css"

export type FormHeadingWithInfoProps = {
  as?: ElementType
  id?: string
  className?: string
  title: ReactNode
  info?: ReactNode
  infoLabel?: string
  leadingIcon?: LucideIcon
  leadingIconClassName?: string
  /** Use inside another button (e.g. accordion triggers). */
  nativeButtonTrigger?: boolean
  openOnHover?: boolean
}

export function FormHeadingWithInfo({
  as: Tag = "h3",
  id,
  className = "",
  title,
  info,
  infoLabel,
  leadingIcon: LeadingIcon,
  leadingIconClassName = "form_heading_with_info_leading_icon",
  nativeButtonTrigger = true,
  openOnHover = true,
}: FormHeadingWithInfoProps) {
  const labelText = typeof title === "string" ? title : "this section"

  return (
    <Tag
      id={id}
      className={["form_heading_with_info", className].filter(Boolean).join(" ")}
    >
      <span className="form_heading_with_info_row">
        {LeadingIcon ? (
          <LeadingIcon
            className={leadingIconClassName}
            size={20}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
        <span className="form_heading_with_info_text">{title}</span>
        {info ? (
          <FormTooltip
            label={infoLabel ?? `More information: ${labelText}`}
            content={<div className="form_heading_with_info_tooltip_inner">{info}</div>}
            panelAlign="start"
            nativeButtonTrigger={nativeButtonTrigger}
            openOnHover={openOnHover}
          />
        ) : null}
      </span>
    </Tag>
  )
}
