import type { ReactNode } from "react"
import {
  FormTooltip,
  MandatoryFieldMark,
} from "../../../../../common/components/form-tooltip/FormTooltip"
import "./field-info-heading.css"

interface FieldInfoHeadingProps {
  /** Stable id for `aria-labelledby` on inputs / radiogroups */
  titleId: string
  label: string
  required?: boolean
  infoContent: ReactNode
}

export function FieldInfoHeading({
  titleId,
  label,
  required,
  infoContent,
}: FieldInfoHeadingProps) {
  return (
    <div className="field_info_heading">
      <div className="field_info_heading_row">
        <span id={titleId} className="field_info_heading_label">
          <span className="form_label_inline_row">
            <span>{label}</span>
            {required ? <MandatoryFieldMark /> : null}
          </span>
        </span>
        <FormTooltip
          label={`More information: ${label}`}
          content={<div className="field_info_tooltip_inner">{infoContent}</div>}
        />
      </div>
    </div>
  )
}

/** Info icon + tooltip only (e.g. contextual help next to a dropdown label). */
export function InfoIconPanel({
  ariaLabel,
  infoContent,
}: {
  ariaLabel: string
  infoContent: ReactNode
}) {
  return (
    <FormTooltip
      label={ariaLabel}
      content={<div className="field_info_tooltip_inner">{infoContent}</div>}
    />
  )
}
