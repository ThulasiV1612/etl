import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SearchableSelectOption {
  id: string
  label: string
  searchText?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  isLoading?: boolean
  id?: string
  placeholder?: string
  emptyLabel?: string
  searchPlaceholder?: string
}

interface PanelPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  openUp: boolean
}

export function SearchableSelect({
  options,
  value,
  onChange,
  disabled = false,
  isLoading = false,
  id,
  placeholder = 'Select an option',
  emptyLabel = 'No options found',
  searchPlaceholder = 'Search...',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.id === value) || null

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) => {
      const haystack = `${option.label} ${option.searchText || ''} ${option.id}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [options, search])

  function updatePanelPosition() {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportPad = 12
    const preferredHeight = 280
    const spaceBelow = window.innerHeight - rect.bottom - viewportPad
    const spaceAbove = rect.top - viewportPad
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      140,
      Math.min(preferredHeight, openUp ? spaceAbove : spaceBelow)
    )

    setPanelPosition({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight,
      openUp,
    })
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelPosition(null)
      return
    }
    updatePanelPosition()
  }, [isOpen, filtered.length])

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setIsOpen(false)
    }

    function handleReposition() {
      updatePanelPosition()
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [isOpen])

  const panel =
    isOpen && panelPosition
      ? createPortal(
          <div
            ref={panelRef}
            className="searchable-deal-panel searchable-deal-panel-portal"
            role="listbox"
            style={{
              top: panelPosition.openUp ? undefined : panelPosition.top,
              bottom: panelPosition.openUp
                ? window.innerHeight - panelPosition.top
                : undefined,
              left: panelPosition.left,
              width: panelPosition.width,
              maxHeight: panelPosition.maxHeight,
            }}
          >
            <input
              type="text"
              className="searchable-deal-search"
              value={search}
              autoFocus
              placeholder={searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsOpen(false)
              }}
            />
            <div
              className="searchable-deal-options"
              style={{ maxHeight: Math.max(100, panelPosition.maxHeight - 52) }}
            >
              <button
                type="button"
                className={`searchable-deal-option${!value ? ' active' : ''}`}
                onClick={() => {
                  onChange('')
                  setIsOpen(false)
                }}
              >
                Clear selection
              </button>
              {filtered.length ? (
                filtered.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`searchable-deal-option${option.id === value ? ' active' : ''}`}
                    onClick={() => {
                      onChange(option.id)
                      setIsOpen(false)
                    }}
                  >
                    <span className="searchable-deal-option-name">{option.label}</span>
                  </button>
                ))
              ) : (
                <p className="searchable-deal-empty">No matches for “{search}”</p>
              )}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div className="searchable-deal-select" ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="searchable-deal-trigger"
        disabled={disabled || isLoading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled || isLoading) return
          setIsOpen((open) => !open)
          setSearch('')
        }}
      >
        <span className="searchable-deal-trigger-text">
          {isLoading
            ? 'Loading...'
            : selected
              ? selected.label
              : options.length
                ? placeholder
                : emptyLabel}
        </span>
        <span className="searchable-deal-caret" aria-hidden>▾</span>
      </button>
      {panel}
    </div>
  )
}
