  /** U.S. 10-digit NANP — display +1 (AAA) EEE-NNNN, storage E.164 +1AAAEEENNNN */

  const NANP_LEN = 10

  /**
   * Indices in `display` whose characters match `nationalDigits` in order.
   * Only scans after the literal "+1 (" — the `1` in "+1" is display-only and must
   * not match national digit `1` (that caused wrong deletes / "111" glitches).
   */
  export function nationalDigitDisplayIndices(
    display: string,
    nationalDigits: string,
  ): number[] {
    const nat = nationalTenDigitsFromRawInput(nationalDigits)
    if (!nat.length) return []
    const afterPrefix = "+1 ("
    let scanStart = 0
    if (display.startsWith(afterPrefix)) {
      scanStart = afterPrefix.length
    } else if (display.startsWith("+1 ")) {
      return []
    } else {
      const open = display.indexOf("(")
      scanStart = open >= 0 ? open + 1 : display.length
    }
    const out: number[] = []
    let ni = 0
    for (let di = scanStart; di < display.length && ni < nat.length; di++) {
      const c = display[di]
      if (c >= "0" && c <= "9" && c === nat[ni]) {
        out.push(di)
        ni++
      }
    }
    return out
  }

  export interface NationalPhoneCaretEditResult {
    nationalDigits: string
    caretAfterInDisplay: number
  }

  /**
   * Backspace when the character before the caret is punctuation: remove the
   * previous NANP digit so state updates (stripping-only onChange would leave
   * digits unchanged).
   */
  export function tryBackspaceNationalDigitFromCaret(
    display: string,
    nationalDigits: string,
    caret: number,
  ): NationalPhoneCaretEditResult | null {
    if (caret <= 0) return null
    const ch = display[caret - 1]
    if (ch >= "0" && ch <= "9") return null
    const nat = nationalTenDigitsFromRawInput(nationalDigits)
    if (!nat.length) return null
    const indices = nationalDigitDisplayIndices(display, nat)
    let removeIdx = -1
    for (let i = indices.length - 1; i >= 0; i--) {
      if (indices[i] < caret) {
        removeIdx = i
        break
      }
    }
    if (removeIdx < 0) return null
    const nextNat = nat.slice(0, removeIdx) + nat.slice(removeIdx + 1)
    const newDisplay = formatUsPhoneDisplayFromNational(nextNat)
    const newIndices = nationalDigitDisplayIndices(newDisplay, nextNat)
    const caretAfterInDisplay =
      removeIdx < newIndices.length ? newIndices[removeIdx] : newDisplay.length
    return { nationalDigits: nextNat, caretAfterInDisplay }
  }

  /** Forward-delete on a punctuation character: remove the NANP digit at/after the caret. */
  export function tryDeleteNationalDigitFromCaret(
    display: string,
    nationalDigits: string,
    caret: number,
  ): NationalPhoneCaretEditResult | null {
    if (caret >= display.length) return null
    const ch = display[caret]
    if (ch >= "0" && ch <= "9") return null
    const nat = nationalTenDigitsFromRawInput(nationalDigits)
    if (!nat.length) return null
    const indices = nationalDigitDisplayIndices(display, nat)
    let removeIdx = -1
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] >= caret) {
        removeIdx = i
        break
      }
    }
    if (removeIdx < 0) return null
    const nextNat = nat.slice(0, removeIdx) + nat.slice(removeIdx + 1)
    const newDisplay = formatUsPhoneDisplayFromNational(nextNat)
    const newIndices = nationalDigitDisplayIndices(newDisplay, nextNat)
    const caretAfterInDisplay =
      removeIdx < newIndices.length ? newIndices[removeIdx] : newDisplay.length
    return { nationalDigits: nextNat, caretAfterInDisplay }
  }

  /**
   * Masked values look like "+1 (415) …" — stripping every digit from the whole
   * string treats the country-code `1` in "+1" as the first NANP digit (e.g. "4"
   * becomes "14"), which corrupts formatting and breaks backspace/caret mapping.
   * Prefer digits only after the "+1 (" label; fall back for "+1…" before "(" appears.
   */
  function digitSourceForNationalParsing(raw: string): string {
    const s = String(raw ?? "")
    const afterNanpOpen = "+1 ("
    const j = s.indexOf(afterNanpOpen)
    if (j >= 0) return s.slice(j + afterNanpOpen.length)
    const trimmed = s.trimStart()
    if (!trimmed.startsWith("+1")) return s
    const k = s.indexOf("+1")
    const after = s.slice(k + 2)
    const p = after.indexOf("(")
    if (p >= 0) return after.slice(p + 1)
    return after.replace(/^\s+/, "")
  }

  export function nationalTenDigitsFromRawInput(raw: string): string {
    const src = digitSourceForNationalParsing(raw)
    let d = src.replace(/\D/g, "")
    if (d.length > NANP_LEN) {
      // Prefer dropping a leading country-code 1 over keeping the first 10 digits.
      if (d.startsWith("1")) d = d.slice(-NANP_LEN)
      else d = d.slice(0, NANP_LEN)
    }
    return d
  }

  /** Ten numeric digits — used where US display format is enough (e.g. questionnaires). */
  export function isValidUsPhoneTenDigits(d: string): boolean {
    return /^\d{10}$/.test(nationalTenDigitsFromRawInput(d))
  }

  export function isValidUsNanp10(d: string): boolean {
    if (!/^\d{10}$/.test(d)) return false
    if (d[0] === "0" || d[0] === "1") return false
    if (d[3] === "0" || d[3] === "1") return false
    return true
  }

  /** Display: +1 (415) 555-2671 (partial while typing). */
  export function formatUsPhoneDisplayFromNational(nationalUpTo10: string): string {
    const d = nationalTenDigitsFromRawInput(nationalUpTo10)
    if (d.length === 0) return "+1 "
    const a = d.slice(0, 3)
    if (d.length <= 3) return `+1 (${a}${d.length === 3 ? ") " : ""}`
    const b = d.slice(3, 6)
    if (d.length <= 6) return `+1 (${a}) ${b}${d.length === 6 ? "-" : ""}`
    const c = d.slice(6, 10)
    return `+1 (${a}) ${b}-${c}`
  }

  export function national10ToE164(national10: string): string | null {
    const d = nationalTenDigitsFromRawInput(national10)
    if (!isValidUsNanp10(d)) return null
    return `+1${d}`
  }

  /** Load server/session value into national digits for the input (max 10). */
  export function nationalDigitsFromStoredPhone(stored: string): string {
    return nationalTenDigitsFromRawInput(stored)
  }

  /**
   * Read-only UI: stored E.164, digits, or masked input → `+1 (AAA) EEE-NNNN`
   * (same mask as {@link UsPhoneInput}), or em dash when empty / no digits.
   */
  export function formatUsPhoneStoredForUi(stored: unknown): string {
    if (stored === null || stored === undefined) return "—"
    const raw = String(stored).trim()
    if (!raw) return "—"
    const nat = nationalDigitsFromStoredPhone(raw)
    if (!nat.length) return "—"
    return formatUsPhoneDisplayFromNational(nat)
  }

  export type UsPhoneValidationMode = "nanp" | "tenDigits"

  export type UsPhoneInlineStatus = "ok" | "incomplete" | "invalid"

  function isPhoneCompleteForMode(
    d: string,
    mode: UsPhoneValidationMode,
  ): boolean {
    if (mode === "tenDigits") return isValidUsPhoneTenDigits(d)
    return isValidUsNanp10(d)
  }

  export function usPhoneInlineStatus(
    nationalDigits: string,
    mode: UsPhoneValidationMode = "nanp",
  ): UsPhoneInlineStatus {
    const d = nationalTenDigitsFromRawInput(nationalDigits)
    if (d.length === 0) return "ok"
    if (d.length < NANP_LEN) return "incomplete"
    if (!isPhoneCompleteForMode(d, mode)) return "invalid"
    return "ok"
  }

  export function usPhoneInlineMessage(
    nationalDigits: string,
    touched: boolean,
    mode: UsPhoneValidationMode = "nanp",
  ): string | null {
    const d = nationalTenDigitsFromRawInput(nationalDigits)
    if (d.length === 0) return null
    if (d.length < NANP_LEN) {
      if (!touched) return null
      return "Enter a complete 10-digit U.S. phone number."
    }
    if (!isPhoneCompleteForMode(d, mode))
      return "That is not a valid U.S. area code or exchange."
    return null
  }
