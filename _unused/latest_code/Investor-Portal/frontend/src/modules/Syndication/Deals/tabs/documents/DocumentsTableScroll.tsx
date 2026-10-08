import { useEffect, useRef, type ReactNode } from "react"
import { FloatingTableHScroll } from "@/common/components/data-table/FloatingTableHScroll"
import { attachHorizontalScrollBehavior } from "@/common/utils/horizontalScrollRegion"

interface DocumentsTableScrollProps {
  active?: boolean
  children: ReactNode
}

export function DocumentsTableScroll({
  active = true,
  children,
}: DocumentsTableScrollProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    return attachHorizontalScrollBehavior(scroller, {
      hoverVerticalToHorizontal: false,
      edgeScroll: false,
    })
  }, [])

  return (
    <div className="deal_docs_ui_table_scroll_shell">
      <div className="deal_docs_ui_table_scroll" ref={scrollerRef}>
        {children}
      </div>
      <FloatingTableHScroll
        scrollerRef={scrollerRef}
        active={active}
        ariaLabel="Document columns"
      />
    </div>
  )
}
