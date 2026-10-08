import { useCallback, useState } from "react"
import { getSessionUserId } from "@/common/auth/sessionUserId"

/** Matches `DataTablePagination` default options. */
export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export const DEFAULT_TABLE_PAGE_SIZE = 50

const ALLOWED_PAGE_SIZES = new Set<number>(TABLE_PAGE_SIZE_OPTIONS)

const STORAGE_PREFIX = "sx_table_page_size:v1"

/** Separate keys so each table remembers its own rows-per-page. */
export const TABLE_PAGE_SIZE_ID = {
  contacts: "contacts",
  deals: "deals",
  dealInvestors: "deal-investors",
  dealMembers: "deal-members",
  generalPartners: "general-partners",
} as const

export type TablePageSizeId =
  (typeof TABLE_PAGE_SIZE_ID)[keyof typeof TABLE_PAGE_SIZE_ID]

function storageKeyForTable(tableId: TablePageSizeId): string | null {
  const userId = getSessionUserId().trim()
  if (!userId) return null
  return `${STORAGE_PREFIX}:${userId}:${tableId}`
}

function parsePageSize(raw: string | null): number | null {
  if (raw == null || !raw.trim()) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || !ALLOWED_PAGE_SIZES.has(n)) return null
  return n
}

export function readStoredTablePageSize(
  tableId: TablePageSizeId,
  fallback = DEFAULT_TABLE_PAGE_SIZE,
): number {
  const key = storageKeyForTable(tableId)
  if (!key || typeof localStorage === "undefined") return fallback
  try {
    const stored = parsePageSize(localStorage.getItem(key))
    return stored ?? fallback
  } catch {
    return fallback
  }
}

export function persistTablePageSize(
  tableId: TablePageSizeId,
  pageSize: number,
): void {
  const key = storageKeyForTable(tableId)
  if (!key || typeof localStorage === "undefined") return
  if (!ALLOWED_PAGE_SIZES.has(pageSize)) return
  try {
    localStorage.setItem(key, String(pageSize))
  } catch {
    /* quota / private mode */
  }
}

/**
 * Rows-per-page that survives logout and is restored on the next login
 * for this user (same browser). Each table id is stored independently.
 */
export function usePersistedTablePageSize(tableId: TablePageSizeId) {
  const [pageSize, setPageSizeState] = useState(() =>
    readStoredTablePageSize(tableId),
  )

  const setPageSize = useCallback(
    (nextSize: number) => {
      const size = ALLOWED_PAGE_SIZES.has(nextSize)
        ? nextSize
        : DEFAULT_TABLE_PAGE_SIZE
      setPageSizeState(size)
      persistTablePageSize(tableId, size)
    },
    [tableId],
  )

  return [pageSize, setPageSize] as const
}
