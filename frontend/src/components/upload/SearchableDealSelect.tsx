import { useEffect, useMemo, useRef, useState } from 'react'
import type { DealOption } from '../../types'

interface SearchableDealSelectProps {
  deals: DealOption[]
  value: string
  onChange: (dealId: string) => void
  disabled?: boolean
  isLoading?: boolean
  id?: string
}

export function SearchableDealSelect({
  deals,
  value,
  onChange,
  disabled = false,
  isLoading = false,
  id = 'dealId',
}: SearchableDealSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selectedDeal = deals.find((deal) => deal.id === value) || null

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return deals
    return deals.filter((deal) => {
      const name = String(deal.dealName || '').toLowerCase()
      const stage = String(deal.dealStage || '').toLowerCase()
      const dealId = String(deal.id || '').toLowerCase()
      return name.includes(query) || stage.includes(query) || dealId.includes(query)
    })
  }, [deals, search])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function formatDealLabel(deal: DealOption) {
    return deal.dealStage ? `${deal.dealName} (${deal.dealStage})` : deal.dealName
  }

  return (
    <div className="searchable-deal-select" ref={rootRef}>
      <button
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
            ? 'Loading deals...'
            : selectedDeal
              ? formatDealLabel(selectedDeal)
              : deals.length
                ? 'Select a deal name'
                : 'No deals found — upload a deal first'}
        </span>
        <span className="searchable-deal-caret" aria-hidden>▾</span>
      </button>

      {isOpen ? (
        <div className="searchable-deal-panel" role="listbox">
          <input
            type="text"
            className="searchable-deal-search"
            value={search}
            autoFocus
            placeholder="Search deal name..."
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsOpen(false)
            }}
          />
          <div className="searchable-deal-options">
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
            {filteredDeals.length ? (
              filteredDeals.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  className={`searchable-deal-option${deal.id === value ? ' active' : ''}`}
                  onClick={() => {
                    onChange(deal.id)
                    setIsOpen(false)
                  }}
                >
                  <span className="searchable-deal-option-name">{formatDealLabel(deal)}</span>
                </button>
              ))
            ) : (
              <p className="searchable-deal-empty">No deals match “{search}”</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
