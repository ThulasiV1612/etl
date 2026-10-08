import { CheckCircle2, MailCheck, MailX, XCircle } from "lucide-react"
import { CardRadioGroup } from "../CardRadioGroup/CardRadioGroup"
import "../CardRadioGroup/card_radio_group.css"

export type YesNoValue = "yes" | "no" | ""

/** True when a two-option list is exactly Yes and No (any casing). */
export function isYesNoOptionPair(options: readonly string[]): boolean {
  if (options.length !== 2) return false
  const norm = new Set(options.map((o) => o.trim().toLowerCase()))
  return norm.has("yes") && norm.has("no")
}

export function yesNoValueFromStoredOption(
  raw: string,
  options: readonly string[],
): YesNoValue {
  if (raw === "yes" || raw === "no") return raw
  const yesOption = options.find((o) => o.trim().toLowerCase() === "yes")
  const noOption = options.find((o) => o.trim().toLowerCase() === "no")
  if (yesOption && raw === yesOption) return "yes"
  if (noOption && raw === noOption) return "no"
  return ""
}

export function parseYesNoFieldValue(raw: string): YesNoValue {
  return raw === "yes" || raw === "no" ? raw : ""
}

export function storedOptionFromYesNoValue(
  value: "yes" | "no",
  options: readonly string[],
): string {
  return options.find((o) => o.trim().toLowerCase() === value) ?? value
}

type YesNoCardRadioGroupProps = {
  name: string
  value: YesNoValue
  onChange: (value: "yes" | "no") => void
  /** Override default “Yes” label. */
  yesLabel?: string
  /** Override default “No” label. */
  noLabel?: string
  /** Shows “(Standard)” on the Yes option — matches deal create defaults. */
  yesIsCommon?: boolean
  /** Shows “(Standard)” on the No option. */
  noIsCommon?: boolean
  disabled?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  className?: string
  /** Mail icons for invitation / notification prompts. */
  variant?: "default" | "mail"
}

export function YesNoCardRadioGroup({
  name,
  value,
  onChange,
  yesLabel: yesLabelProp,
  noLabel: noLabelProp,
  yesIsCommon = false,
  noIsCommon = false,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  className,
  variant = "default",
}: YesNoCardRadioGroupProps) {
  const yesLabel =
    yesLabelProp ?? (yesIsCommon ? "Yes (Standard)" : "Yes")
  const noLabel = noLabelProp ?? (noIsCommon ? "No (Standard)" : "No")
  const YesIcon = variant === "mail" ? MailCheck : CheckCircle2
  const NoIcon = variant === "mail" ? MailX : XCircle

  return (
    <div
      className={["portal_yesno_radio_group", className].filter(Boolean).join(" ")}
      aria-describedby={ariaDescribedBy}
    >
      <CardRadioGroup
        name={name}
        value={value}
        onChange={(v) => onChange(v as "yes" | "no")}
        ariaLabel={ariaLabel}
        ariaLabelledBy={ariaLabelledBy}
        disabled={disabled}
        options={[
          { value: "yes", label: yesLabel, icon: YesIcon },
          { value: "no", label: noLabel, icon: NoIcon },
        ]}
      />
    </div>
  )
}
