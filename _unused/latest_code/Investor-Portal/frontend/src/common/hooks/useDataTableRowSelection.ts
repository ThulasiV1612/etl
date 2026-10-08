import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

export interface UseDataTableRowSelectionOptions<T> {
  /** Rows currently visible in the table (filtered list). */
  filteredRows: T[]
  getRowId: (row: T) => string
}

export function useDataTableRowSelection<T>({
  filteredRows,
  getRowId,
}: UseDataTableRowSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  const allSelected = useMemo(
    () =>
      filteredRows.length > 0 &&
      filteredRows.every((r) => selectedIds.has(getRowId(r))),
    [filteredRows, selectedIds, getRowId],
  )

  const someSelected = useMemo(
    () =>
      filteredRows.some((r) => selectedIds.has(getRowId(r))) && !allSelected,
    [filteredRows, selectedIds, allSelected, getRowId],
  )

  useLayoutEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = someSelected
  }, [someSelected, allSelected, filteredRows.length])

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(filteredRows.map((r) => getRowId(r)))
      const next = new Set<string>()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
      }
      if (next.size === prev.size) {
        for (const id of prev) {
          if (!next.has(id)) return next
        }
        return prev
      }
      return next
    })
  }, [filteredRows, getRowId])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAllFiltered = useCallback(() => {
    if (filteredRows.length === 0) return
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const r of filteredRows) next.delete(getRowId(r))
        return next
      })
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of filteredRows) next.add(getRowId(r))
      return next
    })
  }, [filteredRows, allSelected, getRowId])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectedRows = useMemo(
    () => filteredRows.filter((r) => selectedIds.has(getRowId(r))),
    [filteredRows, selectedIds, getRowId],
  )

  return {
    selectedIds,
    selectedRows,
    selectAllRef,
    allSelected,
    someSelected,
    toggleSelect,
    toggleSelectAllFiltered,
    clearSelection,
  }
}
