import { X } from "lucide-react"
import type { ReactNode } from "react"

export function ExportModalFooter({
  onClose,
  children,
}: {
  onClose: () => void
  children: ReactNode
}) {
  return (
    <footer className="deals_export_modal_footer">
      <button
        type="button"
        className="um_btn_secondary"
        onClick={onClose}
      >
        <X size={16} strokeWidth={2} aria-hidden />
        Close
      </button>
      <div className="deals_export_modal_footer_trailing">{children}</div>
    </footer>
  )
}
