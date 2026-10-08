import { toast } from "../../../../common/components/Toast"
import {
  scrollMultiStepFormToTop,
  scrollToFirstFormError,
  scrollValidationAlertIntoView,
} from "../../../../common/utils/scrollToFirstFormError"

type InvestorClassPipelineStep = 1 | 2

export type InvestorClassFieldKey =
  | "classType"
  | "equityName"
  | "entityLegalOwnership"
  | "raiseOwnership"
  | "raiseDistributions"
  | "minimumInvestment"
  | "numberOfUnits"
  | "mezzPrefReturnType"
  | "mezzPrefReturnPct"
  | "mezzPrefAccruesOn"
  | "mezzDayCount"
  | "advInvestmentType"
  | "advDistributionShare"
  | "advWaitlist"

export type InvestorClassFieldErrors = Partial<
  Record<InvestorClassFieldKey, string>
>

const FIELD_HIGHLIGHT_CLASS = "deal_inv_ic_field_invalid"
const FIELD_HIGHLIGHT_ATTR = "data-inv-class-validation-error"

const ADVANCED_STEP_MESSAGES = new Set([
  "Investment type is required (Advanced).",
  "Entity legal ownership is required (Advanced).",
  "Distribution share is required (Advanced).",
  "Waitlist status is required (Advanced).",
  "Number of units is required.",
])

const MESSAGE_TO_FIELD: Record<string, InvestorClassFieldKey> = {
  "Class type is required.": "classType",
  "Equity class name is required.": "equityName",
  "Entity legal ownership is required.": "entityLegalOwnership",
  "Raise amount (for ownership) is required.": "raiseOwnership",
  "Raise amount (for distributions) is required.": "raiseDistributions",
  "Minimum investment is required.": "minimumInvestment",
  "Number of units is required.": "numberOfUnits",
  "Preferred return type is required.": "mezzPrefReturnType",
  "Preferred return is required.": "mezzPrefReturnPct",
  "Preferred return accrues on is required.": "mezzPrefAccruesOn",
  "Day count convention is required.": "mezzDayCount",
  "Investment type is required (Advanced).": "advInvestmentType",
  "Entity legal ownership is required (Advanced).": "entityLegalOwnership",
  "Distribution share is required (Advanced).": "advDistributionShare",
  "Waitlist status is required (Advanced).": "advWaitlist",
  "An investor class with this name already exists for this class type on this deal. Use a unique name or choose another class type.":
    "equityName",
  "Another investor class of this type already uses this name for this deal. Choose a unique name or another class type.":
    "equityName",
}

const FIELD_KEY_TO_ID_SUFFIX: Record<InvestorClassFieldKey, string> = {
  classType: "class-type",
  equityName: "equity-name",
  entityLegalOwnership: "adv-entity-own",
  raiseOwnership: "raise-own",
  raiseDistributions: "raise-dist",
  minimumInvestment: "min-inv",
  numberOfUnits: "adv-nou",
  mezzPrefReturnType: "mezz-pref-return",
  mezzPrefReturnPct: "mezz-pref-return-pct",
  mezzPrefAccruesOn: "mezz-pref-accrues",
  mezzDayCount: "mezz-day-count",
  advInvestmentType: "adv-inv-type",
  advDistributionShare: "adv-dist-share",
  advWaitlist: "adv-waitlist",
}

function resolveRoot(container?: ParentNode | null): ParentNode {
  return container ?? document
}

function queryField(
  root: ParentNode,
  preferSelector: string,
): HTMLElement | null {
  const scoped = root.querySelector<HTMLElement>(preferSelector)
  if (scoped) return scoped
  if (preferSelector.startsWith("#") && typeof document !== "undefined") {
    return document.querySelector<HTMLElement>(preferSelector)
  }
  return null
}

