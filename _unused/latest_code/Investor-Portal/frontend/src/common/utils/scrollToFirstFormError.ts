export interface ScrollToFirstFormErrorOptions {
  /** Scope search to this element (e.g. a `<form>`). Defaults to `document`. */
  container?: ParentNode | null
  /** Try this selector first (e.g. mapped from a validation message). */
  preferSelector?: string | null
}

const INVALID_CONTROL_SELECTOR = [
  '[aria-invalid="true"]',
  "input[aria-invalid='true']",
  "select[aria-invalid='true']",
  "textarea[aria-invalid='true']",
  "button.portal_dropdown_select_trigger[aria-invalid='true']",
  "button.portal_dropdown_select_trigger_invalid",
  "button[aria-haspopup='listbox'][aria-invalid='true']",
  "fieldset.invest_now_questionnaire_fieldset_invalid",
].join(", ")

function focusAndScroll(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLButtonElement
  ) {
    el.focus({ preventScroll: true })
  }
}

function findControlForError(errorEl: HTMLElement): HTMLElement | null {
  const label = errorEl.closest("label")
  if (label) {
    const inLabel = label.querySelector<HTMLElement>(
      "input, select, textarea, button.portal_dropdown_select_trigger, button[aria-haspopup='listbox']",
    )
    if (inLabel) return inLabel
  }

  const block = errorEl.closest(
    "fieldset, .deals_create_label, .deals_create_label_full, .deal_step_owning_block, [role='row']",
  )
  if (block) {
    const inBlock = block.querySelector<HTMLElement>(
      "input:not([type='hidden']), select, textarea, button.portal_dropdown_select_trigger, button[aria-haspopup='listbox']",
    )
    if (inBlock) return inBlock
  }

  const prev = errorEl.previousElementSibling
  if (prev instanceof HTMLElement) {
    if (
      prev.matches(
        "input, select, textarea, button.portal_dropdown_select_trigger, button[aria-haspopup='listbox']",
      )
    ) {
      return prev
    }
    const nested = prev.querySelector<HTMLElement>(
      "input, select, textarea, button.portal_dropdown_select_trigger, button[aria-haspopup='listbox']",
    )
    if (nested) return nested
  }

  return null
}

function resolveRoot(container?: ParentNode | null): ParentNode {
  return container ?? document
}

const MULTI_STEP_FORM_SCROLL_SELECTOR =
  ".deals_add_deal_asset_form_scroll, .deals_add_inv_modal_scroll, .deal_inv_ic_modal_form_grid"

const APP_MAIN_SCROLL_SELECTOR = ".app_main_section"

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth"
}

function scrollElementToTop(el: HTMLElement, behavior: ScrollBehavior): void {
  el.scrollTo({ top: 0, behavior })
}

function isVerticallyScrollable(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
    return false
  }
  return el.scrollHeight > el.clientHeight + 1
}

function isInsideModal(el: HTMLElement | null): boolean {
  return Boolean(el?.closest(".um_modal, [role='dialog']"))
}

/** Logged-in shell scrolls `.app_main_section`; modals scroll their own body. */
function scrollPageScrollContainersToTop(
  containerEl: HTMLElement | null,
  behavior: ScrollBehavior,
): void {
  if (isInsideModal(containerEl)) {
    const modalRoot =
      containerEl?.closest<HTMLElement>(".um_modal, [role='dialog']") ?? null
    const modalScroll =
      modalRoot?.querySelector<HTMLElement>(MULTI_STEP_FORM_SCROLL_SELECTOR) ??
      modalRoot?.querySelector<HTMLElement>(".um_modal_body")
    if (modalScroll) {
      scrollElementToTop(modalScroll, behavior)
    }
    return
  }

  const appMain = document.querySelector<HTMLElement>(APP_MAIN_SCROLL_SELECTOR)
  if (appMain) {
    scrollElementToTop(appMain, behavior)
    return
  }

  window.scrollTo({ top: 0, behavior })
  document.documentElement.scrollTo({ top: 0, behavior })
}

