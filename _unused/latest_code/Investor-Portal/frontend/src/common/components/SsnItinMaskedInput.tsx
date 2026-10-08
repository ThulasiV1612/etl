import { Eye, EyeOff } from "lucide-react"
import { useState, type InputHTMLAttributes } from "react"
import {
  formatSsnItinInput,
  maskSsnItinLast4,
} from "@/common/tax/usSsnItin"
import "./ssn-itin-masked-input.css"

export interface SsnItinMaskedInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "inputMode" | "autoComplete" | "maxLength"
  > {
  /** Formatted or raw SSN / ITIN (full value kept in parent state). */
  value: string
  onValueChange: (formatted: string) => void
  /** When true, full SSN is shown even while blurred. */
  revealed?: boolean
  onRevealedChange?: (revealed: boolean) => void
  /**
   * Show eye toggle so the investor can view the full SSN while editing.
   * Default true for investor-facing forms.
   */
  showToggle?: boolean
  /**
   * When false, value stays masked and cannot be revealed (sponsor view).
   * Default true.
   */
  allowReveal?: boolean
  wrapClassName?: string
  toggleClassName?: string
  revealLabel?: string
  hideLabel?: string
}

/**
 * SSN / ITIN input that masks all but the last 4 digits when blurred
 * (and when the optional reveal toggle is off). Full value stays in parent state.
 */
export function SsnItinMaskedInput({
  value,
  onValueChange,
  revealed: revealedProp,
  onRevealedChange,
  showToggle = true,
  allowReveal = true,
  wrapClassName = "ssn_itin_input_wrap",
  toggleClassName = "ssn_itin_toggle",
  revealLabel = "Show SSN",
  hideLabel = "Hide SSN",
  className,
  onFocus,
  onBlur,
  disabled,
  id,
  readOnly,
  ...rest
}: SsnItinMaskedInputProps) {
  const [focused, setFocused] = useState(false)
  const [internalRevealed, setInternalRevealed] = useState(false)
  const revealed = allowReveal && (revealedProp ?? internalRevealed)
  const setRevealed = onRevealedChange ?? setInternalRevealed
  const showFull = Boolean(allowReveal && (revealed || focused))
  const display = showFull ? formatSsnItinInput(value) : maskSsnItinLast4(value)
  const canToggle = showToggle && allowReveal

  const input = (
    <input
      {...rest}
      id={id}
      type="text"
      className={className}
      value={display}
      disabled={disabled}
      readOnly={readOnly || !allowReveal}
      inputMode="numeric"
      autoComplete="off"
      maxLength={11}
      spellCheck={false}
      onFocus={(e) => {
        if (!allowReveal) return
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
      onChange={(e) => {
        if (!showFull || !allowReveal) return
        onValueChange(formatSsnItinInput(e.target.value))
      }}
    />
  )

  if (!canToggle) return input

  return (
    <div className={wrapClassName}>
      {input}
      <button
        type="button"
        className={toggleClassName}
        disabled={disabled}
        onClick={() => setRevealed(!revealed)}
        aria-label={revealed ? hideLabel : revealLabel}
        aria-pressed={revealed}
      >
        {revealed ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  )
}
