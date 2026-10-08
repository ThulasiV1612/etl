import { useEffect, type RefObject } from "react"
import {
  attachHorizontalScrollBehavior,
  type HorizontalScrollRegionOptions,
} from "../utils/horizontalScrollRegion"

/**
 * Attach shared hover / edge / drag horizontal scroll to a table scroller.
 * Re-binds when `deps` change (e.g. row count / measure key).
 */
export function useHorizontalScrollRegion(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
  options?: HorizontalScrollRegionOptions,
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return attachHorizontalScrollBehavior(el, options)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps)
}