function scrollInnerFormScrollAreas(
  scope: ParentNode,
  behavior: ScrollBehavior,
): void {
  if (scope instanceof Document) {
    scope
      .querySelectorAll<HTMLElement>(MULTI_STEP_FORM_SCROLL_SELECTOR)
      .forEach((el) => {
        if (isVerticallyScrollable(el)) scrollElementToTop(el, behavior)
      })
    return
  }

  const el = scope as ParentNode
  if (el instanceof HTMLElement && el.matches(MULTI_STEP_FORM_SCROLL_SELECTOR)) {
    if (isVerticallyScrollable(el)) scrollElementToTop(el, behavior)
  }
  el.querySelectorAll<HTMLElement>(MULTI_STEP_FORM_SCROLL_SELECTOR).forEach(
    (inner) => {
      if (isVerticallyScrollable(inner)) scrollElementToTop(inner, behavior)
    },
  )
}

/** After advancing a multi-step form, show the top of the page (not mid-form). */
export function scrollMultiStepFormToTop(
  options?: ScrollToFirstFormErrorOptions | ParentNode | null,
): void {
  const opts: ScrollToFirstFormErrorOptions =
    options != null &&
    typeof options === "object" &&
    ("container" in options || "preferSelector" in options)
      ? (options as ScrollToFirstFormErrorOptions)
      : { container: options as ParentNode | null | undefined }

  const containerEl =
    opts.container instanceof HTMLElement ? opts.container : null
  const behavior = scrollBehavior()

  scrollPageScrollContainersToTop(containerEl, behavior)
  scrollInnerFormScrollAreas(containerEl ?? document, behavior)
}

/** Run after React renders the next step. */
export function scrollMultiStepFormToTopAfterUpdate(
  options?: ScrollToFirstFormErrorOptions | ParentNode | null,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollMultiStepFormToTop(options)
    })
  })
}

/**
 * Scroll to the first invalid control or field error inside `container`.
 * Returns true when a target was found.
 */
export function scrollToFirstFormError(
  options?: ScrollToFirstFormErrorOptions | ParentNode | null,
): boolean {
  const opts: ScrollToFirstFormErrorOptions =
    options != null &&
    typeof options === "object" &&
    ("container" in options || "preferSelector" in options)
      ? (options as ScrollToFirstFormErrorOptions)
      : { container: options as ParentNode | null | undefined }

  const root = resolveRoot(opts.container)

  if (opts.preferSelector?.trim()) {
    const preferred =
      root instanceof Document
        ? root.querySelector<HTMLElement>(opts.preferSelector)
        : (root as ParentNode).querySelector<HTMLElement>(opts.preferSelector)
    if (preferred) {
      focusAndScroll(preferred)
      return true
    }
  }

  const invalid =
    root instanceof Document
      ? root.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR)
      : (root as ParentNode).querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR)
  if (invalid) {
    focusAndScroll(invalid)
    return true
  }

  const errorEl =
    root instanceof Document
      ? root.querySelector<HTMLElement>(".deals_create_field_error")
      : (root as ParentNode).querySelector<HTMLElement>(".deals_create_field_error")
  if (errorEl) {
    const control = findControlForError(errorEl)
    if (control) {
      focusAndScroll(control)
      return true
    }
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" })
    return true
  }

  return false
}

/** Scroll the first validation banner into view inside `container`. */
export function scrollValidationAlertIntoView(
  container?: ParentNode | null,
): void {
  const root = resolveRoot(container)
  const alert = root.querySelector<HTMLElement>(
    ".um_msg_error, .um_modal_form_error",
  )
  alert?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** Run after React applies validation state from `setState`. */
export function focusFirstFormErrorAfterUpdate(
  options?: ScrollToFirstFormErrorOptions | ParentNode | null,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToFirstFormError(options)
    })
  })
}