/** Map validation copy to a stable field key for inline errors. */
export function investorClassValidationMessageToFieldKey(
  message: string,
): InvestorClassFieldKey | null {
  if (MESSAGE_TO_FIELD[message]) return MESSAGE_TO_FIELD[message]
  if (message.includes("legal ownership")) return "entityLegalOwnership"
  if (message.includes("distribution share")) return "advDistributionShare"
  if (
    message.includes("already exists") ||
    message.includes("already uses this name")
  ) {
    return "equityName"
  }
  return null
}

export function buildInvestorClassFieldErrorsFromMessage(
  message: string,
): InvestorClassFieldErrors {
  const key = investorClassValidationMessageToFieldKey(message)
  return key ? { [key]: message } : {}
}

export function investorClassFieldKeyToSelector(
  idPrefix: string,
  key: InvestorClassFieldKey,
): string {
  return `#${idPrefix}-${FIELD_KEY_TO_ID_SUFFIX[key]}`
}

/** Map validation copy to stable field ids (`InvestorClassModalFormBody` idPrefix). */
export function investorClassErrorPreferSelector(
  message: string,
  idPrefix: string,
): string | null {
  const fieldKey = investorClassValidationMessageToFieldKey(message)
  if (fieldKey) return investorClassFieldKeyToSelector(idPrefix, fieldKey)
  return null
}

/** Pipeline step that contains the field for this validation message. */
export function investorClassErrorPipelineStep(
  message: string,
): InvestorClassPipelineStep {
  if (ADVANCED_STEP_MESSAGES.has(message)) return 2
  if (message.includes("legal ownership") || message.includes("distribution share")) {
    return 2
  }
  return 1
}

export interface InvestorClassValidationFocusOptions {
  container: HTMLElement | null | undefined
  message: string
  idPrefix: string
  pipelineStep?: InvestorClassPipelineStep
  onPipelineStepChange?: (step: InvestorClassPipelineStep) => void
  /** When true, switch pipeline step before scrolling (add/edit full-page flows). */
  usePipeline?: boolean
  /** When false, skip toast (inline error only). Default true. */
  showToast?: boolean
}

export interface InvestorClassValidationHandlers {
  setFieldErrors: (errors: InvestorClassFieldErrors) => void
  setFormError: (message: string | null) => void
  formRef: { current: HTMLFormElement | null }
  idPrefix: string
  pipelineStep?: InvestorClassPipelineStep
  onPipelineStepChange?: (step: InvestorClassPipelineStep) => void
  usePipeline?: boolean
}

/** Inline field errors + scroll; no toast or modal. */
export function handleInvestorClassValidationError(
  message: string,
  handlers: InvestorClassValidationHandlers,
): void {
  const targetStep = investorClassErrorPipelineStep(message)
  const needsStepChange =
    handlers.usePipeline &&
    handlers.onPipelineStepChange != null &&
    handlers.pipelineStep != null &&
    handlers.pipelineStep !== targetStep

  const applyState = () => {
    const fieldErrors = buildInvestorClassFieldErrorsFromMessage(message)
    if (Object.keys(fieldErrors).length > 0) {
      handlers.setFieldErrors(fieldErrors)
      handlers.setFormError(null)
    } else {
      handlers.setFieldErrors({})
      handlers.setFormError(message)
    }
  }

  const runFocus = () => {
    focusInvestorClassFormErrorWithPipeline({
      container: handlers.formRef.current,
      message,
      idPrefix: handlers.idPrefix,
      pipelineStep: targetStep,
      onPipelineStepChange: handlers.onPipelineStepChange,
      usePipeline: handlers.usePipeline,
      showToast: false,
    })
  }

  if (needsStepChange) {
    handlers.onPipelineStepChange!(targetStep)
    window.setTimeout(() => {
      applyState()
      runFocus()
    }, 50)
    return
  }

  applyState()
  runFocus()
}

export function clearInvestorClassFormFieldHighlights(
  container: ParentNode | null | undefined,
): void {
  const root = resolveRoot(container)
  root.querySelectorAll<HTMLElement>(`[${FIELD_HIGHLIGHT_ATTR}="true"]`).forEach((el) => {
    el.removeAttribute(FIELD_HIGHLIGHT_ATTR)
    el.removeAttribute("aria-invalid")
    el.classList.remove(FIELD_HIGHLIGHT_CLASS)
  })
}

