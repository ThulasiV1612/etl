import { ChevronDown, Plus } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react"
import { createPortal } from "react-dom"
import "../../../../../common/components/dropdown-select/dropdown-select.css"

type CreatableDropdownFieldProps = {
  value: string
  options: string[]
  onChange: (value: string) => void
  /** Called when a brand-new value is committed so the parent can persist it. */
  onOptionAdded?: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  id?: string
}

function normalizeOption(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

/**
 * Input + dropdown: type freely, pick an existing option, or add a new value
 * that joins the dropdown list for next time.
 */
export function CreatableDropdownField({
  value,
  options,
  onChange,
  onOptionAdded,
  placeholder = "Type or select…",
  ariaLabel,
  disabled = false,
  invalid = false,
  className = "",
  id: idProp,
}: CreatableDropdownFieldProps) {
  const reactId = useId()
  const listboxId = `${reactId}-listbox`
  const baseId = idProp ?? `creatable-${reactId.replace(/:/g, "")}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [highlight, setHighlight] = useState(0)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  useEffect(() => {
    if (!open) setDraft(value)
  }, [value, open])

  const uniqueOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of options) {
      const t = normalizeOption(raw)
      if (!t) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
    return out
  }, [options])

  const query = normalizeOption(draft)
  const filtered = useMemo(() => {
    if (!query) return uniqueOptions
    const q = query.toLowerCase()
    return uniqueOptions.filter((o) => o.toLowerCase().includes(q))
  }, [uniqueOptions, query])

  const exactMatch = useMemo(
    () =>
      uniqueOptions.some((o) => o.toLowerCase() === query.toLowerCase()) &&
      query.length > 0,
    [uniqueOptions, query],
  )

  const canCreate = query.length > 0 && !exactMatch
  const rows = useMemo(() => {
    type DropdownRow =
      | { kind: "option"; label: string; value: string }
      | { kind: "create"; label: string; value: string }
    const list: DropdownRow[] = filtered.map((label) => ({
      kind: "option" as const,
      label,
      value: label,
    }))
    if (canCreate)
      list.push({
        kind: "create" as const,
        label: `Add “${query}”`,
        value: query,
      })
    return list
  }, [filtered, canCreate, query])

  const close = useCallback(() => {
    setOpen(false)
    setHighlight(0)
  }, [])

  const commit = useCallback(
    (nextRaw: string, { addIfNew = true }: { addIfNew?: boolean } = {}) => {
      const next = normalizeOption(nextRaw)
      if (!next) {
        onChange("")
        setDraft("")
        close()
        return
      }
      const exists = uniqueOptions.some(
        (o) => o.toLowerCase() === next.toLowerCase(),
      )
      const resolved =
        uniqueOptions.find((o) => o.toLowerCase() === next.toLowerCase()) ??
        next
      onChange(resolved)
      setDraft(resolved)
      if (addIfNew && !exists) onOptionAdded?.(resolved)
      close()
    },
    [close, onChange, onOptionAdded, uniqueOptions],
  )

  useLayoutEffect(() => {
    if (!open) return
    function sync() {
      const trigger = wrapRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      const r = trigger.getBoundingClientRect()
      const gap = 4
      const maxH = Math.min(280, window.innerHeight - 16)
      let top = r.bottom + gap
      if (top + Math.min(panel.scrollHeight || 160, maxH) > window.innerHeight - 8)
        top = Math.max(8, r.top - gap - Math.min(panel.scrollHeight || 160, maxH))
      setPanelStyle({
        position: "fixed",
        top,
        left: r.left,
        width: Math.max(r.width, 12 * 16),
        maxHeight: maxH,
        zIndex: 12000,
      })
    }
    sync()
    const raf = requestAnimationFrame(sync)
    window.addEventListener("resize", sync)
    window.addEventListener("scroll", sync, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", sync)
      window.removeEventListener("scroll", sync, true)
    }
  }, [open, rows.length])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      const next = normalizeOption(draft)
      if (next && next !== normalizeOption(value)) commit(next)
      else {
        setDraft(value)
        close()
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open, draft, value, commit, close])

  useEffect(() => {
    if (!open) return
    setHighlight(0)
  }, [open, query])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlight((h) => Math.min(h + 1, Math.max(0, rows.length - 1)))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlight((h) => Math.max(0, h - 1))
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (open && rows[highlight]) {
        commit(rows[highlight]!.value)
        return
      }
      commit(draft)
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      setDraft(value)
      close()
    }
  }

  return (
    <div
      ref={wrapRef}
      className={[
        "portal_dropdown_select",
        "ds_creatable_dropdown",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "ds_creatable_dropdown_control",
          open ? "is-open" : "",
          invalid ? "is-invalid" : "",
          disabled ? "is-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          ref={inputRef}
          id={baseId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder={placeholder}
          value={open ? draft : value}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => {
            setDraft(value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className="ds_creatable_dropdown_input"
        />
        <button
          type="button"
          className="ds_creatable_dropdown_chevron"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? "Close type list" : "Open type list"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (disabled) return
            if (open) {
              close()
              return
            }
            setDraft(value)
            setOpen(true)
            inputRef.current?.focus()
          }}
        >
          <ChevronDown size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={panelRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel ?? "Options"}
              className="portal_dropdown_select_panel portal_dropdown_select_panel--fixed ds_creatable_dropdown_panel"
              style={panelStyle}
            >
              {rows.length === 0 ? (
                <li className="portal_dropdown_select_empty" role="presentation">
                  Type a value to add it
                </li>
              ) : (
                rows.map((row, i) => {
                  const selected =
                    row.kind === "option" &&
                    normalizeOption(value).toLowerCase() ===
                      row.value.toLowerCase()
                  const active = i === highlight
                  return (
                    <li key={`${row.kind}-${row.value}`} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={[
                          "portal_dropdown_select_option",
                          selected ? "is-selected" : "",
                          active ? "is-active" : "",
                          row.kind === "create"
                            ? "ds_creatable_dropdown_create"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onMouseEnter={() => setHighlight(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => commit(row.value)}
                      >
                        {row.kind === "create" ? (
                          <>
                            <Plus size={16} strokeWidth={2} aria-hidden />
                            <span>{row.label}</span>
                          </>
                        ) : (
                          row.label
                        )}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
