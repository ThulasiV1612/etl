import { ChevronDown, Plus } from "lucide-react"
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import "./dropdown-select.css"

function isAddActionLabel(label: string): boolean {
  const trimmed = label.trim()
  return /^(\+\s*)?Add\b/i.test(trimmed)
}

function dropdownActionLabelText(label: string): string {
  return label.trim().replace(/^\+\s*/, "")
}

function DropdownActionLabel({ label }: { label: string }) {
  if (!isAddActionLabel(label)) return label
  return (
    <>
      <Plus size={16} strokeWidth={2} aria-hidden />
      {dropdownActionLabelText(label)}
    </>
  )
}

export interface DropdownSelectOption {
  /** Plain text: trigger label, search, and accessibility when `labelContent` is used in the panel. */
  label: string
  value: string
  disabled?: boolean
  /**
   * Optional rich label in the listbox only. The trigger continues to use `label`.
   * Search/filter still uses `label`.
   */
  labelContent?: ReactNode
}

export interface DropdownSelectSection {
  heading: string
  options: DropdownSelectOption[]
}

export interface DropdownSelectFooterAction {
  label: string
  onClick: () => void
}

export interface DropdownSelectProps {
  options?: DropdownSelectOption[]
  sections?: DropdownSelectSection[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  header?: DropdownSelectFooterAction
  footer?: DropdownSelectFooterAction
  disabled?: boolean
  id?: string
  name?: string
  ariaLabel?: string
  ariaDescribedBy?: string
  className?: string
  triggerClassName?: string
  /** Applied to the listbox `<ul>` (use for themed option rows when panel is portaled). */
  panelClassName?: string
  /** When true, listbox is portaled to `document.body` with fixed position (avoids overflow clipping). */
  useFixedPanel?: boolean
  /** Visual error state (e.g. validation). */
  invalid?: boolean
  /** Rich trigger content; `displayLabel` still comes from the selected option `label`. */
  triggerContent?: ReactNode
  /** Show a filter field above options (long lists). Uses flat option list; section headings are omitted while active. */
  searchable?: boolean
  searchPlaceholder?: string
  searchAriaLabel?: string
  /**
   * When `searchable`, append counts to the search field: `(N)` when the filter is empty
   * (total selectable options), and `(M of N)` while filtering. Counts exclude placeholder
   * rows (`value=""`) and disabled options.
   */
  searchShowOptionCountHint?: boolean
}

export function DropdownSelect({
  options = [],
  sections,
  value,
  onChange,
  placeholder = "Select…",
  header,
  footer,
  disabled = false,
  id: idProp,
  name,
  ariaLabel,
  ariaDescribedBy,
  className,
  triggerClassName,
  panelClassName,
  useFixedPanel = false,
  invalid = false,
  triggerContent,
  searchable = false,
  searchPlaceholder = "Search…",
  searchAriaLabel,
  searchShowOptionCountHint = false,
}: DropdownSelectProps) {
  const reactId = useId()
  const listboxId = `${reactId}-listbox`
  const searchId = `${reactId}-search`
  const baseId = idProp ?? `dropdown-${reactId.replace(/:/g, "")}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [fixedPanelStyle, setFixedPanelStyle] = useState<CSSProperties>({})
  const [searchQuery, setSearchQuery] = useState("")

  const flatOptions = useMemo(() => {
    if (sections?.length) return sections.flatMap((s) => s.options)
    return options
  }, [sections, options])

  const visibleOptions = useMemo(() => {
    if (!searchable) return flatOptions
    const q = searchQuery.trim().toLowerCase()
    if (!q) return flatOptions
    return flatOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [searchable, flatOptions, searchQuery])

  const countableOptions = useMemo(
    () =>
      flatOptions.filter(
        (o) => !o.disabled && String(o.value ?? "").trim() !== "",
      ),
    [flatOptions],
  )

  const resolvedSearchField = useMemo(() => {
    if (!searchShowOptionCountHint || !searchable) {
      return {
        placeholder: searchPlaceholder,
        ariaLabel: searchAriaLabel ?? searchPlaceholder,
      }
    }
    const total = countableOptions.length
    if (total === 0) {
      return {
        placeholder: searchPlaceholder,
        ariaLabel: searchAriaLabel ?? searchPlaceholder,
      }
    }
    const q = searchQuery.trim().toLowerCase()
    const visibleCount = q
      ? countableOptions.filter((o) =>
          o.label.toLowerCase().includes(q),
        ).length
      : total
    const segment = q ? `${visibleCount} of ${total}` : `${total}`
    const placeholder = `${searchPlaceholder} (${segment})`
    const ariaLabel =
      searchAriaLabel != null && searchAriaLabel.trim() !== ""
        ? `${searchAriaLabel.trim()}: ${segment}`
        : placeholder
    return { placeholder, ariaLabel }
  }, [
    searchShowOptionCountHint,
    searchable,
    countableOptions,
    searchQuery,
    searchPlaceholder,
    searchAriaLabel,
  ])

  const showSectionLayout = Boolean(sections?.length) && !searchable

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectedOption = flatOptions.find((o) => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder
  const isPlaceholder = !selectedOption

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  useEffect(() => {
    if (!open) setSearchQuery("")
  }, [open])

  useLayoutEffect(() => {
    if (!open || !searchable) return
    searchInputRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    if (!open || !searchable) return
    setActiveIndex((i) => {
      if (visibleOptions.length === 0) return -1
      if (i >= visibleOptions.length) return visibleOptions.length - 1
      if (i < 0) return 0
      return i
    })
  }, [searchQuery, visibleOptions.length, open, searchable])

  useEffect(() => {
    if (!open) return
    function onDoc(e: PointerEvent) {
      const root = rootRef.current
      const panel = panelRef.current
      if (!(e.target instanceof Node)) return
      if (root?.contains(e.target)) return
      if (panel?.contains(e.target)) return
      close()
    }
    document.addEventListener("pointerdown", onDoc, true)
    return () => document.removeEventListener("pointerdown", onDoc, true)
  }, [open, close])

  /** Keep keyboard highlight visible without calling `scrollIntoView` (that scrolls the whole page and can cause horizontal drift + white gaps). */
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return
    const panel = panelRef.current
    const opt = optionRefs.current[activeIndex]
    if (!panel || !opt) return
    const edge = 6
    const ot = opt.offsetTop
    const ob = ot + opt.offsetHeight
    const st = panel.scrollTop
    const sh = panel.clientHeight
    if (ot < st + edge) panel.scrollTop = Math.max(0, ot - edge)
    else if (ob > st + sh - edge) panel.scrollTop = ob - sh + edge
  }, [activeIndex, open])

  const syncFixedPanelPosition = useCallback(() => {
    if (!useFixedPanel || !open) return
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 4
    const pad = 8
    const panel = panelRef.current
    const measuredW = panel?.offsetWidth ?? 0
    const width = Math.min(Math.max(r.width, measuredW), vw - pad * 2)
    let left = r.left
    if (left + width > vw - pad) left = vw - pad - width
    if (left < pad) left = pad

    const spaceBelow = vh - r.bottom - gap - pad
    const spaceAbove = r.top - gap - pad
    const openBelow = spaceBelow >= 96 || spaceBelow >= spaceAbove
    const available = openBelow ? spaceBelow : spaceAbove
    const maxHeight = Math.min(280, Math.max(48, available))
    let top = openBelow ? r.bottom + gap : r.top - gap - maxHeight
    if (panel) {
      const ph = Math.min(panel.offsetHeight, maxHeight)
      if (top + ph > vh - pad) top = Math.max(pad, vh - pad - ph)
    }
    top = Math.max(pad, Math.min(top, vh - pad - maxHeight))

    const next = {
      position: "fixed" as const,
      top,
      left,
      width,
      minWidth: 0,
      maxWidth: `calc(100vw - ${pad * 2}px)`,
      maxHeight,
      boxSizing: "border-box" as const,
      zIndex: 13000,
      overflowX: "hidden" as const,
      overflowY: "auto" as const,
    }
    setFixedPanelStyle((prev) => {
      if (
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight
      )
        return prev
      return next
    })
  }, [useFixedPanel, open])

  useLayoutEffect(() => {
    syncFixedPanelPosition()
    if (!open || !useFixedPanel) return
    const panel = panelRef.current
    if (!panel || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => syncFixedPanelPosition())
    ro.observe(panel)
    return () => ro.disconnect()
  }, [syncFixedPanelPosition, open, value, flatOptions.length, searchQuery, useFixedPanel])

  useEffect(() => {
    if (!open || !useFixedPanel) return
    function onScrollOrResize() {
      syncFixedPanelPosition()
    }
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
    }
  }, [open, useFixedPanel, syncFixedPanelPosition])

  function applyOption(opt: (typeof flatOptions)[number] | undefined) {
    if (!opt || opt.disabled) return
    onChange(opt.value)
    close()
  }

  /** Index into `visibleOptions` (filtered list when `searchable`). */
  function selectByVisibleIndex(i: number) {
    applyOption(visibleOptions[i])
  }

  /** Index into full `flatOptions` (section layout / non-search). */
  function selectByFlatIndex(i: number) {
    applyOption(flatOptions[i])
  }

  function moveActive(delta: number) {
    setActiveIndex((i) => {
      const len = visibleOptions.length
      if (!len) return -1
      if (delta > 0) {
        let next = i < 0 ? 0 : i + 1
        while (next < len && visibleOptions[next]?.disabled) next += 1
        return next >= len ? i : next
      }
      let next = i <= 0 ? 0 : i - 1
      while (next > 0 && visibleOptions[next]?.disabled) next -= 1
      return next < 0 ? 0 : next
    })
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (disabled) return
    const len = visibleOptions.length
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(len ? 0 : -1)
        return
      }
      moveActive(1)
    }
    if (e.key === "ArrowUp" && open) {
      e.preventDefault()
      moveActive(-1)
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        const idx = Math.max(
          0,
          visibleOptions.findIndex((o) => o.value === value),
        )
        setActiveIndex(idx >= 0 ? idx : 0)
        return
      }
      if (activeIndex >= 0) selectByVisibleIndex(activeIndex)
    }
    if (e.key === "Escape") {
      e.preventDefault()
      close()
    }
  }

  function onSearchKeyDown(e: KeyboardEvent) {
    const len = visibleOptions.length
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      e.stopPropagation()
      if (!len) return
      moveActive(1)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      e.stopPropagation()
      moveActive(-1)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      if (activeIndex >= 0) selectByVisibleIndex(activeIndex)
      else if (len === 1 && !visibleOptions[0]?.disabled)
        selectByVisibleIndex(0)
    }
  }

  function onListKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      close()
    }
  }

  let optionFlatIndex = 0

  const listbox = open ? (
    <ul
      ref={panelRef}
      id={listboxId}
      role="listbox"
      aria-labelledby={baseId}
      className={[
        "portal_dropdown_select_panel",
        useFixedPanel ? "portal_dropdown_select_panel--fixed" : "",
        panelClassName,
      ]
        .filter(Boolean)
        .join(" ")}
      style={useFixedPanel ? fixedPanelStyle : undefined}
      onKeyDown={onListKeyDown}
    >
      {header ? (
        <li className="portal_dropdown_select_header_slot" role="presentation">
          <button
            type="button"
            className="portal_dropdown_select_header_btn"
            onClick={() => {
              header.onClick()
              close()
            }}
          >
            <DropdownActionLabel label={header.label} />
          </button>
        </li>
      ) : null}

      {searchable ? (
        <li className="portal_dropdown_select_search_slot" role="presentation">
          <input
            ref={searchInputRef}
            id={searchId}
            type="search"
            className="portal_dropdown_select_search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={resolvedSearchField.placeholder}
            aria-label={resolvedSearchField.ariaLabel}
            title={
              searchShowOptionCountHint && searchable
                ? resolvedSearchField.placeholder
                : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </li>
      ) : null}

      {searchable && searchQuery.trim() && visibleOptions.length === 0 ? (
        <li className="portal_dropdown_select_empty" role="presentation">
          No matches
        </li>
      ) : null}

      {showSectionLayout
        ? sections!.map((section, si) => (
            <Fragment key={`sec-${section.heading}-${si}`}>
              <li
                className="portal_dropdown_select_heading"
                role="presentation"
              >
                {section.heading}
              </li>
              {section.options.map((opt, oi) => {
                const i = optionFlatIndex++
                const selected = opt.value === value
                const active = i === activeIndex
                return (
                  <li key={`${opt.value}-${si}-${oi}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={opt.disabled}
                      data-active={active ? "true" : undefined}
                      ref={(el) => {
                        optionRefs.current[i] = el
                      }}
                      className={[
                        "portal_dropdown_select_option",
                        opt.labelContent
                          ? "portal_dropdown_select_option--rich"
                          : "",
                        selected ? "portal_dropdown_select_option_selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => selectByFlatIndex(i)}
                      aria-label={
                        opt.labelContent && opt.disabled
                          ? `${opt.label}, already added`
                          : undefined
                      }
                    >
                      {opt.labelContent ?? opt.label}
                    </button>
                  </li>
                )
              })}
            </Fragment>
          ))
        : visibleOptions.map((opt, i) => {
            const selected = opt.value === value
            const active = i === activeIndex
            return (
              <li key={`${opt.value}-${i}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={opt.disabled}
                  data-active={active ? "true" : undefined}
                  ref={(el) => {
                    optionRefs.current[i] = el
                  }}
                  className={[
                    "portal_dropdown_select_option",
                    opt.labelContent
                      ? "portal_dropdown_select_option--rich"
                      : "",
                    selected ? "portal_dropdown_select_option_selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectByVisibleIndex(i)}
                  aria-label={
                    opt.labelContent && opt.disabled
                      ? `${opt.label}, already added`
                      : undefined
                  }
                >
                  {opt.labelContent ?? opt.label}
                </button>
              </li>
            )
          })}

      {footer ? (
        <li className="portal_dropdown_select_footer" role="presentation">
          <button
            type="button"
            className="portal_dropdown_select_footer_btn"
            onClick={() => {
              footer.onClick()
              close()
            }}
          >
            <DropdownActionLabel label={footer.label} />
          </button>
        </li>
      ) : null}
    </ul>
  ) : null

  return (
    <div
      ref={rootRef}
      className={["portal_dropdown_select", className].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        ref={triggerRef}
        id={baseId}
        name={name}
        className={[
          "portal_dropdown_select_trigger",
          invalid ? "portal_dropdown_select_trigger_invalid" : "",
          triggerClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onClick={() => {
          if (disabled) return
          setOpen((o) => !o)
          if (!open) {
            const idx = visibleOptions.findIndex((o) => o.value === value)
            setActiveIndex(idx >= 0 ? idx : 0)
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          className={[
            "portal_dropdown_select_trigger_label",
            triggerContent ? "portal_dropdown_select_trigger_label--custom" : "",
            isPlaceholder ? "portal_dropdown_select_trigger_label_placeholder" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {triggerContent ?? displayLabel}
        </span>
        <span className="portal_dropdown_select_chevron" aria-hidden>
          <ChevronDown size={16} strokeWidth={2} />
        </span>
      </button>

      {open && useFixedPanel && listbox && typeof document !== "undefined"
        ? createPortal(listbox, document.body)
        : listbox}
    </div>
  )
}