function highlightInvestorClassFormField(el: HTMLElement): void {
  const details = el.closest("details")
  if (details && !details.open) details.open = true
  el.setAttribute(FIELD_HIGHLIGHT_ATTR, "true")
  el.setAttribute("aria-invalid", "true")
  el.classList.add(FIELD_HIGHLIGHT_CLASS)
}

function scrollInvestorClassFormToTop(
  container: ParentNode | null | undefined,
): void {
  scrollMultiStepFormToTop({ container })
}

export function isInvestorClassAllocationValidationMessage(
  message: string,
): boolean {
  return (
    message.includes("legal ownership") || message.includes("distribution share")
  )
}

export function investorClassValidationErrorTitle(message: string): string {
  if (isInvestorClassAllocationValidationMessage(message)) {
    return "Allocation exceeds 100%"
  }
  if (message.includes("(Advanced)")) return "Advanced fields required"
  return "Cannot save investor class"
}

function runInvestorClassFormErrorFocus(
  opts: InvestorClassValidationFocusOptions,
): void {
  const inlineFieldError =
    investorClassValidationMessageToFieldKey(opts.message) != null

  clearInvestorClassFormFieldHighlights(opts.container)
  if (!inlineFieldError) {
    scrollInvestorClassFormToTop(opts.container)
    scrollValidationAlertIntoView(opts.container)
  }

  const preferSelector = investorClassErrorPreferSelector(
    opts.message,
    opts.idPrefix,
  )
  const root = resolveRoot(opts.container)

  if (preferSelector) {
    const preferred = queryField(root, preferSelector)
    if (preferred) {
      highlightInvestorClassFormField(preferred)
    }
  }

  const scrolled = scrollToFirstFormError({
    container: opts.container,
    preferSelector,
  })

  if (preferSelector && !scrolled) {
    const preferred = queryField(root, preferSelector)
    if (preferred) {
      highlightInvestorClassFormField(preferred)
      preferred.scrollIntoView({ behavior: "smooth", block: "center" })
      if (
        preferred instanceof HTMLInputElement ||
        preferred instanceof HTMLSelectElement ||
        preferred instanceof HTMLTextAreaElement
      ) {
        preferred.focus({ preventScroll: true })
      }
    }
  }

  if (!scrolled && !inlineFieldError) {
    scrollValidationAlertIntoView(opts.container)
  }
}

export function focusInvestorClassFormError(
  container: HTMLElement | null | undefined,
  message: string,
  idPrefix: string,
): void {
  presentInvestorClassFormValidationError({
    container,
    message,
    idPrefix,
    showToast: false,
  })
}

/** Scroll to the matching field (opens Advanced, switches pipeline step). */
export function presentInvestorClassFormValidationError(
  opts: InvestorClassValidationFocusOptions,
): void {
  const inlineFieldError =
    investorClassValidationMessageToFieldKey(opts.message) != null
  if (
    opts.showToast !== false &&
    !inlineFieldError &&
    !isInvestorClassAllocationValidationMessage(opts.message)
  ) {
    toast.error(
      investorClassValidationErrorTitle(opts.message),
      opts.message,
      10_000,
    )
  }
  focusInvestorClassFormErrorWithPipeline(opts)
}

/** Show validation error and scroll to the matching field (opens Advanced, switches pipeline step). */
export function focusInvestorClassFormErrorWithPipeline(
  opts: InvestorClassValidationFocusOptions,
): void {
  const targetStep = investorClassErrorPipelineStep(opts.message)
  const needsStepChange =
    opts.usePipeline &&
    opts.onPipelineStepChange != null &&
    opts.pipelineStep != null &&
    opts.pipelineStep !== targetStep

  const run = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runInvestorClassFormErrorFocus(opts)
      })
    })
  }

  if (needsStepChange) {
    opts.onPipelineStepChange!(targetStep)
    window.setTimeout(run, 50)
    return
  }
  run()
}
