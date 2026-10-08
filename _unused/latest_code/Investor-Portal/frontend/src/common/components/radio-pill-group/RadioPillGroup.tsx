import "./radio-pill-group.css"

export interface RadioPillOption<T extends string = string> {
  value: T
  label: string
}

interface RadioPillGroupProps<T extends string> {
  /** Shared `name` for the radio group */
  name: string
  /** Selected value, or empty string when none */
  value: T | ""
  options: readonly RadioPillOption<T>[]
  onChange: (value: T) => void
  /** `aria-labelledby` on the radiogroup (e.g. FieldInfoHeading title id) */
  ariaLabelledBy?: string
  className?: string
}

/**
 * Pill-style radio group: hidden native input + `.radio-btn` span (input must precede span for `:checked + .radio-btn`).
 * Each option is a `<label>` wrapping `<input type="radio" />` and `<span class="radio-btn">`.
 */
export function RadioPillGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  ariaLabelledBy,
  className,
}: RadioPillGroupProps<T>) {
  const groupClass = ["radio-group", options.length === 2 ? "radio-group_binary" : "", className]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      className={groupClass}
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
    >
      {options.map((opt) => (
        <label key={String(opt.value)} className="radio-pill-label">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            onClick={() => {
              if (value === opt.value) onChange(opt.value)
            }}
          />
          <span className="radio-btn">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}
