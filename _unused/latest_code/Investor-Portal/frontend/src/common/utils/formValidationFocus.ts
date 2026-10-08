import {
  focusFirstFormErrorAfterUpdate,
  scrollToFirstFormError,
} from "./scrollToFirstFormError"

export const FORM_FIELD_INVALID_ATTR = "data-form-field-invalid"

function escapeCssIdent(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

export function questionnaireFieldSelector(questionId: string): string {
  const id = questionId.trim()
  if (!id) return ""
  return `#invest-now-q-field-${escapeCssIdent(id)}`
}

export function clearFormValidationHighlights(
  container?: ParentNode | null,
): void {
  const root = container ?? document
  root
    .querySelectorAll<HTMLElement>(`[${FORM_FIELD_INVALID_ATTR}="true"]`)
    .forEach((el) => {
      el.removeAttribute(FORM_FIELD_INVALID_ATTR)
      el.removeAttribute("aria-invalid")
      el.classList.remove("um_field_input_invalid", "portal_form_field_invalid")
    })
  root
    .querySelectorAll<HTMLElement>(".invest_now_questionnaire_fieldset_invalid")
    .forEach((el) => {
      el.classList.remove("invest_now_questionnaire_fieldset_invalid")
      el.removeAttribute("aria-invalid")
    })
}

export function markFormFieldInvalid(el: HTMLElement): void {
  const details = el.closest("details")
  if (details && !details.open) details.open = true

  if (el.matches("fieldset.invest_now_questionnaire_fieldset")) {
    el.setAttribute("aria-invalid", "true")
    el.classList.add("invest_now_questionnaire_fieldset_invalid")
    const firstControl = el.querySelector<HTMLElement>(
      "input, select, textarea, button.portal_dropdown_select_trigger",
    )
    if (firstControl) {
      firstControl.setAttribute(FORM_FIELD_INVALID_ATTR, "true")
      firstControl.setAttribute("aria-invalid", "true")
    }
    return
  }

  el.setAttribute(FORM_FIELD_INVALID_ATTR, "true")
  el.setAttribute("aria-invalid", "true")
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    el.classList.add("um_field_input_invalid", "portal_form_field_invalid")
  }
  if (el.matches("button.portal_dropdown_select_trigger")) {
    el.classList.add("portal_form_field_invalid")
  }
}

export interface PresentFormValidationErrorOptions {
  container?: ParentNode | null
  message: string
  preferSelector?: string | null
}

/**
 * Highlights the first invalid control and scrolls it into view (not the top banner).
 * Call after `setState` for field-level `aria-invalid` props, or rely on `preferSelector` + DOM mark.
 */
export function presentFormValidationError(
  options: PresentFormValidationErrorOptions,
): void {
  const { container, message, preferSelector } = options
  clearFormValidationHighlights(container)

  const root = container ?? document
  const selector =
    preferSelector?.trim() ||
    addInvestmentValidationPreferSelector(message) ||
    lpInvestorValidationPreferSelector(message) ||
    investNowValidationPreferSelector(message)

  if (selector) {
    const preferred =
      root instanceof Document
        ? root.querySelector<HTMLElement>(selector)
        : (root as ParentNode).querySelector<HTMLElement>(selector)
    if (preferred) markFormFieldInvalid(preferred)
  }

  focusFirstFormErrorAfterUpdate({ container, preferSelector: selector })
}

export function addInvestmentValidationPreferSelector(
  message: string,
): string | null {
  const m = message.trim()
  if (!m) return null
  if (m.startsWith("Select an offering")) return "#add-inv-offering"
  if (m.includes("Select an investor") || m.includes("Select a member"))
    return "#add-inv-member"
  if (m.includes("investor class")) return "#add-inv-class"
  if (m.includes("percent of class (ownership)"))
    return "#add-inv-pct-ownership"
  if (m.includes("percent of class (distributions)"))
    return "#add-inv-pct-distributions"
  if (m.includes("commitment amount")) return "#add-inv-commitment"
  if (m.includes("investor profile")) return "#add-inv-profile"
  if (m.includes("Lead Sponsor") || m.includes("role")) return "#add-inv-role"
  return null
}

export function lpInvestorValidationPreferSelector(
  message: string,
): string | null {
  const m = message.trim()
  if (!m) return null
  if (m.includes("Select an investor") || m.includes("already on this deal"))
    return "#lp-inv-member"
  if (m.includes("investor class")) return "#lp-inv-class"
  if (m.includes("percent of class (ownership)"))
    return "#lp-inv-pct-ownership"
  if (m.includes("percent of class (distributions)"))
    return "#lp-inv-pct-distributions"
  if (m.includes("investor profile")) return "#lp-inv-profile"
  return null
}

export function investNowValidationPreferSelector(message: string): string | null {
  const m = message.trim()
  if (!m) return null
  if (m.includes("investment amount") || m.includes("amount greater"))
    return "#invest-now-amount"
  if (m.includes("funding method")) return "#invest-now-funding-method"
  if (
    m.includes("profile") ||
    m.includes("Sponsor information") ||
    m.includes("investment class is not configured")
  ) {
    return "#invest-now-profile"
  }
  const completeMatch = /^Complete required field:\s*(.+)$/i.exec(m)
  if (completeMatch) {
    return null
  }
  if (m.startsWith("Complete required field:")) return null
  return null
}

export function resolveQuestionIdFromQuestionnaireMessage(
  message: string,
  config: {
    questions: { id: string; label: string }[]
  } | null | undefined,
): string | null {
  if (!config) return null
  const completeMatch = /^Complete required field:\s*(.+)$/i.exec(message.trim())
  if (completeMatch) {
    const label = completeMatch[1].trim().toLowerCase()
    const q = config.questions.find(
      (row) => row.label.trim().toLowerCase() === label,
    )
    return q?.id ?? null
  }
  const labelPrefix = message.split(":")[0]?.trim()
  if (!labelPrefix) return null
  const q = config.questions.find((row) =>
    message.includes(row.label),
  )
  return q?.id ?? null
}

export function presentQuestionnaireValidationError(options: {
  container?: ParentNode | null
  message: string
  questionId?: string | null
}): void {
  const preferSelector = options.questionId
    ? questionnaireFieldSelector(options.questionId)
    : null
  presentFormValidationError({
    container: options.container,
    message: options.message,
    preferSelector,
  })
}

export function scrollToFirstInvalidField(
  container?: ParentNode | null,
): boolean {
  return scrollToFirstFormError({ container })
}
