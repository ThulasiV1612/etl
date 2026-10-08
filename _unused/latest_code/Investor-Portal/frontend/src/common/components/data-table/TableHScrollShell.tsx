import { useEffect, useRef, type ReactNode } from "react"
import { attachHorizontalScrollBehavior } from "../../utils/horizontalScrollRegion"
import { FloatingTableHScroll } from "./FloatingTableHScroll"

interface TableHScrollShellProps {
  children: ReactNode
  active?: boolean
  ariaLabel?: string
  className?: string
  scrollerClassName?: string
  syncKey?: string
}

/** Wrap any `<table>` so it gets the Documents-style left/right + track scroll. */
export function TableHScrollShell({
  children,
  active = true,
  ariaLabel = "Columns",
  className = "",
  scrollerClassName = "",
  syncKey = "",
}: TableHScrollShellProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    return attachHorizontalScrollBehavior(scroller, {
      hoverVerticalToHorizontal: false,
      edgeScroll: false,
    })
  }, [syncKey])

  return (
    <div className={`data_table_hscroll_shell ${className}`.trim()}>
      <div
        ref={scrollerRef}
        className={[
          "data_table_scroll_region",
          "data_table_scroll_region--floating-hscroll",
          scrollerClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
      <FloatingTableHScroll
        scrollerRef={scrollerRef}
        syncKey={syncKey}
        active={active}
        ariaLabel={ariaLabel}
      />
    </div>
  )
}
