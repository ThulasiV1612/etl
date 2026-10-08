import { useCallback, useLayoutEffect, useRef, useState } from "react"
import {
  formatUsPhoneDisplayFromNational,
  nationalTenDigitsFromRawInput,
  tryBackspaceNationalDigitFromCaret,
  tryDeleteNationalDigitFromCaret,
  usPhoneInlineMessage,
  type UsPhoneValidationMode,
} from "../phone/usPhoneNumber"
import "./us-phone-input.css"

export interface UsPhoneInputProps {
  id: string
  name?: string
  /** National digits only, 0–10 characters. */
  nationalDigits: string
  onNationalDigitsChange: (digits: string) => void
  disabled?: boolean
  readOnly?: boolean
  className?: string
  invalidClassName?: string
  autoComplete?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  /** Extra server / form error (shown after field messages). */
  error?: string | null
  placeholder?: string
  /**
   * `nanp` — strict area/exchange rules (contacts, signup).
   * `tenDigits` — any 10 digits after +1 mask (questionnaires).
   */
  validationMode?: UsPhoneValidationMode
}

export function UsPhoneInput({
  id,
  name,
  nationalDigits,
  onNationalDigitsChange,
  disabled,
  readOnly,
  className,
  invalidClassName,
  autoComplete = "tel",
  "aria-invalid": ariaInvalidProp,
  "aria-describedby": ariaDescribedBy,
  error: externalError,
  validationMode = "nanp",
  placeholder,
}: UsPhoneInputProps) {
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingCaretRef = useRef<number | null>(null)

  const display = formatUsPhoneDisplayFromNational(nationalDigits)
  const inline = usPhoneInlineMessage(nationalDigits, touched, validationMode)
  const showErr = inline || externalError
  const ariaInvalid = Boolean(ariaInvalidProp || showErr)

  const applyFromRaw = useCallback(
    (raw: string) => {
      const next = nationalTenDigitsFromRawInput(raw)
      onNationalDigitsChange(next)
    },
    [onNationalDigitsChange],
  )

  useLayoutEffect(() => {
    if (pendingCaretRef.current == null) return
    const el = inputRef.current
    if (!el) {
      pendingCaretRef.current = null
      return
    }
    const pos = pendingCaretRef.current
    pendingCaretRef.current = null
    const len = el.value.length
    const clamped = Math.max(0, Math.min(pos, len))
    el.setSelectionRange(clamped, clamped)
  }, [nationalDigits, display])

  return (
    <div className="us_phone_input_wrap">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        className={[className, ariaInvalid ? invalidClassName : ""]
          .filter(Boolean)
          .join(" ")}
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onBlur={() => setTouched(true)}
        onChange={(e) => applyFromRaw(e.target.value)}
        onPaste={(e) => {
          const t = e.clipboardData?.getData("text") ?? ""
          if (!t) return
          e.preventDefault()
          applyFromRaw(t)
        }}
        onKeyDown={(e) => {
          if (readOnly || disabled) return
          if (e.ctrlKey || e.metaKey || e.altKey) return

          if (e.key === "Backspace" || e.key === "Delete") {
            const el = e.currentTarget
            const start = el.selectionStart ?? 0
            const end = el.selectionEnd ?? 0
            if (start === end) {
              const res =
                e.key === "Backspace"
                  ? tryBackspaceNationalDigitFromCaret(
                      display,
                      nationalDigits,
                      start,
                    )
                  : tryDeleteNationalDigitFromCaret(
                      display,
                      nationalDigits,
                      start,
                    )
              if (res) {
                e.preventDefault()
                pendingCaretRef.current = res.caretAfterInDisplay
                onNationalDigitsChange(res.nationalDigits)
                return
              }
            }
          }

          if (
            e.key === "Backspace" ||
            e.key === "Delete" ||
            e.key === "Tab" ||
            e.key === "Escape" ||
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight" ||
            e.key === "Home" ||
            e.key === "End"
          ) {
            return
          }
          if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
            e.preventDefault()
          }
        }}
      />
      {showErr ? (
        <p className="us_phone_input_err" role="alert">
          {inline ?? externalError}
        </p>
      ) : null}
    </div>
  )
}
