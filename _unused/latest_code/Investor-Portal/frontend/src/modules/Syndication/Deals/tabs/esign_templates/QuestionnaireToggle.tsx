type QuestionnaireToggleProps = {
  checked: boolean
  onChange: (next: boolean) => void
  id: string
  labelId?: string
  disabled?: boolean
  ariaLabel?: string
  /** Smaller track — used for the Required switch on question cards. */
  compact?: boolean
}

export function QuestionnaireToggle({
  checked,
  onChange,
  id,
  labelId,
  disabled,
  ariaLabel,
  compact,
}: QuestionnaireToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`deal_fi_toggle${checked ? " deal_fi_toggle_on" : ""}${compact ? " deal_fi_toggle_compact" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="deal_fi_toggle_track" aria-hidden>
        <span className="deal_fi_toggle_thumb" />
      </span>
    </button>
  )
}
