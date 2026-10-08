import type { ReactNode } from "react"
import "@/common/components/data-table/data-table.css"

export interface DealsPageCenteredLoaderProps {
  label: string
  pageClassName?: string
  children?: ReactNode
}

export function DealsPageCenteredLoader({
  label,
  pageClassName = "",
  children,
}: DealsPageCenteredLoaderProps) {
  return (
    <div
      className={`deals_list_page deals_detail_page deals_page_loader_center${pageClassName ? ` ${pageClassName}` : ""}`}
      aria-busy
    >
      <div
        className="deals_page_loading"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="data_table_loader_spinner" aria-hidden />
        <span className="deals_page_loading_text">{label}</span>
      </div>
      {children}
    </div>
  )
}
